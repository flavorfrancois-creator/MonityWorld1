"""
Monity World - SMTP Shared Utilities
Manages multiple admin-configured SMTP connections (per country or "for all
states") and sends password-reset / OTP emails through them, with automatic
fallback to the next available connection if one fails or isn't configured.
Falls back to legacy SMTP_* environment variables if no DB config exists yet.
"""
import os
import smtplib
import logging
from email.message import EmailMessage
from database import db, now_iso

logger = logging.getLogger(__name__)


async def get_smtp_configs_for_country(country_code: str = None):
    """Return active SMTP configs usable for a given country, ordered by
    priority: country-specific configs first, then "for all states" /
    default fallback connections. Always includes fallback configs at the
    end so sending never fails just because a country-specific one is down.
    """
    query = {"is_active": True}
    configs = await db.smtp_configs.find(query, {"_id": 0}).sort([("priority", 1)]).to_list(50)
    if not configs:
        return []

    country_code = (country_code or "").upper()
    country_specific = [c for c in configs if country_code and country_code in (c.get("countries") or [])]
    all_states = [c for c in configs if c.get("is_all_states") or not c.get("countries")]
    defaults = [c for c in configs if c.get("is_default")]

    ordered = []
    for c in country_specific + defaults + all_states:
        if c["provider_code"] not in [o["provider_code"] for o in ordered]:
            ordered.append(c)
    return ordered


def _send_via_config(config: dict, to_email: str, subject: str, body: str):
    host = config.get("host")
    port = int(config.get("port") or 587)
    username = config.get("username")
    password = config.get("password")
    sender = config.get("from_email") or username
    from_name = config.get("from_name") or "Monity World"
    if not all([host, username, password, sender]):
        raise RuntimeError(f"SMTP config {config.get('provider_code')} incomplete")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{from_name} <{sender}>"
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if config.get("use_tls", True):
            smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(message)


def _send_via_env(to_email: str, subject: str, body: str):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM", username)
    if not all([host, username, password, sender]):
        raise RuntimeError("SMTP is not configured")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to_email
    message.set_content(body)
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(message)


async def send_email(to_email: str, subject: str, body: str, country_code: str = None):
    """Send an email using the best matching admin-configured SMTP connection,
    falling back to the next connection (e.g. the "for all states" one) if the
    first fails, and finally to legacy environment-variable SMTP config."""
    configs = await get_smtp_configs_for_country(country_code)

    last_error = None
    for config in configs:
        try:
            _send_via_config(config, to_email, subject, body)
            await db.smtp_configs.update_one(
                {"provider_code": config["provider_code"]},
                {"$set": {"last_used_at": now_iso(), "last_status": "success"}}
            )
            return
        except Exception as e:
            last_error = e
            logger.error(f"SMTP send failed via {config.get('provider_code')}: {e}")
            await db.smtp_configs.update_one(
                {"provider_code": config["provider_code"]},
                {"$set": {"last_used_at": now_iso(), "last_status": "failed", "last_error": str(e)}}
            )
            continue

    # No DB config matched/succeeded - try legacy env-var SMTP as last resort
    try:
        _send_via_env(to_email, subject, body)
        return
    except Exception as e:
        last_error = last_error or e
        logger.error(f"SMTP send failed via environment fallback: {e}")

    raise RuntimeError(f"Unable to send email: {last_error}")
