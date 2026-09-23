"""
Monity World - WhatsApp Shared Utilities
Used by both auth (server.py) and admin_whatsapp routes
"""
import os
import httpx
import logging
from database import db, gen_id, now_iso

logger = logging.getLogger(__name__)

WHATSAPP_SERVICE_URL = os.environ.get("WHATSAPP_SERVICE_URL", "http://localhost:8002")


async def get_whatsapp_config_for_country(country_code: str, config_type: str = "whatsapp_web"):
    config = await db.whatsapp_configs.find_one({
        "is_active": True,
        "config_type": config_type,
        "countries": {"$in": [country_code.upper()]}
    })
    if config:
        return config
    config = await db.whatsapp_configs.find_one({
        "is_active": True,
        "config_type": config_type,
        "countries": {"$in": ["*"]}
    })
    if config:
        return config
    config = await db.whatsapp_configs.find_one({
        "is_active": True,
        "config_type": config_type,
        "is_default": True
    })
    return config


async def send_whatsapp_message(phone: str, message: str, country_code: str = None) -> dict:
    if not country_code:
        phone_clean = phone.replace("+", "").replace(" ", "")
        if phone_clean.startswith("243"): country_code = "CD"
        elif phone_clean.startswith("242"): country_code = "CG"
        elif phone_clean.startswith("237"): country_code = "CM"
        elif phone_clean.startswith("225"): country_code = "CI"
        elif phone_clean.startswith("221"): country_code = "SN"
        elif phone_clean.startswith("33"): country_code = "FR"
        else: country_code = "UNKNOWN"

    config = await get_whatsapp_config_for_country(country_code)
    if not config:
        return {"success": False, "error": "Aucune configuration WhatsApp disponible pour ce pays", "fallback": "sms"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{WHATSAPP_SERVICE_URL}/send",
                json={"sessionId": config["session_id"], "phone": phone, "message": message}
            )
            if resp.status_code == 200:
                result = resp.json()
                await db.whatsapp_logs.insert_one({
                    "id": gen_id(), "config_id": config["id"], "session_id": config["session_id"],
                    "phone": phone[:6] + "***", "message_preview": message[:50] + "...",
                    "status": "sent", "message_id": result.get("messageId"), "created_at": now_iso()
                })
                return {"success": True, "message_id": result.get("messageId"), "via": "whatsapp"}
            else:
                error = resp.json().get("error", "Unknown error")
                await db.whatsapp_logs.insert_one({
                    "id": gen_id(), "config_id": config["id"], "phone": phone[:6] + "***",
                    "status": "failed", "error": error, "created_at": now_iso()
                })
                return {"success": False, "error": error, "fallback": "sms"}
        except Exception as e:
            return {"success": False, "error": str(e), "fallback": "sms"}


async def send_whatsapp_otp(phone: str, otp: str, is_2fa: bool = False) -> dict:
    if is_2fa:
        message = f"Monity World - Double authentification\n\nVotre code de vérification: {otp}\n\nCe code expire dans 10 minutes.\n\nSi vous n'avez pas essayé de vous connecter, sécurisez immédiatement votre compte."
    else:
        message = f"Monity World - Vérification\n\nVotre code OTP: {otp}\n\nEntrez ce code pour vérifier votre compte.\n\nCe code expire dans 10 minutes."
    return await send_whatsapp_message(phone, message)
