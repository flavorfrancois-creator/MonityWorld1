"""OTP duration settings and cleanup of unconfirmed registrations."""
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

SETTINGS_KEY = "otp_settings"
REGISTRATION_RANGE = (30, 240)
TRANSACTION_RANGE = (5, 30)
DEFAULTS = {"registration_otp_minutes": 30, "transaction_otp_minutes": 10}
UNCONFIRMED_ACCOUNT_TTL_MINUTES = 60


def _clamp(value, bounds, default):
    try:
        value = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(value, bounds[0]), bounds[1])


async def get_otp_settings(db) -> dict:
    doc = await db.admin_settings.find_one({"key": SETTINGS_KEY}) or {}
    return {
        "registration_otp_minutes": _clamp(doc.get("registration_otp_minutes"), REGISTRATION_RANGE, DEFAULTS["registration_otp_minutes"]),
        "transaction_otp_minutes": _clamp(doc.get("transaction_otp_minutes"), TRANSACTION_RANGE, DEFAULTS["transaction_otp_minutes"]),
    }


def expiry_iso(minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def is_expired(iso_value) -> bool:
    if not iso_value:
        return False
    try:
        return datetime.fromisoformat(str(iso_value).replace("Z", "+00:00")) < datetime.now(timezone.utc)
    except ValueError:
        return True


async def purge_unconfirmed_accounts(db) -> int:
    """Delete every trace of clients who confirmed neither email nor phone within 1 hour."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=UNCONFIRMED_ACCOUNT_TTL_MINUTES)).isoformat()
    users = await db.users.find(
        {"role": "client", "is_verified": False, "created_at": {"$lt": cutoff}},
        {"_id": 0, "id": 1, "phone": 1, "email": 1},
    ).to_list(1000)
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
    if phones:
        await db.otp_codes.delete_many({"phone": {"$in": phones}})
    await db.users.delete_many({"id": {"$in": ids}})
    logger.info("Purged %s unconfirmed account(s)", len(ids))
    return len(ids)
