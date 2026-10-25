"""SMS gateway: sends OTP / reset SMS through the "Passerelle SMS" Android app.

The phone app (universal relay app) logs in with phone + password + connection key,
announces its SIMs (country ISO, operator, label) and polls for queued messages.
Server side: relay accounts are managed by the admin, routing is automatic per
country (with several SIMs per country, failover, and an optional "all countries"
fallback relay), and OTP delivery falls back to / prefers it via `send_sms_via_gateway`.
"""
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from jose import jwt, JWTError
from pydantic import BaseModel, Field

from config.countries import COUNTRIES
from database import (
    db, gen_id, hash_pw, verify_pw, get_admin, get_admin_with_kyc, JWT_SECRET, JWT_ALGORITHM,
)
from utils.helpers import now_iso

router = APIRouter(prefix="/api")

ONLINE_WINDOW = timedelta(seconds=90)
JOB_TTL = timedelta(minutes=10)
CLAIM_LEASE = timedelta(seconds=90)
MAX_ATTEMPTS = 3
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCK = timedelta(minutes=15)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _norm_phone(value: str) -> str:
    return re.sub(r"[\s\-().]", "", value or "")


def country_from_phone(phone: str) -> Optional[str]:
    """ISO country code from the international prefix (longest prefix wins)."""
    digits = _norm_phone(phone).lstrip("+")
    best, best_len = None, 0
    for code, info in COUNTRIES.items():
        prefix = (info.get("phone_prefix") or "").lstrip("+")
        if prefix and digits.startswith(prefix) and len(prefix) > best_len:
            best, best_len = code, len(prefix)
    return best


def _is_online(relay: dict) -> bool:
    if not relay.get("online") or not relay.get("last_seen"):
        return False
    try:
        seen = datetime.fromisoformat(relay["last_seen"])
    except (TypeError, ValueError):
        return False
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    return _now() - seen < ONLINE_WINDOW


def _public_relay(relay: dict) -> dict:
    return {
        "id": relay["id"],
        "phone": relay["phone"],
        "name": relay.get("name", ""),
        "active": relay.get("active", True),
        "all_states": relay.get("all_states", False),
        "priority": relay.get("priority", 1),
        "online": _is_online(relay),
        "last_seen": relay.get("last_seen"),
        "countries": relay.get("countries", []),
        "sims": relay.get("sims", []),
        "created_at": relay.get("created_at"),
    }


# ------------------------------------------------------------------ models
class RelayCreateReq(BaseModel):
    phone: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=80)
    all_states: bool = False
    priority: int = Field(default=1, ge=1, le=99)


class RelayUpdateReq(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    active: Optional[bool] = None
    all_states: Optional[bool] = None
    priority: Optional[int] = Field(default=None, ge=1, le=99)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


class GatewaySettingsReq(BaseModel):
    enabled: bool = True
    sms_first: bool = False


class TestSmsReq(BaseModel):
    to: str
    country: Optional[str] = None


class RelayLoginReq(BaseModel):
    phone: str = Field(min_length=4, max_length=32)
    password: str = Field(min_length=1, max_length=256)
    connection_key: str = Field(min_length=1, max_length=256)


class SimIn(BaseModel):
    id: str
    country: str = ""
    country_iso: str = ""
    operator: str = ""
    phone: str = ""
    label: str = ""
    slot: Optional[int] = None


class ConfigIn(BaseModel):
    countries: list[str] = Field(default_factory=list, max_length=250)
    sims: list[SimIn] = Field(default_factory=list, max_length=10)


class HeartbeatIn(BaseModel):
    online: bool


class ResultIn(BaseModel):
    sim_id: str
    claim_id: str
    status: str
    error: str = ""


# ------------------------------------------------------------------ settings
async def get_gateway_settings() -> dict:
    doc = await db.sms_gateway_settings.find_one({"_id": "main"}) or {}
    return {"enabled": doc.get("enabled", True), "sms_first": doc.get("sms_first", False)}


@router.get("/admin/sms-gateway/settings")
async def read_settings(adm=Depends(get_admin)):
    return await get_gateway_settings()


@router.put("/admin/sms-gateway/settings")
async def save_settings(req: GatewaySettingsReq, adm=Depends(get_admin_with_kyc)):
    await db.sms_gateway_settings.update_one(
        {"_id": "main"}, {"$set": {"enabled": req.enabled, "sms_first": req.sms_first}}, upsert=True)
    return await get_gateway_settings()


# ------------------------------------------------------------------ admin API
@router.get("/admin/sms-gateway/relays")
async def list_relays(adm=Depends(get_admin)):
    relays = await db.sms_gateway_relays.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    stats = {}
    async for row in db.sms_gateway_jobs.aggregate([
        {"$group": {"_id": {"relay_id": "$relay_id", "status": "$status"}, "n": {"$sum": 1}}}
    ]):
        stats.setdefault(row["_id"]["relay_id"], {})[row["_id"]["status"].lower()] = row["n"]
    out = []
    for relay in relays:
        item = _public_relay(relay)
        item["stats"] = stats.get(relay["id"], {})
        out.append(item)
    return {"relays": out, "settings": await get_gateway_settings()}


@router.post("/admin/sms-gateway/relays")
async def create_relay(req: RelayCreateReq, adm=Depends(get_admin_with_kyc)):
    phone = _norm_phone(req.phone)
    if await db.sms_gateway_relays.find_one({"phone": phone}):
        raise HTTPException(409, "Ce numéro de téléphone est déjà utilisé")
    connection_key = secrets.token_urlsafe(24)
    relay = {
        "id": gen_id(), "phone": phone, "name": req.name.strip(),
        "password_hash": hash_pw(req.password), "key_hash": hash_pw(connection_key),
        "active": True, "all_states": req.all_states, "priority": req.priority,
        "token_version": 0, "countries": [], "sims": [], "online": False, "last_seen": None,
        "created_at": now_iso(), "created_by": adm["id"],
    }
    await db.sms_gateway_relays.insert_one(relay)
    return {"relay": _public_relay(relay), "connection_key": connection_key}


@router.put("/admin/sms-gateway/relays/{relay_id}")
async def update_relay(relay_id: str, req: RelayUpdateReq, adm=Depends(get_admin_with_kyc)):
    relay = await db.sms_gateway_relays.find_one({"id": relay_id})
    if not relay:
        raise HTTPException(404, "Compte relais introuvable")
    changes = {}
    inc = {}
    if req.name is not None:
        changes["name"] = req.name.strip()
    if req.active is not None:
        changes["active"] = req.active
        if not req.active:
            inc["token_version"] = 1
    if req.all_states is not None:
        changes["all_states"] = req.all_states
    if req.priority is not None:
        changes["priority"] = req.priority
    if req.password:
        changes["password_hash"] = hash_pw(req.password)
        inc["token_version"] = 1
    update = {}
    if changes:
        update["$set"] = changes
    if inc:
        update["$inc"] = inc
    if update:
        await db.sms_gateway_relays.update_one({"id": relay_id}, update)
    return {"relay": _public_relay(await db.sms_gateway_relays.find_one({"id": relay_id}))}


@router.post("/admin/sms-gateway/relays/{relay_id}/rotate-key")
async def rotate_key(relay_id: str, adm=Depends(get_admin_with_kyc)):
    if not await db.sms_gateway_relays.find_one({"id": relay_id}):
        raise HTTPException(404, "Compte relais introuvable")
    connection_key = secrets.token_urlsafe(24)
    await db.sms_gateway_relays.update_one(
        {"id": relay_id}, {"$set": {"key_hash": hash_pw(connection_key)}, "$inc": {"token_version": 1}})
    return {"connection_key": connection_key}


@router.delete("/admin/sms-gateway/relays/{relay_id}")
async def delete_relay(relay_id: str, adm=Depends(get_admin_with_kyc)):
    result = await db.sms_gateway_relays.delete_one({"id": relay_id})
    if not result.deleted_count:
        raise HTTPException(404, "Compte relais introuvable")
    return {"message": "Compte relais supprimé"}


@router.post("/admin/sms-gateway/test")
async def test_sms(req: TestSmsReq, adm=Depends(get_admin_with_kyc)):
    to = _norm_phone(req.to)
    if not re.fullmatch(r"\+?[0-9]{6,20}", to):
        raise HTTPException(400, "Numéro destinataire invalide")
    code = f"{secrets.randbelow(1000000):06d}"
    result = await send_sms_via_gateway(
        to, f"Monity World: code de test {code}. Valide 10 minutes.", country=req.country, force=True)
    if not result.get("success"):
        raise HTTPException(404, result.get("error") or "Aucune SIM relais disponible")
    return result


# ------------------------------------------------------------------ routing + queue
async def _pick_sim(iso: Optional[str], exclude: set) -> Optional[tuple]:
    """Best online relay SIM: country match first, then all-states relays; lowest priority/load."""
    relays = await db.sms_gateway_relays.find({"active": True}).to_list(200)
    candidates = []
    for relay in relays:
        if not _is_online(relay):
            continue
        for sim in relay.get("sims", []):
            if (relay["id"], sim["id"]) in exclude:
                continue
            exact = bool(iso) and (sim.get("country_iso") or "").upper() == iso.upper()
            if exact or relay.get("all_states"):
                candidates.append((0 if exact else 1, relay.get("priority", 1),
                                   sim.get("sent_count", 0), relay, sim))
    if not candidates:
        return None
    candidates.sort(key=lambda c: (c[0], c[1], c[2]))
    return candidates[0][3], candidates[0][4]


async def send_sms_via_gateway(phone: str, text: str, country: Optional[str] = None,
                               force: bool = False, exclude: Optional[set] = None,
                               attempts: int = 0) -> dict:
    """Queue an SMS on the best available gateway SIM. Never raises."""
    try:
        settings = await get_gateway_settings()
        if not settings["enabled"] and not force:
            return {"success": False, "error": "Passerelle SMS désactivée"}
        phone = _norm_phone(phone)
        if not re.fullmatch(r"\+?[0-9]{6,20}", phone):
            return {"success": False, "error": "Numéro invalide"}
        iso = (country or "").upper() or country_from_phone(phone)
        picked = await _pick_sim(iso, exclude or set())
        if not picked:
            return {"success": False, "error": "Aucune SIM relais en ligne pour ce pays"}
        relay, sim = picked
        now = _now()
        await db.sms_gateway_jobs.insert_one({
            "id": gen_id(), "relay_id": relay["id"], "sim_id": sim["id"], "country": iso,
            "operator": sim.get("operator", ""), "to": phone, "message": text,
            "status": "QUEUED", "attempts": attempts, "tried": [[relay["id"], sim["id"]]] + [
                list(e) for e in (exclude or set())],
            "created_at": _iso(now), "expires_at": _iso(now + JOB_TTL),
        })
        return {"success": True, "via": "sms_gateway", "operator": sim.get("operator", "")}
    except Exception as exc:  # delivery must never break the calling OTP flow
        return {"success": False, "error": str(exc)}


# ------------------------------------------------------------------ relay (phone app) API
async def _current_relay(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Jeton requis")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Jeton invalide ou expiré")
    if payload.get("role") != "sms_gateway":
        raise HTTPException(401, "Jeton invalide")
    relay = await db.sms_gateway_relays.find_one({"id": payload.get("sub")})
    if not relay or not relay.get("active") or payload.get("ver") != relay.get("token_version", 0):
        raise HTTPException(401, "Compte relais inactif ou session révoquée")
    return relay


@router.post("/relay/auth/login")
async def relay_login(body: RelayLoginReq):
    phone = _norm_phone(body.phone)
    relay = await db.sms_gateway_relays.find_one({"phone": phone, "active": True})
    if relay and relay.get("locked_until"):
        if datetime.fromisoformat(relay["locked_until"]) > _now():
            raise HTTPException(429, "Trop de tentatives. Réessayez dans 15 minutes.")
    ok = bool(relay) and verify_pw(body.password, relay["password_hash"]) \
        and verify_pw(body.connection_key.strip(), relay["key_hash"])
    if not ok:
        if relay:
            fails = relay.get("failed_attempts", 0) + 1
            update = {"failed_attempts": fails}
            if fails >= LOGIN_MAX_ATTEMPTS:
                update = {"failed_attempts": 0, "locked_until": _iso(_now() + LOGIN_LOCK)}
            await db.sms_gateway_relays.update_one({"id": relay["id"]}, {"$set": update})
        raise HTTPException(401, "Identifiants ou clé de connexion invalides")
    expires = _now() + timedelta(hours=12)
    token = jwt.encode({"sub": relay["id"], "role": "sms_gateway", "ver": relay.get("token_version", 0),
                        "exp": expires}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    await db.sms_gateway_relays.update_one(
        {"id": relay["id"]}, {"$set": {"failed_attempts": 0, "locked_until": None}})
    return {"access_token": token, "token_type": "bearer", "expires_at": _iso(expires),
            "relay": _public_relay(relay)}


@router.get("/relay/me")
async def relay_me(relay: dict = Depends(_current_relay)):
    return {"relay": _public_relay(relay)}


@router.put("/relay/config")
async def relay_config(body: ConfigIn, relay: dict = Depends(_current_relay)):
    old = {s["id"]: s for s in relay.get("sims", [])}
    sims = []
    for s in body.sims:
        prev = old.get(s.id, {})
        data = s.model_dump()
        data["country_iso"] = data["country_iso"].upper()[:3]
        data["operator"] = data["operator"][:80]
        data["sent_count"] = prev.get("sent_count", 0)
        data["failed_count"] = prev.get("failed_count", 0)
        sims.append(data)
    await db.sms_gateway_relays.update_one({"id": relay["id"]}, {"$set": {
        "countries": body.countries, "sims": sims, "last_seen": now_iso()}})
    return {"ok": True, "relay": _public_relay(await db.sms_gateway_relays.find_one({"id": relay["id"]}))}


@router.post("/relay/heartbeat")
async def relay_heartbeat(body: HeartbeatIn, relay: dict = Depends(_current_relay)):
    await db.sms_gateway_relays.update_one(
        {"id": relay["id"]}, {"$set": {"online": body.online, "last_seen": now_iso()}})
    return {"ok": True, "online": body.online}


@router.get("/relay/messages")
async def relay_messages(sim_id: str, relay: dict = Depends(_current_relay)):
    now = _now()
    await db.sms_gateway_relays.update_one(
        {"id": relay["id"]}, {"$set": {"online": True, "last_seen": _iso(now)}})
    await db.sms_gateway_jobs.update_many(
        {"relay_id": relay["id"], "status": {"$in": ["QUEUED", "CLAIMED"]}, "expires_at": {"$lte": _iso(now)}},
        {"$set": {"status": "EXPIRED"}})
    out = []
    for _ in range(10):
        claim = secrets.token_urlsafe(12)
        job = await db.sms_gateway_jobs.find_one_and_update(
            {"relay_id": relay["id"], "sim_id": sim_id, "expires_at": {"$gt": _iso(now)},
             "$or": [{"status": "QUEUED"}, {"status": "CLAIMED", "claim_expires": {"$lt": _iso(now)}}]},
            {"$set": {"status": "CLAIMED", "claim_id": claim, "claim_expires": _iso(now + CLAIM_LEASE)}},
            sort=[("created_at", 1)])
        if not job:
            break
        out.append({"id": job["id"], "claim_id": claim, "to": job["to"], "message": job["message"]})
    return {"messages": out}


@router.post("/relay/messages/{job_id}/result")
async def relay_result(job_id: str, body: ResultIn, relay: dict = Depends(_current_relay)):
    job = await db.sms_gateway_jobs.find_one(
        {"id": job_id, "relay_id": relay["id"], "claim_id": body.claim_id, "status": "CLAIMED"})
    if not job:
        raise HTTPException(404, "Message introuvable ou déjà traité")
    sent = body.status.upper() == "SENT"
    await db.sms_gateway_jobs.update_one({"id": job_id}, {"$set": {
        "status": "SENT" if sent else "FAILED", "error": "" if sent else body.error[:200], "done_at": now_iso()}})
    await db.sms_gateway_relays.update_one(
        {"id": relay["id"], "sims.id": job["sim_id"]},
        {"$inc": {"sims.$.sent_count" if sent else "sims.$.failed_count": 1}})
    await db.message_log.insert_one({
        "id": gen_id(), "channel": "sms", "provider": f"Passerelle {job.get('operator', '')}".strip(),
        "to": (job.get("to") or "")[:4] + "***", "subject": "SMS gateway",
        "status": "sent" if sent else "failed", "at": now_iso()})
    if not sent and job.get("attempts", 0) + 1 < MAX_ATTEMPTS:
        tried = {tuple(t) for t in job.get("tried", [])}
        await send_sms_via_gateway(job["to"], job["message"], country=job.get("country"),
                                   exclude=tried, attempts=job.get("attempts", 0) + 1)
    return {"ok": True}
