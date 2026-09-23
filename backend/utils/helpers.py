"""
Monity World - Utility Functions
Common helper functions used across the application
"""
import uuid
import random
import string
import secrets
import bcrypt
import re
from datetime import datetime, timezone


def gen_id() -> str:
    """Generate a unique UUID string"""
    return str(uuid.uuid4())


def hash_pw(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_pw(password: str, hashed: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode(), hashed.encode())


def gen_otp() -> str:
    """Generate a 6-digit OTP code"""
    return ''.join(random.choices(string.digits, k=6))


def gen_account() -> str:
    """Generate a 10-digit account number"""
    return ''.join(random.choices(string.digits, k=10))


def gen_ref(name: str) -> str:
    """Generate a referral code based on user name"""
    return name[:3].upper() + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))


def gen_barcode() -> str:
    """Generate a unique barcode for virtual cards"""
    return 'MVC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=13))


def gen_nfc_code() -> str:
    """Generate a unique NFC code"""
    return 'NFC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))


def gen_printed_card_number() -> str:
    """Generate a 16-digit printed card number (format: 8552-9657-5431-4523)"""
    return '-'.join([''.join(random.choices(string.digits, k=4)) for _ in range(4)])


def gen_ecommerce_link_code() -> str:
    """Generate a unique e-commerce link code"""
    return 'ECM' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))


def gen_reset_token() -> str:
    """Generate a secure password reset token"""
    return secrets.token_urlsafe(32)


def validate_nfc_serial(serial: str) -> bool:
    """Validate NFC serial format like 05:G8:5F:54:22:75:Y5"""
    pattern = r'^[0-9A-Z]{2}(:[0-9A-Z]{2}){6}$'
    return bool(re.match(pattern, serial.upper()))


def now_iso() -> str:
    """Get current timestamp in ISO format"""
    return datetime.now(timezone.utc).isoformat()
