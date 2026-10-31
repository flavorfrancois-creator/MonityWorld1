"""Self-service account changes (OTP verified) and account deletion lifecycle.

Deleted accounts are soft-deleted: access is cut immediately, the phone number and
e-mail stay reserved for BLOCK_DAYS (3 months), and the owner can restore the
account for RESTORE_DAYS (6 months). After that the data is erased for good.
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

BLOCK_DAYS = 90
RESTORE_DAYS = 180
MAX_CODE_ATTEMPTS = 5
PURPOSES = ("delete_account", "change_email", "change_phone", "restore_account")


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def gen_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


def _parse(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


async def issue_code(db, user_id: str, purpose: str, minutes: int, payload: dict = None) -> str:
    """Store a fresh hashed one-time code (replacing any previous one for this purpose)."""
    code = gen_code()
    await db.account_otps.delete_many({"user_id": user_id, "purpose": purpose})
    await db.account_otps.insert_one({
        "user_id": user_id,
        "purpose": purpose,
        "code_hash": _hash(code),
        "payload": payload or {},
        "attempts": 0,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return code


async def consume_code(db, user_id: str, purpose: str, code: str):
    """Return the stored payload when the code is valid, else raise ValueError(message)."""
    doc = await db.account_otps.find_one({"user_id": user_id, "purpose": purpose})
    if not doc:
        raise ValueError("Aucun code en attente. Demandez un nouveau code.")
    expires = _parse(doc.get("expires_at"))
    if not expires or expires < datetime.now(timezone.utc):
        await db.account_otps.delete_one({"_id": doc["_id"]})
        raise ValueError("Code expiré. Demandez un nouveau code.")
    if doc.get("attempts", 0) >= MAX_CODE_ATTEMPTS:
        await db.account_otps.delete_one({"_id": doc["_id"]})
        raise ValueError("Trop de tentatives. Demandez un nouveau code.")
    if not hmac.compare_digest(doc["code_hash"], _hash((code or "").strip())):
        await db.account_otps.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        raise ValueError("Code incorrect")
    await db.account_otps.delete_one({"_id": doc["_id"]})
    return doc.get("payload") or {}


def block_until(deleted_at) -> datetime:
    return (_parse(deleted_at) or datetime.now(timezone.utc)) + timedelta(days=BLOCK_DAYS)


def restorable_until(deleted_at) -> datetime:
    return (_parse(deleted_at) or datetime.now(timezone.utc)) + timedelta(days=RESTORE_DAYS)


def is_contact_blocked(user: dict) -> bool:
    """True while a deleted account still reserves its phone number and e-mail."""
    return bool(user.get("is_deleted")) and block_until(user.get("deleted_at")) > datetime.now(timezone.utc)


def can_restore(user: dict) -> bool:
    return bool(user.get("is_deleted")) and restorable_until(user.get("deleted_at")) > datetime.now(timezone.utc)


async def erase_users(db, users: list) -> int:
    """Permanently remove accounts and their personal data."""
    if not users:
        return 0
    ids = [u["id"] for u in users]
    phones = [u["phone"] for u in users if u.get("phone")]
    await db.virtual_cards.update_many(
        {"user_id": {"$in": ids}, "is_standalone": False},
        {"$set": {"user_id": None, "is_standalone": True}, "$unset": {"owner_name": "", "linked_at": ""}},
    )
    await db.wallets.delete_many({"user_id": {"$in": ids}})
    await db.referrals.delete_many({"referred_user_id": {"$in": ids}})
    await db.notifications.delete_many({"user_id": {"$in": ids}})
    await db.account_otps.delete_many({"user_id": {"$in": ids}})
    if phones:
        await db.otp_codes.delete_many({"phone": {"$in": phones}})
    await db.users.delete_many({"id": {"$in": ids}})
    return len(ids)


async def release_expired_contacts(db, phone: str = None, email: str = None) -> int:
    """Called at registration/contact change: free the contact of accounts deleted > 3 months ago."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=BLOCK_DAYS)).isoformat()
    conds = []
    if phone:
        conds.append({"phone": phone})
    if email:
        conds.append({"email": email.lower()})
    if not conds:
        return 0
    stale = await db.users.find(
        {"is_deleted": True, "deleted_at": {"$lt": cutoff}, "$or": conds}, {"_id": 0, "id": 1, "phone": 1}
    ).to_list(50)
    return await erase_users(db, stale)


async def purge_expired_deleted_accounts(db) -> int:
    """Erase accounts deleted more than 6 months ago."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=RESTORE_DAYS)).isoformat()
    stale = await db.users.find(
        {"is_deleted": True, "deleted_at": {"$lt": cutoff}}, {"_id": 0, "id": 1, "phone": 1}
    ).to_list(1000)
    count = await erase_users(db, stale)
    if count:
        logger.info("Erased %s account(s) past the restoration period", count)
    return count
