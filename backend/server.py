from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import os
import logging
import httpx
import random
import string
import uuid
import base64
import secrets
import smtplib
from email.message import EmailMessage
from pathlib import Path
from dotenv import load_dotenv
import bcrypt
from jose import jwt, JWTError
import qrcode
from io import BytesIO

# Import RBAC module
from rbac import (
    PERMISSIONS, PERMISSION_GROUPS, ROLES, 
    get_role_info, get_role_level, is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role, can_access_user,
    has_permission, has_any_permission, get_user_permissions, get_accessible_countries,
    can_access_country, check_permission, check_can_suspend, check_can_create_role,
    get_default_admin_data, get_permission_categories,
    can_suspend_user_by_type, check_can_suspend_user_by_type
)

# Import modular utilities
from utils.helpers import (
    gen_id as _gen_id, hash_pw as _hash_pw, verify_pw as _verify_pw,
    gen_otp as _gen_otp, gen_account as _gen_account, gen_ref as _gen_ref,
    gen_barcode as _gen_barcode, gen_nfc_code as _gen_nfc_code,
    gen_printed_card_number as _gen_printed_card_number,
    gen_reset_token as _gen_reset_token,
    validate_nfc_serial as _validate_nfc_serial, now_iso
)
from utils.auth import (
    JWT_SECRET as _JWT_SECRET, JWT_ALGORITHM as _JWT_ALGORITHM,
    create_token as _create_token, decode_token as _decode_token,
    is_admin_role, can_access_admin_routes, requires_admin_kyc,
    KYC_REQUIRED_OPERATIONS
)
from utils.whatsapp import send_whatsapp_otp, send_whatsapp_message

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads" / "profiles"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

security = HTTPBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'monity-world-secret-2024')
JWT_ALGORITHM = "HS256"

# Non-client roles - these accounts cannot have wallets or make transfers
NON_CLIENT_ROLES = ["primary_admin", "secondary_primary_admin", "admin", "manager"]

app = FastAPI(title="Monity World API")
api_router = APIRouter(prefix="/api")

# Note: Static files are served via API endpoint below, not via app.mount
# This is because the K8s ingress only routes /api/* to the backend

from fastapi.responses import Response as FastAPIResponse


@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    """Serve files from object storage"""
    try:
        from utils.storage import get_object
        data, content_type = get_object(path)
        return FastAPIResponse(content=data, media_type=content_type)
    except Exception as e:
        logger.error(f"File serve error: {e}")
        raise HTTPException(404, "Fichier non trouvé")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import country config
from config.countries import get_country_config, get_default_currencies, get_virtual_card_price, get_all_countries


# === UTILS ===
def gen_id(): return str(uuid.uuid4())
def hash_pw(p: str) -> str: return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p: str, h: str) -> bool: return bcrypt.checkpw(p.encode(), h.encode())
def gen_otp(): return ''.join(random.choices(string.digits, k=6))
def gen_account(): return ''.join(random.choices(string.digits, k=10))
def gen_ref(name): return name[:3].upper() + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
def gen_barcode(): return 'MVC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=13))  # Code 128 compatible
def gen_nfc_code(): return 'NFC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
def gen_printed_card_number(): return '-'.join([''.join(random.choices(string.digits, k=4)) for _ in range(4)])  # Format: 8552-9657-5431-4523
def gen_reset_token(): return secrets.token_urlsafe(32)
def validate_nfc_serial(serial: str) -> bool:
    """Validate NFC serial format like 05:G8:5F:54:22:75:Y5"""
    import re
    pattern = r'^[0-9A-Z]{2}(:[0-9A-Z]{2}){6}$'
    return bool(re.match(pattern, serial.upper()))


async def send_email_otp(email: str, otp: str, country_code: str = None):
    from utils.email import send_email
    subject = "Monity World - Réinitialisation du mot de passe"
    body = f"Votre code OTP est : {otp}\n\nCe code expire dans 10 minutes."
    await send_email(email, subject, body, country_code)


def get_admin_country_filter(admin: dict) -> list:
    """Get the list of countries an admin can access. Empty list means all countries (super admin)."""
    assigned = admin.get("assigned_countries", [])
    if isinstance(assigned, list) and len(assigned) > 0:
        return [c.upper() for c in assigned]
    return []  # Empty = super admin, can see all


def build_country_query(admin: dict, country_param: str = "", field_name: str = "country") -> dict:
    """Build MongoDB query filter based on admin's assigned countries and optional country parameter."""
    admin_countries = get_admin_country_filter(admin)
    
    # If specific country requested
    if country_param:
        country_upper = country_param.upper()
        # If admin has restrictions, check if requested country is allowed
        if admin_countries and country_upper not in admin_countries:
            return {"__forbidden__": True}  # Will return empty results
        return {field_name: country_upper}
    
    # No specific country requested
    if admin_countries:
        # Admin has restrictions, filter by their assigned countries
        return {field_name: {"$in": admin_countries}}
    
    # Super admin, no filter
    return {}


async def check_admin_card_access(admin: dict, card: dict, db) -> bool:
    """Check if admin has access to a card based on owner's country"""
    admin_countries = get_admin_country_filter(admin)
    
    # Super admin can access all
    if not admin_countries:
        return True
    
    # Standalone cards without user can be accessed
    if not card.get("user_id"):
        return True
    
    # Check owner's country
    owner = await db.users.find_one({"id": card["user_id"]}, {"country": 1, "_id": 0})
    if owner and owner.get("country") in admin_countries:
        return True
    
    return False


def build_transaction_country_query(admin: dict, country_param: str = "") -> dict:
    """Build MongoDB query for transactions based on sender/receiver country."""
    admin_countries = get_admin_country_filter(admin)
    
    if country_param:
        country_upper = country_param.upper()
        if admin_countries and country_upper not in admin_countries:
            return {"__forbidden__": True}
        return {"$or": [
            {"sender_country": country_upper},
            {"receiver_country": country_upper}
        ]}
    
    if admin_countries:
        return {"$or": [
            {"sender_country": {"$in": admin_countries}},
            {"receiver_country": {"$in": admin_countries}}
        ]}
    
    return {}


async def get_transaction_rule(country_code: str, tx_type: str):
    """Get transaction rule for a country and transaction type"""
    # First try country-specific rule
    rule = await db.transaction_rules.find_one({
        "country_code": country_code,
        "transaction_type": tx_type,
        "is_active": True
    })
    # Fall back to global rule
    if not rule:
        rule = await db.transaction_rules.find_one({
            "country_code": "ALL",
            "transaction_type": tx_type,
            "is_active": True
        })
    # Default rule if none found
    if not rule:
        rule = {
            "fee_type": "percentage",
            "fee_value": 1.0 if tx_type == "transfer" else 1.5,
            "min_fee": 0.0,
            "max_fee": None,
            "daily_limit": 10000,
            "monthly_limit": 100000,
            "per_transaction_min": 1,
            "per_transaction_max": 5000
        }
    return rule


async def get_international_rule(source_country: str, dest_country: str):
    """Get international transaction rule between two countries"""
    # First try specific corridor
    rule = await db.international_rules.find_one({
        "source_country": source_country,
        "destination_country": dest_country,
        "is_active": True
    })
    # Try reverse corridor
    if not rule:
        rule = await db.international_rules.find_one({
            "source_country": dest_country,
            "destination_country": source_country,
            "is_active": True
        })
    # Fall back to global international rule
    if not rule:
        rule = await db.international_rules.find_one({
            "source_country": "ALL",
            "destination_country": "ALL",
            "is_active": True
        })
    # Default international rule
    if not rule:
        rule = {
            "fee_type": "percentage",
            "fee_value": 2.5,
            "min_fee": 1.0,
            "max_fee": None,
            "exchange_rate_margin": 2.0,
            "daily_limit": 5000,
            "monthly_limit": 50000,
            "per_transaction_min": 10,
            "per_transaction_max": 2000,
            "processing_time": "instant"
        }
    return rule


def calculate_fee(amount: float, rule: dict) -> float:
    """Calculate transaction fee based on rule"""
    if rule["fee_type"] == "percentage":
        fee = round(amount * (rule["fee_value"] / 100), 2)
    else:  # fixed
        fee = rule["fee_value"]
    
    # Apply min/max fee
    if fee < rule.get("min_fee", 0):
        fee = rule["min_fee"]
    if rule.get("max_fee") and fee > rule["max_fee"]:
        fee = rule["max_fee"]
    
    return round(fee, 2)


async def check_transaction_limits(user_id: str, amount: float, tx_type: str, rule: dict) -> dict:
    """Check if transaction is within limits"""
    errors = []
    
    # Check per-transaction limits
    if amount < rule.get("per_transaction_min", 0):
        errors.append(f"Montant minimum: {rule['per_transaction_min']}")
    if amount > rule.get("per_transaction_max", float('inf')):
        errors.append(f"Montant maximum: {rule['per_transaction_max']}")
    
    # Check daily limit
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    daily_total = await db.transactions.aggregate([
        {
            "$match": {
                "sender_id": user_id,
                "type": tx_type,
                "status": {"$in": ["completed", "pending"]},
                "created_at": {"$gte": today_start.isoformat()}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    daily_spent = daily_total[0]["total"] if daily_total else 0
    
    if daily_spent + amount > rule.get("daily_limit", float('inf')):
        errors.append(f"Limite journalière atteinte: {rule['daily_limit']} (utilisé: {daily_spent})")
    
    # Check monthly limit
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_total = await db.transactions.aggregate([
        {
            "$match": {
                "sender_id": user_id,
                "type": tx_type,
                "status": {"$in": ["completed", "pending"]},
                "created_at": {"$gte": month_start.isoformat()}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    monthly_spent = monthly_total[0]["total"] if monthly_total else 0
    
    if monthly_spent + amount > rule.get("monthly_limit", float('inf')):
        errors.append(f"Limite mensuelle atteinte: {rule['monthly_limit']} (utilisé: {monthly_spent})")
    
    return {
        "allowed": len(errors) == 0,
        "errors": errors,
        "daily_spent": daily_spent,
        "daily_remaining": max(0, rule.get("daily_limit", 0) - daily_spent),
        "monthly_spent": monthly_spent,
        "monthly_remaining": max(0, rule.get("monthly_limit", 0) - monthly_spent)
    }


async def get_exchange_rate(from_currency: str, to_currency: str, margin: float = 0) -> float:
    """Get exchange rate between two currencies with optional margin"""
    if from_currency == to_currency:
        return 1.0
    
    from_cur = await db.currencies.find_one({"code": from_currency})
    to_cur = await db.currencies.find_one({"code": to_currency})
    
    if not from_cur or not to_cur:
        raise HTTPException(400, f"Devise non supportée: {from_currency} ou {to_currency}")
    
    # Calculate rate through USD
    rate = to_cur["rate_to_usd"] / from_cur["rate_to_usd"]
    
    # Apply margin (unfavorable to user)
    if margin > 0:
        rate = rate * (1 - margin / 100)  # Reduce amount received
    
    return round(rate, 6)


def create_token(uid: str, role: str, session_id: str = None) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": uid, "role": role, "exp": exp}
    if session_id:
        payload["sid"] = session_id
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
        if not user:
            raise HTTPException(401, "Utilisateur non trouvé")
        # Session enforcement: check if session_id matches
        token_sid = payload.get("sid")
        if token_sid and user.get("active_session_id") and token_sid != user.get("active_session_id"):
            raise HTTPException(401, "Session expirée. Un autre appareil s'est connecté à votre compte.")
        return user
    except JWTError:
        raise HTTPException(401, "Token invalide")


async def get_admin(user=Depends(get_current_user)):
    if user.get("role") not in ["admin", "manager", "primary_admin", "secondary_primary_admin"]:
        raise HTTPException(403, "Accès refusé")
    if user.get("is_suspended"):
        raise HTTPException(403, "Votre compte est suspendu")
    return user


async def get_admin_with_kyc(user=Depends(get_admin)):
    """
    Check if admin has approved KYC for sensitive operations.
    Primary admin (original) is exempt from KYC requirement.
    """
    # Original primary admin is exempt
    if is_original_primary_admin(user):
        return user
    
    # Check KYC status
    kyc_status = user.get("kyc_status", "pending")
    if kyc_status != "approved":
        raise HTTPException(
            403, 
            f"Vérification d'identité requise. Votre KYC est actuellement: {kyc_status}. Veuillez compléter votre vérification d'identité pour effectuer cette action.",
            headers={"X-KYC-Required": "true", "X-KYC-Status": kyc_status}
        )
    return user


def check_admin_kyc_status(user: dict) -> dict:
    """
    Return KYC status info for an admin user.
    """
    # Original primary admin is always considered verified
    if is_original_primary_admin(user):
        return {
            "kyc_required": False,
            "kyc_status": "approved",
            "kyc_exempt": True,
            "reason": "Administrateur principal original"
        }
    
    kyc_status = user.get("kyc_status", "pending")
    return {
        "kyc_required": kyc_status != "approved",
        "kyc_status": kyc_status,
        "kyc_exempt": False,
        "reason": None if kyc_status == "approved" else "Vérification d'identité en attente"
    }


# === MODELS ===
class RegisterReq(BaseModel):
    phone: str
    name: str
    email: Optional[str] = None
    password: str
    country: str = "CD"
    language: str = "fr"
    referral_code: Optional[str] = None
    nfc_card_number: Optional[str] = None  # 16-digit printed card number (e.g., 8552-9657-5431-4523)

class LoginReq(BaseModel):
    phone: Optional[str] = None  # Can login with phone OR email
    email: Optional[str] = None
    password: str

class OTPReq(BaseModel):
    phone: str
    otp: str

class PasswordChangeReq(BaseModel):
    current_password: str
    new_password: str

class PasswordResetRequestReq(BaseModel):
    identifier: str  # phone or email
    method: str = "phone"  # "phone" or "email"

class PasswordResetConfirmReq(BaseModel):
    token: str
    new_password: str

class ProfileUpdateReq(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None

class TransferReq(BaseModel):
    receiver_phone: Optional[str] = None
    receiver_account: Optional[str] = None
    amount: float
    currency: str = "USD"  # Source currency (from sender's wallet)
    target_currency: Optional[str] = None  # Destination currency (if different from source)
    description: Optional[str] = None
    idempotency_key: Optional[str] = None

class CardReq(BaseModel):
    card_type: str = "virtual"
    limit: float = 1000.0

class SavingsReq(BaseModel):
    type: str = "flexible"
    amount: float
    currency: str = "USD"
    duration_months: Optional[int] = None

class GroupReq(BaseModel):
    name: str
    contribution_amount: float
    currency: str = "USD"
    frequency: str = "monthly"  # daily, weekly, biweekly, monthly, quarterly
    max_members: int = 10
    auto_debit: bool = False  # Prélèvement automatique
    description: Optional[str] = None


class GroupInviteReq(BaseModel):
    phone_numbers: List[str]  # List of phone numbers to invite


class GroupJoinRequestReq(BaseModel):
    invite_code: str


class InvitationResponseReq(BaseModel):
    action: str  # accept, reject


class SavingsReqV2(BaseModel):
    name: str
    type: str = "flexible"  # flexible, fixed
    target_amount: float
    currency: str = "USD"
    frequency: str = "monthly"  # daily, weekly, biweekly, monthly, quarterly
    contribution_amount: float
    auto_debit: bool = False
    duration_months: Optional[int] = None


class RotationOrderReq(BaseModel):
    member_order: List[str]  # List of user IDs in order


class PayoutReq(BaseModel):
    beneficiary_id: str
    amount: Optional[float] = None  # If None, use full pot
    note: Optional[str] = None


class CurrencyUpdateReq(BaseModel):
    rate_to_usd: float
    is_active: bool = True


# === TRANSACTION RULES MODELS ===
class TransactionRuleReq(BaseModel):
    """Rules for transaction fees and limits by country and type"""
    country_code: str  # Country code (e.g., "CD", "CM", "ALL" for global)
    transaction_type: str  # transfer, withdrawal, recharge, international
    fee_type: str = "percentage"  # percentage or fixed
    fee_value: float = 0.0  # Fee amount (% or fixed)
    min_fee: float = 0.0  # Minimum fee
    max_fee: Optional[float] = None  # Maximum fee (optional cap)
    daily_limit: float = 10000.0  # Daily transaction limit
    monthly_limit: float = 100000.0  # Monthly transaction limit
    per_transaction_min: float = 1.0  # Minimum per transaction
    per_transaction_max: float = 5000.0  # Maximum per transaction
    is_active: bool = True


class InternationalRuleReq(BaseModel):
    """Rules for international transactions between countries"""
    source_country: str  # Origin country code
    destination_country: str  # Destination country code
    fee_type: str = "percentage"  # percentage or fixed
    fee_value: float = 2.5  # Fee amount (higher for international)
    min_fee: float = 1.0
    max_fee: Optional[float] = None
    exchange_rate_margin: float = 2.0  # % margin on exchange rate
    daily_limit: float = 5000.0
    monthly_limit: float = 50000.0
    per_transaction_min: float = 10.0
    per_transaction_max: float = 2000.0
    is_active: bool = True
    processing_time: str = "instant"  # instant, 1-3 days, etc.


class ProfileReq(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None
    country: Optional[str] = None

class TxActionReq(BaseModel):
    action: str
    note: Optional[str] = None

class UserUpdateReq(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None

# KYC Personal Information Model
class KYCPersonalInfoReq(BaseModel):
    last_name: str  # Nom
    first_name: str  # Prénom
    date_of_birth: str  # Date de naissance (YYYY-MM-DD)
    place_of_birth: str  # Lieu de naissance
    occupation: Optional[str] = None  # Emploi
    residence_address: str  # Adresse de résidence
    postal_box: Optional[str] = None  # Boîte postale
    postal_code: Optional[str] = None  # Code postal
    street: Optional[str] = None  # Rue
    city: Optional[str] = None  # Ville
    country: Optional[str] = None  # Pays de résidence

class RechargeReq(BaseModel):
    amount: float
    currency: str = "USD"
    method: str = "mobile_money"

class WithdrawReq(BaseModel):
    amount: float
    currency: str = "USD"
    method: str = "mobile_money"
    destination: str

class WalletAddReq(BaseModel):
    currency: str


class WalletConvertAndReplaceReq(BaseModel):
    """Request to create a new wallet by converting an existing one"""
    source_currency: str  # Currency to convert FROM (will be deleted)
    target_currency: str  # New currency to create
    conversion_fee_percent: float = 1.5  # Conversion fee (default 1.5%)


class WalletDeleteReq(BaseModel):
    """Request to delete a wallet with optional conversion"""
    currency: str  # Currency to delete
    convert_to: str = None  # If set, convert balance to this currency before deleting


class CountryReq(BaseModel):
    code: str
    name: str
    dial_code: str
    currency_code: str
    flag: str = ""
    is_active: bool = True


class VirtualCardReq(BaseModel):
    name: str
    currency: str = "USD"
    limit: float = 1000.0
    can_send: bool = True
    can_receive: bool = True
    auto_recharge: bool = False
    auto_recharge_amount: Optional[float] = None
    auto_recharge_frequency: Optional[str] = None  # daily, weekly, monthly, quarterly


class VirtualCardUpdateReq(BaseModel):
    name: Optional[str] = None
    is_locked: Optional[bool] = None
    can_send: Optional[bool] = None
    can_receive: Optional[bool] = None
    auto_recharge: Optional[bool] = None
    auto_recharge_amount: Optional[float] = None
    auto_recharge_frequency: Optional[str] = None


class AdminCreateReq(BaseModel):
    phone: str
    name: str
    password: str
    assigned_countries: List[str] = []
    assigned_transaction_types: List[str] = []


class AdminZoneUpdateReq(BaseModel):
    assigned_countries: Optional[List[str]] = None
    assigned_transaction_types: Optional[List[str]] = None


class CardDeleteVoteReq(BaseModel):
    card_id: str
    vote: str  # approve or reject


class NFCAssociationReq(BaseModel):
    nfc_serial_number: str  # Format: 05:G8:5F:54:22:75:Y5


class StandaloneCardReq(BaseModel):
    name: str
    currency: str = "USD"
    initial_balance: float = 0.0
    limit: float = 1000.0
    nfc_serial_number: Optional[str] = None  # Can be added later


class ManagerRechargeReq(BaseModel):
    user_phone: str
    amount: float
    currency: str = "USD"
    method: str = "cash"
    note: Optional[str] = None


class PaymentLinkReq(BaseModel):
    amount: float
    currency: str = "USD"
    description: str
    password: str
    expires_hours: int = 24


class PaymentLinkPayReq(BaseModel):
    password: str


# === ADVANCED PAYMENT LINKS FOR E-COMMERCE ===
class EcommerceLinkCreateReq(BaseModel):
    """Create an e-commerce payment link for receiving or sending money"""
    link_type: str  # "receive" or "send"
    is_permanent: bool = False  # True = permanent (no expiry), False = temporary
    fixed_amount: Optional[float] = None  # Only for temporary links
    currency: str = "USD"
    description: str
    # For security, validation code is sent to the payer's account


class EcommerceLinkPayReq(BaseModel):
    """Pay via an e-commerce link"""
    sender_phone: str  # Phone number of the person making the payment
    amount: Optional[float] = None  # Required for permanent links (no fixed amount)
    validation_code: str  # OTP code sent to sender's Monity account


class EcommerceLinkSendReq(BaseModel):
    """Send money via an e-commerce link"""
    receiver_phone: str  # Phone number of the beneficiary
    amount: Optional[float] = None  # Required for permanent links
    validation_code: str  # OTP code sent to user's Monity account


# === E-COMMERCE API KEYS MODELS ===
class ApiKeyCreateReq(BaseModel):
    """Create API key for e-commerce integration"""
    name: str  # Name for this API key (e.g., "My Online Store")
    website_url: Optional[str] = None
    allowed_ips: List[str] = []  # Whitelist IPs (empty = all allowed)
    permissions: List[str] = ["payments.receive", "payments.status"]  # API permissions
    daily_limit: Optional[float] = None  # Daily transaction limit
    webhook_url: Optional[str] = None  # URL to receive payment notifications


class ApiKeyUpdateReq(BaseModel):
    """Update API key settings"""
    name: Optional[str] = None
    website_url: Optional[str] = None
    allowed_ips: Optional[List[str]] = None
    permissions: Optional[List[str]] = None
    daily_limit: Optional[float] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None


class GroupMessageReq(BaseModel):
    group_id: str
    content: str


class ManagedAccountReq(BaseModel):
    managed_user_phone: str
    permissions: List[str] = ["view_balance", "view_transactions"]


class ManagedAccountActionReq(BaseModel):
    action: str
    permission: Optional[str] = None


# === NFC CARD VALIDITY & SUBSCRIPTION MODELS ===
class NFCCardCreateReq(BaseModel):
    """Create NFC card with validity dates"""
    name: str
    currency: str = "USD"
    initial_balance: float = 0.0
    limit: float = 1000.0
    nfc_serial_number: Optional[str] = None
    card_pin: str  # 4-digit PIN
    nfc_card_type: str = "basic"  # basic, standard, premium


class NFCSubscriptionRenewReq(BaseModel):
    """Renew NFC card subscription"""
    card_id: str
    duration_months: int = 12  # Usually 1 year


class NFCSubscriptionFeeReq(BaseModel):
    """Set subscription fee for NFC cards"""
    country_code: str
    card_type: str  # basic, standard, premium
    annual_fee: float
    currency: str = "USD"
    is_active: bool = True


# === EXTERNAL BANK CARDS (VISA/MASTERCARD) MODELS ===
class BankCardAddReq(BaseModel):
    """Add external bank card"""
    card_type: str  # visa, mastercard
    card_number: str  # Full number (will be masked)
    holder_name: str
    expiry_month: int
    expiry_year: int
    billing_address: Optional[str] = None


class BankCardAdminActionReq(BaseModel):
    """Admin action on bank card"""
    action: str  # approve, reject, enable_withdrawal, disable_withdrawal
    note: Optional[str] = None


# === MOBILE PAYMENT API INTEGRATION MODELS ===
class MobilePaymentOperatorReq(BaseModel):
    """Configure mobile payment operator"""
    country_code: str
    operator_name: str  # Orange Money, MTN MoMo, Airtel Money, etc.
    operator_code: str  # ORANGE_CD, MTN_CM, etc.
    api_base_url: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    webhook_url: Optional[str] = None
    deposit_endpoint: Optional[str] = None
    withdrawal_endpoint: Optional[str] = None
    balance_endpoint: Optional[str] = None
    is_active: bool = True
    min_amount: float = 1.0
    max_amount: float = 10000.0
    fee_percentage: float = 1.5
    fee_fixed: float = 0.0


class MobilePaymentDepositReq(BaseModel):
    """Deposit via mobile money"""
    operator_code: str
    phone_number: str
    amount: float
    currency: str = "USD"


class MobilePaymentWithdrawReq(BaseModel):
    """Withdraw to mobile money"""
    operator_code: str
    phone_number: str
    amount: float
    currency: str = "USD"


# === FINANCIAL API INTEGRATIONS MODELS ===

# Integration categories
INTEGRATION_CATEGORIES = {
    "banking": "APIs Bancaires",
    "mobile_money": "Mobile Money", 
    "crypto": "Crypto-monnaies",
    "ewallet": "Portefeuilles Électroniques",
    "other": "Autres Systèmes"
}

# Integration types with their default configurations
INTEGRATION_TYPES = {
    # Banking APIs
    "swift": {"category": "banking", "name": "SWIFT Transfer", "description": "Transferts bancaires internationaux via SWIFT"},
    "sepa": {"category": "banking", "name": "SEPA Transfer", "description": "Transferts bancaires zone euro"},
    "ach": {"category": "banking", "name": "ACH Transfer", "description": "Transferts bancaires USA"},
    "visa_direct": {"category": "banking", "name": "VISA Direct", "description": "Envois instantanés via VISA"},
    "mastercard_send": {"category": "banking", "name": "MasterCard Send", "description": "Envois instantanés via MasterCard"},
    "stripe": {"category": "banking", "name": "Stripe", "description": "Passerelle de paiement Stripe"},
    "paypal_business": {"category": "banking", "name": "PayPal Business", "description": "Paiements via PayPal Business"},
    "flutterwave": {"category": "banking", "name": "Flutterwave", "description": "Passerelle de paiement Afrique"},
    "paystack": {"category": "banking", "name": "Paystack", "description": "Passerelle de paiement Afrique"},
    
    # Mobile Money (existing + new)
    "orange_money": {"category": "mobile_money", "name": "Orange Money", "description": "Orange Money API"},
    "mtn_momo": {"category": "mobile_money", "name": "MTN MoMo", "description": "MTN Mobile Money API"},
    "airtel_money": {"category": "mobile_money", "name": "Airtel Money", "description": "Airtel Money API"},
    "mpesa": {"category": "mobile_money", "name": "M-Pesa", "description": "Safaricom M-Pesa API"},
    "wave": {"category": "mobile_money", "name": "Wave", "description": "Wave Mobile Money API"},
    "moov_money": {"category": "mobile_money", "name": "Moov Money", "description": "Moov Africa Money API"},
    
    # Cryptocurrencies
    "bitcoin": {"category": "crypto", "name": "Bitcoin (BTC)", "description": "Intégration Bitcoin via API"},
    "usdt_trc20": {"category": "crypto", "name": "USDT (TRC20)", "description": "Tether sur réseau Tron"},
    "usdt_erc20": {"category": "crypto", "name": "USDT (ERC20)", "description": "Tether sur réseau Ethereum"},
    "ethereum": {"category": "crypto", "name": "Ethereum (ETH)", "description": "Intégration Ethereum"},
    "binance_pay": {"category": "crypto", "name": "Binance Pay", "description": "Paiements via Binance"},
    
    # E-Wallets
    "paypal": {"category": "ewallet", "name": "PayPal", "description": "Portefeuille PayPal"},
    "skrill": {"category": "ewallet", "name": "Skrill", "description": "Portefeuille Skrill"},
    "perfect_money": {"category": "ewallet", "name": "Perfect Money", "description": "Portefeuille Perfect Money"},
    "neteller": {"category": "ewallet", "name": "Neteller", "description": "Portefeuille Neteller"},
    "wise": {"category": "ewallet", "name": "Wise (TransferWise)", "description": "Transferts internationaux Wise"},
    
    # Other systems
    "custom": {"category": "other", "name": "API Personnalisée", "description": "Intégration API personnalisée"}
}


class FinancialIntegrationReq(BaseModel):
    """Configuration for financial API integration"""
    integration_type: str  # Key from INTEGRATION_TYPES
    integration_code: str  # Unique code for this integration instance
    display_name: str  # Custom display name
    category: str  # banking, mobile_money, crypto, ewallet, other
    
    # API Configuration
    api_base_url: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    api_token: Optional[str] = None
    merchant_id: Optional[str] = None
    account_id: Optional[str] = None
    
    # Endpoints
    deposit_endpoint: Optional[str] = None
    withdrawal_endpoint: Optional[str] = None
    balance_endpoint: Optional[str] = None
    status_endpoint: Optional[str] = None
    webhook_endpoint: Optional[str] = None
    
    # Webhook configuration
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    
    # Supported operations
    supports_deposit: bool = True
    supports_withdrawal: bool = True
    supports_balance_check: bool = False
    
    # Countries & Currencies
    supported_countries: List[str] = []  # Empty = all countries
    supported_currencies: List[str] = ["USD"]
    default_currency: str = "USD"
    
    # Fees configuration
    deposit_fee_type: str = "percentage"  # percentage, fixed, both
    deposit_fee_percentage: float = 0.0
    deposit_fee_fixed: float = 0.0
    withdrawal_fee_type: str = "percentage"
    withdrawal_fee_percentage: float = 0.0
    withdrawal_fee_fixed: float = 0.0
    
    # Limits
    min_deposit: float = 1.0
    max_deposit: float = 10000.0
    min_withdrawal: float = 1.0
    max_withdrawal: float = 10000.0
    daily_limit: Optional[float] = None
    monthly_limit: Optional[float] = None
    
    # Status
    is_active: bool = True
    is_test_mode: bool = True  # Sandbox/test mode
    priority: int = 1  # Lower = higher priority
    
    # Additional settings (JSON)
    extra_config: Optional[dict] = None


class FinancialIntegrationUpdateReq(BaseModel):
    """Update financial integration"""
    display_name: Optional[str] = None
    api_base_url: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    api_token: Optional[str] = None
    merchant_id: Optional[str] = None
    account_id: Optional[str] = None
    deposit_endpoint: Optional[str] = None
    withdrawal_endpoint: Optional[str] = None
    balance_endpoint: Optional[str] = None
    status_endpoint: Optional[str] = None
    webhook_endpoint: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    supports_deposit: Optional[bool] = None
    supports_withdrawal: Optional[bool] = None
    supports_balance_check: Optional[bool] = None
    supported_countries: Optional[List[str]] = None
    supported_currencies: Optional[List[str]] = None
    default_currency: Optional[str] = None
    deposit_fee_type: Optional[str] = None
    deposit_fee_percentage: Optional[float] = None
    deposit_fee_fixed: Optional[float] = None
    withdrawal_fee_type: Optional[str] = None
    withdrawal_fee_percentage: Optional[float] = None
    withdrawal_fee_fixed: Optional[float] = None
    min_deposit: Optional[float] = None
    max_deposit: Optional[float] = None
    min_withdrawal: Optional[float] = None
    max_withdrawal: Optional[float] = None
    daily_limit: Optional[float] = None
    monthly_limit: Optional[float] = None
    is_active: Optional[bool] = None
    is_test_mode: Optional[bool] = None
    priority: Optional[int] = None
    extra_config: Optional[dict] = None


class IntegrationTestReq(BaseModel):
    """Test integration connection"""
    integration_code: str
    test_type: str = "connection"  # connection, deposit, withdrawal, balance


class IntegrationTransactionReq(BaseModel):
    """Execute transaction via integration"""
    integration_code: str
    transaction_type: str  # deposit, withdrawal
    amount: float
    currency: str = "USD"
    recipient_info: Optional[dict] = None  # Phone, account number, wallet address, etc.
    reference: Optional[str] = None
    metadata: Optional[dict] = None


# === SMS API MODELS ===
class SmsApiConfigReq(BaseModel):
    """Configuration for SMS API provider"""
    provider_name: str  # Twilio, Nexmo, Infobip, Orange SMS API, etc.
    provider_code: str  # TWILIO, NEXMO, INFOBIP, ORANGE_SMS
    service_type: str = "external"  # "internal" (WhatsApp) or "external" (API SMS)
    api_base_url: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    sender_id: Optional[str] = None  # Sender name/number
    auth_token: Optional[str] = None
    account_sid: Optional[str] = None  # For Twilio
    countries: List[str] = []  # Country codes this provider handles
    is_active: bool = True
    is_default: bool = False
    priority: int = 1  # Lower number = higher priority
    cost_per_sms: float = 0.0
    currency: str = "USD"


class SmsTestReq(BaseModel):
    """Test SMS send request"""
    provider_code: str
    phone_number: str
    message: str


# === ADMIN ACTIVITY LOG MODELS ===
class AdminActivityLogReq(BaseModel):
    """Request model for filtering activity logs"""
    admin_id: Optional[str] = None
    action_type: Optional[str] = None  # create, read, update, delete, login, logout
    resource_type: Optional[str] = None  # user, transaction, kyc, admin, settings, etc.
    date_from: Optional[str] = None  # ISO date
    date_to: Optional[str] = None
    page: int = 1
    limit: int = 50


class ActivityRetentionReq(BaseModel):
    """Request model for setting retention period"""
    retention_days: int  # 30, 90, 365, 1825 (5 years)


# Activity action types
ACTIVITY_ACTIONS = {
    "create": "Création",
    "read": "Lecture",
    "update": "Modification",
    "delete": "Suppression",
    "login": "Connexion",
    "logout": "Déconnexion",
    "approve": "Approbation",
    "reject": "Rejet",
    "suspend": "Suspension",
    "unsuspend": "Réactivation",
    "export": "Export",
    "promote": "Promotion"
}

# Resource types for activity logging
ACTIVITY_RESOURCES = {
    "user": "Utilisateur",
    "transaction": "Transaction",
    "kyc": "Vérification KYC",
    "admin": "Administrateur",
    "settings": "Paramètres",
    "currency": "Devise",
    "country": "Pays",
    "partner": "Partenaire",
    "virtual_card": "Carte virtuelle",
    "group": "Groupe/Tontine",
    "wallet": "Portefeuille",
    "report": "Rapport"
}


async def log_admin_activity(
    admin: dict,
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None
):
    """
    Log an admin activity for audit trail.
    This function should be called after every admin action.
    """
    activity = {
        "id": gen_id(),
        "admin_id": admin.get("id"),
        "admin_name": admin.get("name"),
        "admin_role": admin.get("role"),
        "admin_phone": admin.get("phone"),
        "action": action,
        "action_label": ACTIVITY_ACTIONS.get(action, action),
        "resource_type": resource_type,
        "resource_label": ACTIVITY_RESOURCES.get(resource_type, resource_type),
        "resource_id": resource_id,
        "details": details or {},
        "ip_address": ip_address,
        "timestamp": now_iso(),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
    }
    await db.admin_activity_logs.insert_one(activity)
    return activity


# === FILE SERVING ===
from fastapi.responses import FileResponse
import mimetypes

@api_router.get("/uploads/{folder}/{filename}")
async def serve_uploaded_file(folder: str, filename: str):
    """
    Serve uploaded files (KYC documents, profile images, etc.)
    This endpoint is needed because K8s ingress only routes /api/* to backend.
    """
    # Validate folder to prevent directory traversal
    allowed_folders = ["kyc", "profiles", "downloads"]
    if folder not in allowed_folders:
        raise HTTPException(404, "Dossier non trouvé")
    
    # Sanitize filename to prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Nom de fichier invalide")
    
    file_path = ROOT_DIR / "uploads" / folder / filename
    
    if not file_path.exists():
        raise HTTPException(404, "Fichier non trouvé")
    
    # Determine content type
    content_type, _ = mimetypes.guess_type(str(file_path))
    if not content_type:
        content_type = "application/octet-stream"
    
    return FileResponse(
        path=str(file_path),
        media_type=content_type,
        filename=filename
    )


# === AUTH ===
@api_router.get("/")
async def root(): return {"message": "Monity World API v1.0", "status": "running"}

@api_router.get("/countries")
async def get_countries():
    """Get list of all supported countries with their configs"""
    return {"countries": get_all_countries()}

@api_router.post("/auth/register")
async def register(req: RegisterReq):
    if await db.users.find_one({"phone": req.phone}):
        raise HTTPException(400, "Ce numéro est déjà enregistré")
    
    # Check if email already exists
    if req.email:
        if await db.users.find_one({"email": req.email.lower()}):
            raise HTTPException(400, "Cet email est déjà enregistré")
        if await db.users.find_one({"email": req.email.lower(), "role": {"$in": NON_CLIENT_ROLES}}):
            raise HTTPException(400, "Cette adresse mail est réservée à un administrateur")
    if await db.users.find_one({"phone": req.phone, "role": {"$in": NON_CLIENT_ROLES}}):
        raise HTTPException(400, "Ce numéro est réservé à un administrateur")
    
    # Check if NFC card number is provided and valid
    linked_card = None
    if req.nfc_card_number:
        # Remove dashes and validate format
        card_number_clean = req.nfc_card_number.replace("-", "")
        if len(card_number_clean) != 16 or not card_number_clean.isdigit():
            raise HTTPException(400, "Numéro de carte NFC invalide (format: 8552-9657-5431-4523)")
        
        # Find standalone card with this printed number
        linked_card = await db.virtual_cards.find_one({
            "printed_card_number": req.nfc_card_number,
            "is_standalone": True,
            "user_id": None
        })
        if not linked_card:
            raise HTTPException(400, "Carte NFC non trouvée ou déjà associée à un compte")
    
    referrer_id = None
    if req.referral_code:
        ref = await db.users.find_one({"referral_code": req.referral_code})
        if ref: referrer_id = ref["id"]
    
    # Get country config for default currencies
    default_currency, secondary_currency = get_default_currencies(req.country)
    
    otp = gen_otp()
    uid = gen_id()
    doc = {
        "id": uid, "phone": req.phone, "name": req.name, 
        "email": req.email.lower() if req.email else None,
        "password": hash_pw(req.password), "role": "client",
        "country": req.country, "language": req.language,
        "is_active": True, "is_verified": False, "kyc_status": "pending",
        "account_number": gen_account(), "referral_code": gen_ref(req.name),
        "referred_by": referrer_id, "otp": otp, "profile_image": None,
        "primary_card_id": linked_card["id"] if linked_card else None,
        "free_card_used": False,  # Track if free card has been used
        "max_wallets": 2,  # Maximum wallets allowed
        "reset_token": None, "reset_token_expires": None,
        "created_at": now_iso()
    }
    await db.users.insert_one(doc)
    
    # Create primary wallet with country's default currency
    await db.wallets.insert_one({
        "id": gen_id(), "user_id": uid, "currency": default_currency,
        "balance": 0.0, "is_primary": True, "created_at": now_iso()
    })
    
    # Create secondary wallet
    await db.wallets.insert_one({
        "id": gen_id(), "user_id": uid, "currency": secondary_currency,
        "balance": 0.0, "is_primary": False, "created_at": now_iso()
    })
    
    # Link the standalone card to the new user
    if linked_card:
        await db.virtual_cards.update_one(
            {"id": linked_card["id"]},
            {"$set": {
                "user_id": uid,
                "owner_name": req.name,
                "is_standalone": False,
                "linked_at": now_iso(),
                "status": "approved"  # Auto-approve linked cards
            }}
        )
    
    if referrer_id:
        await db.referrals.insert_one({
            "id": gen_id(), "referrer_id": referrer_id, "referred_user_id": uid,
            "reward_amount": 5.0, "status": "pending", "created_at": now_iso()
        })
    
    # Send OTP via WhatsApp
    try:
        await send_whatsapp_otp(req.phone, otp)
    except Exception as e:
        logger.error(f"Failed to send OTP via WhatsApp: {e}")
    
    logger.info(f"Registered: {req.phone}")
    return {"message": "Inscription réussie. Un code OTP a été envoyé via WhatsApp.", "user_id": uid}

@api_router.post("/auth/verify-otp")
async def verify_otp(req: OTPReq):
    user = await db.users.find_one({"phone": req.phone})
    if not user: raise HTTPException(404, "Utilisateur non trouvé")
    if user.get("otp") != req.otp: raise HTTPException(400, "OTP incorrect")
    await db.users.update_one({"phone": req.phone}, {"$set": {"is_verified": True, "otp": None}})
    user.pop("_id", None); user.pop("password", None); user.pop("otp", None)
    return {"token": create_token(user["id"], user["role"]), "user": user, "message": "Compte vérifié"}


@api_router.post("/auth/resend-otp")
async def resend_otp(phone: str = Body(..., embed=True)):
    """Resend OTP via WhatsApp"""
    user = await db.users.find_one({"phone": phone})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    otp = str(random.randint(100000, 999999))
    await db.users.update_one({"phone": phone}, {"$set": {"otp": otp}})
    
    # Send OTP via WhatsApp
    try:
        await send_whatsapp_otp(phone, otp)
    except Exception as e:
        logger.error(f"Failed to send OTP via WhatsApp: {e}")
    
    return {"message": "Code OTP envoyé via WhatsApp"}


@api_router.post("/auth/login")
async def login(req: LoginReq):
    """Login with phone OR email - CLIENT ONLY"""
    user = None
    if req.phone:
        user = await db.users.find_one({"phone": req.phone})
    elif req.email:
        user = await db.users.find_one({"email": req.email.lower()})
    
    if not user or not verify_pw(req.password, user.get("password", "")):
        raise HTTPException(401, "Identifiants incorrects")
    
    # Block non-client roles from client login
    if user.get("role") in NON_CLIENT_ROLES:
        raise HTTPException(401, "Identifiants incorrects")
    
    if not user.get("is_active"): raise HTTPException(403, "Compte suspendu")
    
    # Registration OTP was never completed - block login and re-send OTP
    # instead of granting a session, so identity verification can't be skipped.
    if not user.get("is_verified"):
        otp = gen_otp()
        await db.users.update_one({"id": user["id"]}, {"$set": {"otp": otp}})
        try:
            await send_whatsapp_otp(user.get("phone"), otp)
        except Exception as e:
            logger.error(f"Failed to resend registration OTP: {e}")
        return {
            "requires_otp_verification": True,
            "phone": user.get("phone"),
            "message": "Veuillez confirmer votre inscription avec le code OTP envoyé via WhatsApp"
        }
    
    # Check if 2FA is enabled
    if user.get("two_factor_enabled"):
        # Generate and send 2FA OTP
        otp = str(random.randint(100000, 999999))
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "two_factor_otp": otp,
                "two_factor_otp_expires": expires.isoformat()
            }}
        )
        
        # Send OTP via WhatsApp
        try:
            await send_whatsapp_otp(user.get("phone"), otp, is_2fa=True)
        except Exception as e:
            logger.error(f"Failed to send 2FA OTP: {e}")
        
        return {
            "requires_2fa": True,
            "user_id": user["id"],
            "message": "Code de vérification envoyé via WhatsApp"
        }
    
    user.pop("_id", None); user.pop("password", None)
    # Generate unique session ID and store it
    session_id = str(uuid.uuid4())
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_session_id": session_id, "last_login_at": now_iso()}})
    return {
        "token": create_token(user["id"], user["role"], session_id),
        "user": user,
        "requires_password_change": not bool(user.get("password_changed_at")),
    }


@api_router.post("/auth/verify-2fa")
async def verify_2fa(user_id: str = Body(...), otp: str = Body(...)):
    """Verify 2FA OTP for login"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    if user.get("two_factor_otp") != otp:
        raise HTTPException(400, "Code OTP incorrect")
    
    expires = user.get("two_factor_otp_expires")
    if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
        raise HTTPException(400, "Code OTP expiré")
    
    # Clear 2FA OTP
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"two_factor_otp": None, "two_factor_otp_expires": None}}
    )
    
    user.pop("_id", None)
    user.pop("password", None)
    user.pop("two_factor_otp", None)
    user.pop("two_factor_otp_expires", None)
    
    # Generate unique session ID
    session_id = str(uuid.uuid4())
    await db.users.update_one({"id": user_id}, {"$set": {"active_session_id": session_id, "last_login_at": now_iso()}})
    return {
        "token": create_token(user["id"], user["role"], session_id),
        "user": user,
        "requires_password_change": not bool(user.get("password_changed_at")),
    }


@api_router.post("/auth/admin/login")
async def admin_login(req: LoginReq):
    """Login for admin/manager roles ONLY"""
    user = None
    if req.phone:
        user = await db.users.find_one({"phone": req.phone})
    elif req.email:
        user = await db.users.find_one({"email": req.email.lower()})
    
    if not user or not verify_pw(req.password, user.get("password", "")):
        raise HTTPException(401, "Identifiants incorrects")
    
    # Only allow non-client roles
    if user.get("role") not in NON_CLIENT_ROLES:
        raise HTTPException(401, "Identifiants incorrects")
    
    if not user.get("is_active"): raise HTTPException(403, "Compte suspendu")
    if user.get("is_suspended"): raise HTTPException(403, "Compte suspendu")
    
    # Check if 2FA is enabled
    if user.get("two_factor_enabled"):
        otp = str(random.randint(100000, 999999))
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"two_factor_otp": otp, "two_factor_otp_expires": expires.isoformat()}}
        )
        try:
            await send_whatsapp_otp(user.get("phone"), otp, is_2fa=True)
        except Exception as e:
            logger.error(f"Failed to send 2FA OTP: {e}")
        return {
            "requires_2fa": True,
            "user_id": user["id"],
            "message": "Code de vérification envoyé via WhatsApp"
        }
    
    user.pop("_id", None); user.pop("password", None)
    # Generate unique session ID for admin login
    session_id = str(uuid.uuid4())
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_session_id": session_id, "last_login_at": now_iso()}})
    return {
        "token": create_token(user["id"], user["role"], session_id),
        "user": user,
        "requires_password_change": not bool(user.get("password_changed_at")),
    }


@api_router.post("/auth/forgot-password")
async def forgot_password(email: str = Body(..., embed=True)):
    """Send password reset link via email AND WhatsApp"""
    user = await db.users.find_one({"email": email.lower()})
    if not user:
        # Don't reveal if email exists
        return {"message": "Si l'adresse existe, un lien a été envoyé"}
    
    # Generate reset token
    reset_token = gen_reset_token()
    expires = datetime.now(timezone.utc) + timedelta(minutes=30)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "reset_token": reset_token,
            "reset_token_expires": expires.isoformat()
        }}
    )
    
    # Build reset URL
    reset_url = f"https://monityworld.com/reset-password?token={reset_token}"
    
    # Send via WhatsApp if phone exists
    if user.get("phone"):
        try:
            message = f"Monity World - Réinitialisation de mot de passe\\n\\nCliquez sur ce lien pour réinitialiser votre mot de passe:\\n{reset_url}\\n\\nCe lien expire dans 30 minutes.\\n\\nSi vous n'avez pas demandé cette réinitialisation, ignorez ce message."
            await send_whatsapp_message(user["phone"], message)
        except Exception as e:
            logger.error(f"Failed to send reset link via WhatsApp: {e}")
    
    # TODO: Send via email in production
    logger.info(f"Password reset for {email}: {reset_url}")
    
    return {"message": "Lien de réinitialisation envoyé par email et WhatsApp"}


@api_router.post("/auth/admin/request-password-reset")
async def request_admin_password_reset(email: str = Body(..., embed=True)):
    user = await db.users.find_one({"email": email.lower(), "role": {"$in": NON_CLIENT_ROLES}})
    if not user:
        return {"message": "Si l'adresse existe, un code a été envoyé"}
    otp = gen_otp()
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "admin_password_reset_otp": hash_pw(otp),
        "admin_password_reset_expires": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    }})
    try:
        await send_email_otp(user["email"], otp, user.get("country"))
    except Exception as exc:
        logger.error("Admin password reset email failed: %s", exc)
        raise HTTPException(503, "Le service email n'est pas configuré")
    return {"message": "Code OTP envoyé à l'adresse mail du compte"}


@api_router.post("/auth/admin/reset-password")
async def reset_admin_password(
    email: str = Body(...),
    otp: str = Body(...),
    new_password: str = Body(...),
):
    user = await db.users.find_one({"email": email.lower(), "role": {"$in": NON_CLIENT_ROLES}})
    if not user or not user.get("admin_password_reset_otp"):
        raise HTTPException(400, "Code OTP incorrect ou expiré")
    expires = user.get("admin_password_reset_expires")
    if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
        raise HTTPException(400, "Code OTP expiré")
    if not verify_pw(otp, user["admin_password_reset_otp"]):
        raise HTTPException(400, "Code OTP incorrect")
    if len(new_password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "password": hash_pw(new_password),
        "password_changed_at": now_iso(),
        "admin_password_reset_otp": None,
        "admin_password_reset_expires": None,
    }})
    return {"message": "Mot de passe réinitialisé avec succès"}


@api_router.post("/auth/toggle-2fa")
async def toggle_two_factor(enable: bool = Body(..., embed=True), u=Depends(get_current_user)):
    """Enable or disable 2FA for user account"""
    await db.users.update_one(
        {"id": u["id"]},
        {"$set": {"two_factor_enabled": enable}}
    )
    
    status = "activée" if enable else "désactivée"
    return {"message": f"Double authentification {status}", "two_factor_enabled": enable}

@api_router.post("/auth/change-password")
async def change_password(req: PasswordChangeReq, u=Depends(get_current_user)):
    """Change password for authenticated user"""
    user = await db.users.find_one({"id": u["id"]})
    if not verify_pw(req.current_password, user.get("password", "")):
        raise HTTPException(400, "Mot de passe actuel incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(400, "Le nouveau mot de passe doit contenir au moins 6 caractères")
    
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "password": hash_pw(req.new_password),
        "password_changed_at": now_iso(),
    }})
    return {"message": "Mot de passe modifié avec succès"}

@api_router.post("/auth/request-reset")
async def request_password_reset(req: PasswordResetRequestReq):
    """Request password reset via phone or email"""
    user = None
    if req.method == "email":
        user = await db.users.find_one({"email": req.identifier.lower()})
    else:
        user = await db.users.find_one({"phone": req.identifier})
    
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Generate reset token
    reset_token = gen_reset_token()
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "reset_token": reset_token,
            "reset_token_expires": expires.isoformat()
        }}
    )
    
    # In production, send email/SMS here
    logger.info(f"Password reset requested for {req.identifier}, token: {reset_token}")
    
    return {
        "message": f"Instructions envoyées par {'email' if req.method == 'email' else 'SMS'}",
        "reset_token": reset_token  # Remove in production - for demo only
    }

@api_router.post("/auth/reset-password")
async def reset_password(req: PasswordResetConfirmReq):
    """Reset password with token"""
    user = await db.users.find_one({"reset_token": req.token})
    if not user:
        raise HTTPException(400, "Token invalide")
    
    expires = user.get("reset_token_expires")
    if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
        raise HTTPException(400, "Token expiré")
    
    if len(req.new_password) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caractères")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password": hash_pw(req.new_password),
            "reset_token": None,
            "reset_token_expires": None
        }}
    )
    
    return {"message": "Mot de passe réinitialisé avec succès"}

@api_router.get("/auth/me")
async def me(u=Depends(get_current_user)): return u

@api_router.patch("/auth/profile")
async def update_profile(req: ProfileUpdateReq, u=Depends(get_current_user)):
    """Update user profile"""
    update = {}
    if req.name: update["name"] = req.name
    if req.language: update["language"] = req.language
    if req.email:
        # Check if email already exists
        existing = await db.users.find_one({"email": req.email.lower(), "id": {"$ne": u["id"]}})
        if existing:
            raise HTTPException(400, "Cet email est déjà utilisé")
        update["email"] = req.email.lower()
    
    if update:
        update["updated_at"] = now_iso()
        await db.users.update_one({"id": u["id"]}, {"$set": update})
    
    user = await db.users.find_one({"id": u["id"]}, {"_id": 0, "password": 0})
    return user

@api_router.post("/auth/upload-profile-image")
async def upload_profile_image(file: UploadFile = File(...), u=Depends(get_current_user)):
    """Upload profile image"""
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "Le fichier doit être une image")
    
    # Validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "L'image ne doit pas dépasser 5 Mo")
    
    # Generate unique filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    
    # Upload to object storage
    from utils.storage import upload_file as storage_upload
    storage_path = storage_upload(u['id'], content, file.filename, file.content_type or "image/jpeg", "profiles")
    
    # Update user profile with storage path
    image_url = f"/api/files/{storage_path}"
    await db.users.update_one({"id": u["id"]}, {"$set": {"profile_image": image_url, "profile_image_storage": storage_path}})
    
    return {"message": "Photo de profil mise à jour", "profile_image": image_url}


# === BIOMETRIC AUTHENTICATION (WebAuthn) ===
import webauthn
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    AuthenticatorAttachment,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport
)
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    base64url_to_bytes,
    options_to_json
)
from webauthn.helpers import bytes_to_base64url

# WebAuthn configuration - dynamically computed from request or env vars
# These will be set properly at runtime if env vars are not provided
RP_ID = os.environ.get("WEBAUTHN_RP_ID", "")  # Will be computed from request host if empty
RP_NAME = "Monity World"
ORIGIN = os.environ.get("WEBAUTHN_ORIGIN", "")  # Will be computed from request origin if empty


def get_webauthn_rp_id(request=None):
    """Get WebAuthn RP ID from env var or request host"""
    if RP_ID:
        return RP_ID
    if request:
        host = request.headers.get("host", "").split(":")[0]
        if host:
            return host
    return "localhost"


def get_webauthn_origin(request=None):
    """Get WebAuthn origin from env var or request"""
    if ORIGIN:
        return ORIGIN
    if request:
        # Try to get from X-Forwarded headers (behind proxy)
        proto = request.headers.get("x-forwarded-proto", "https")
        host = request.headers.get("host", "localhost")
        return f"{proto}://{host}"
    return "https://localhost"

# Biometric settings model
class BiometricSettingsReq(BaseModel):
    enabled: bool
    require_for_roles: Optional[List[str]] = None  # ['admin', 'merchant']


@api_router.get("/auth/biometric/status")
async def get_biometric_status(u=Depends(get_current_user)):
    """Get user's biometric authentication status"""
    credentials = await db.webauthn_credentials.find({"user_id": u["id"]}, {"_id": 0}).to_list(10)
    
    # Check if biometric is required for this user's role
    settings = await db.admin_settings.find_one({"key": "biometric_settings"})
    required_roles = settings.get("require_for_roles", []) if settings else []
    is_required = u.get("role") in required_roles
    
    return {
        "enabled": len(credentials) > 0,
        "credentials_count": len(credentials),
        "credentials": [{"id": c["credential_id"][:20] + "...", "created_at": c.get("created_at"), "name": c.get("name", "Appareil")} for c in credentials],
        "is_required": is_required,
        "user_role": u.get("role")
    }


@api_router.post("/auth/biometric/register/options")
async def get_biometric_registration_options(request: Request, u=Depends(get_current_user)):
    """Generate registration options for WebAuthn credential"""
    
    # Get dynamic RP_ID and store origin for verification
    rp_id = get_webauthn_rp_id(request)
    origin = get_webauthn_origin(request)
    
    # Get existing credentials to exclude
    existing_creds = await db.webauthn_credentials.find({"user_id": u["id"]}, {"credential_id": 1}).to_list(10)
    exclude_credentials = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c["credential_id"]))
        for c in existing_creds if c.get("credential_id")
    ]
    
    user_id_bytes = u["id"].encode('utf-8')
    
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=RP_NAME,
        user_id=user_id_bytes,
        user_name=u.get("phone", u.get("email", u["id"])),
        user_display_name=u.get("name", "Utilisateur"),
        exclude_credentials=exclude_credentials,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED
        ),
        timeout=60000
    )
    
    # Store challenge in database for verification (including origin for later verification)
    await db.webauthn_challenges.update_one(
        {"user_id": u["id"], "type": "registration"},
        {"$set": {
            "challenge": bytes_to_base64url(options.challenge),
            "rp_id": rp_id,
            "origin": origin,
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        }},
        upsert=True
    )
    
    # Convert options to JSON-serializable format
    return {
        "rp": {"id": options.rp.id, "name": options.rp.name},
        "user": {
            "id": bytes_to_base64url(options.user.id),
            "name": options.user.name,
            "displayName": options.user.display_name
        },
        "challenge": bytes_to_base64url(options.challenge),
        "pubKeyCredParams": [{"type": p.type, "alg": p.alg} for p in options.pub_key_cred_params],
        "timeout": options.timeout,
        "excludeCredentials": [{"type": "public-key", "id": bytes_to_base64url(c.id)} for c in exclude_credentials],
        "authenticatorSelection": {
            "authenticatorAttachment": "platform",
            "residentKey": "preferred",
            "userVerification": "required"
        },
        "attestation": "none"
    }


class BiometricRegistrationReq(BaseModel):
    id: str
    rawId: str
    response: dict
    type: str
    name: Optional[str] = "Mon appareil"


@api_router.post("/auth/biometric/register/verify")
async def verify_biometric_registration(req: BiometricRegistrationReq, u=Depends(get_current_user)):
    """Verify and store WebAuthn registration response"""
    
    # Get stored challenge
    challenge_doc = await db.webauthn_challenges.find_one({"user_id": u["id"], "type": "registration"})
    if not challenge_doc:
        raise HTTPException(400, "Session d'enregistrement expirée")
    
    # Check expiry
    if challenge_doc.get("expires_at", "") < now_iso():
        raise HTTPException(400, "Session d'enregistrement expirée")
    
    # Use the stored rp_id and origin from the challenge
    rp_id = challenge_doc.get("rp_id", get_webauthn_rp_id())
    origin = challenge_doc.get("origin", get_webauthn_origin())
    
    try:
        verification = verify_registration_response(
            credential={
                "id": req.id,
                "rawId": req.rawId,
                "response": {
                    "clientDataJSON": req.response.get("clientDataJSON"),
                    "attestationObject": req.response.get("attestationObject"),
                    "transports": req.response.get("transports", [])
                },
                "type": req.type,
                "authenticatorAttachment": "platform"
            },
            expected_challenge=base64url_to_bytes(challenge_doc["challenge"]),
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=True
        )
        
        # Store credential
        await db.webauthn_credentials.insert_one({
            "id": gen_id(),
            "user_id": u["id"],
            "credential_id": bytes_to_base64url(verification.credential_id),
            "public_key": bytes_to_base64url(verification.credential_public_key),
            "sign_count": verification.sign_count,
            "name": req.name or "Mon appareil",
            "created_at": now_iso(),
            "last_used_at": None
        })
        
        # Clean up challenge
        await db.webauthn_challenges.delete_one({"user_id": u["id"], "type": "registration"})
        
        return {"message": "Authentification biométrique activée", "success": True}
        
    except Exception as e:
        raise HTTPException(400, f"Échec de l'enregistrement biométrique: {str(e)}")


@api_router.post("/auth/biometric/authenticate/options")
async def get_biometric_authentication_options(request: Request, phone: str = None, email: str = None):
    """Generate authentication options for WebAuthn"""
    
    # Get dynamic RP_ID and origin
    rp_id = get_webauthn_rp_id(request)
    origin = get_webauthn_origin(request)
    
    # Find user by phone or email
    query = {}
    if phone:
        query["phone"] = phone
    elif email:
        query["email"] = email.lower()
    else:
        raise HTTPException(400, "Téléphone ou email requis")
    
    user = await db.users.find_one(query)
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Get user's credentials
    credentials = await db.webauthn_credentials.find({"user_id": user["id"]}).to_list(10)
    if not credentials:
        raise HTTPException(400, "Aucune méthode biométrique configurée")
    
    allow_credentials = [
        PublicKeyCredentialDescriptor(
            id=base64url_to_bytes(c["credential_id"]),
            transports=[AuthenticatorTransport.INTERNAL]
        )
        for c in credentials
    ]
    
    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.REQUIRED,
        timeout=60000
    )
    
    # Store challenge with rp_id and origin
    await db.webauthn_challenges.update_one(
        {"user_id": user["id"], "type": "authentication"},
        {"$set": {
            "challenge": bytes_to_base64url(options.challenge),
            "rp_id": rp_id,
            "origin": origin,
            "created_at": now_iso(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        }},
        upsert=True
    )
    
    return {
        "challenge": bytes_to_base64url(options.challenge),
        "timeout": options.timeout,
        "rpId": rp_id,
        "allowCredentials": [{"type": "public-key", "id": bytes_to_base64url(c.id), "transports": ["internal"]} for c in allow_credentials],
        "userVerification": "required",
        "user_id": user["id"]
    }


class BiometricAuthenticationReq(BaseModel):
    user_id: str
    id: str
    rawId: str
    response: dict
    type: str


@api_router.post("/auth/biometric/authenticate/verify")
async def verify_biometric_authentication(req: BiometricAuthenticationReq):
    """Verify WebAuthn authentication and return JWT token"""
    
    # Get user
    user = await db.users.find_one({"id": req.user_id})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check if suspended
    if user.get("is_suspended"):
        raise HTTPException(403, "Compte suspendu")
    
    # Get stored challenge
    challenge_doc = await db.webauthn_challenges.find_one({"user_id": req.user_id, "type": "authentication"})
    if not challenge_doc:
        raise HTTPException(400, "Session d'authentification expirée")
    
    # Get credential
    credential = await db.webauthn_credentials.find_one({
        "user_id": req.user_id,
        "credential_id": req.rawId
    })
    if not credential:
        raise HTTPException(400, "Credential non reconnu")
    
    # Use the stored rp_id and origin from the challenge
    rp_id = challenge_doc.get("rp_id", get_webauthn_rp_id())
    origin = challenge_doc.get("origin", get_webauthn_origin())
    
    try:
        verification = verify_authentication_response(
            credential={
                "id": req.id,
                "rawId": req.rawId,
                "response": {
                    "clientDataJSON": req.response.get("clientDataJSON"),
                    "authenticatorData": req.response.get("authenticatorData"),
                    "signature": req.response.get("signature"),
                    "userHandle": req.response.get("userHandle")
                },
                "type": req.type,
                "authenticatorAttachment": "platform"
            },
            expected_challenge=base64url_to_bytes(challenge_doc["challenge"]),
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=base64url_to_bytes(credential["public_key"]),
            credential_current_sign_count=credential.get("sign_count", 0),
            require_user_verification=True
        )
        
        # Update sign count
        await db.webauthn_credentials.update_one(
            {"id": credential["id"]},
            {"$set": {"sign_count": verification.new_sign_count, "last_used_at": now_iso()}}
        )
        
        # Clean up challenge
        await db.webauthn_challenges.delete_one({"user_id": req.user_id, "type": "authentication"})
        
        # Generate JWT token
        token = jwt.encode(
            {"sub": user["id"], "exp": datetime.now(timezone.utc) + timedelta(days=30)},
            os.environ.get("JWT_SECRET", "secret"),
            algorithm="HS256"
        )
        
        # Update last login
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login": now_iso(), "login_method": "biometric"}}
        )
        
        safe_user = {k: v for k, v in user.items() if k not in ["_id", "password", "otp", "reset_token"]}
        
        return {"token": token, "user": safe_user, "login_method": "biometric"}
        
    except Exception as e:
        raise HTTPException(400, f"Échec de l'authentification biométrique: {str(e)}")


@api_router.delete("/auth/biometric/credential/{credential_id}")
async def delete_biometric_credential(credential_id: str, u=Depends(get_current_user)):
    """Delete a biometric credential"""
    result = await db.webauthn_credentials.delete_one({
        "user_id": u["id"],
        "credential_id": {"$regex": f"^{credential_id[:20]}"}
    })
    
    if result.deleted_count == 0:
        raise HTTPException(404, "Credential non trouvé")
    
    return {"message": "Méthode biométrique supprimée"}


@api_router.get("/admin/biometric/settings")
async def get_biometric_settings(adm=Depends(get_admin)):
    """Get biometric authentication settings"""
    check_permission(adm, "settings.view")
    
    settings = await db.admin_settings.find_one({"key": "biometric_settings"})
    return {
        "enabled": settings.get("enabled", True) if settings else True,
        "require_for_roles": settings.get("require_for_roles", []) if settings else [],
        "available_roles": ["admin", "secondary_primary_admin", "manager"]
    }


@api_router.put("/admin/biometric/settings")
async def update_biometric_settings(req: BiometricSettingsReq, adm=Depends(get_admin_with_kyc)):
    """Update biometric authentication settings"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut modifier ces paramètres")
    
    await db.admin_settings.update_one(
        {"key": "biometric_settings"},
        {"$set": {
            "enabled": req.enabled,
            "require_for_roles": req.require_for_roles or [],
            "updated_at": now_iso(),
            "updated_by": adm["id"]
        }},
        upsert=True
    )
    
    await log_admin_activity(adm, "update", "settings", details={"setting": "biometric_settings", "enabled": req.enabled, "require_for_roles": req.require_for_roles})
    
    return {"message": "Paramètres biométriques mis à jour"}


# === WALLET ===
# Mobile app compatible endpoints (alias)
@api_router.get("/wallets")
async def get_wallets_mobile(u=Depends(get_current_user)):
    """Get user wallets - Mobile app compatible"""
    return await db.wallets.find({"user_id": u["id"]}, {"_id": 0}).to_list(100)

@api_router.post("/wallets/add")
async def add_wallet_mobile(req: WalletAddReq, u=Depends(get_current_user)):
    """Add a new wallet - Mobile app compatible"""
    existing = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency.upper()})
    if existing: 
        raise HTTPException(400, "Ce portefeuille existe déjà")
    
    wallet_count = await db.wallets.count_documents({"user_id": u["id"]})
    max_wallets = u.get("max_wallets", 2)
    if wallet_count >= max_wallets:
        raise HTTPException(400, f"Vous ne pouvez avoir que {max_wallets} devises.")
    
    doc = {"id": gen_id(), "user_id": u["id"], "currency": req.currency.upper(), "balance": 0.0, "is_primary": False, "created_at": now_iso()}
    await db.wallets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/wallets")
async def delete_wallet_mobile(currency: str = Body(...), convert_to: str = Body(None), u=Depends(get_current_user)):
    """Delete a wallet - Mobile app compatible"""
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency.upper()})
    if not wallet:
        raise HTTPException(404, "Portefeuille non trouvé")
    
    if wallet.get("balance", 0) > 0 and convert_to:
        # Convert balance before deleting
        dest_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": convert_to.upper()})
        if dest_wallet:
            rate = await get_exchange_rate(currency.upper(), convert_to.upper())
            converted = round(wallet["balance"] * rate, 2)
            await db.wallets.update_one({"id": dest_wallet["id"]}, {"$inc": {"balance": converted}})
    
    await db.wallets.delete_one({"id": wallet["id"]})
    return {"message": "Portefeuille supprimé"}

# Web app endpoints
@api_router.get("/wallet/wallets")
async def get_wallets(u=Depends(get_current_user)):
    return await db.wallets.find({"user_id": u["id"]}, {"_id": 0}).to_list(100)

@api_router.post("/wallet/wallets")
async def add_wallet(req: WalletAddReq, u=Depends(get_current_user)):
    """Add a new wallet - max 2 wallets per user"""
    existing = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency.upper()})
    if existing: 
        raise HTTPException(400, "Ce portefeuille existe déjà")
    
    # Check wallet count
    wallet_count = await db.wallets.count_documents({"user_id": u["id"]})
    max_wallets = u.get("max_wallets", 2)
    if wallet_count >= max_wallets:
        raise HTTPException(400, f"Vous ne pouvez avoir que {max_wallets} devises. Convertissez l'une de vos devises existantes pour en ajouter une nouvelle.")
    
    doc = {"id": gen_id(), "user_id": u["id"], "currency": req.currency.upper(), "balance": 0.0, "is_primary": False, "created_at": now_iso()}
    await db.wallets.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/wallet/wallets/{currency}")
async def remove_wallet(currency: str, u=Depends(get_current_user)):
    """Remove a wallet - must have 0 balance"""
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency.upper()})
    if not wallet:
        raise HTTPException(404, "Portefeuille non trouvé")
    
    if wallet.get("is_primary"):
        raise HTTPException(400, "Impossible de supprimer le portefeuille principal")
    
    if wallet.get("balance", 0) > 0:
        raise HTTPException(400, "Le portefeuille doit être vide. Convertissez d'abord vos fonds.")
    
    await db.wallets.delete_one({"id": wallet["id"]})
    return {"message": f"Portefeuille {currency} supprimé"}


@api_router.post("/wallet/delete-with-conversion")
async def delete_wallet_with_conversion(req: WalletDeleteReq, u=Depends(get_current_user)):
    """Delete a wallet and convert its balance to another wallet"""
    wallet_to_delete = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency.upper()})
    if not wallet_to_delete:
        raise HTTPException(404, f"Portefeuille {req.currency} non trouvé")
    
    if wallet_to_delete.get("is_primary"):
        raise HTTPException(400, "Impossible de supprimer le portefeuille principal")
    
    wallet_count = await db.wallets.count_documents({"user_id": u["id"]})
    if wallet_count <= 1:
        raise HTTPException(400, "Vous devez avoir au moins un portefeuille")
    
    balance = wallet_to_delete.get("balance", 0)
    
    # If balance > 0, convert to destination wallet
    if balance > 0:
        if not req.convert_to:
            raise HTTPException(400, "Le portefeuille a un solde. Spécifiez une devise de destination pour la conversion.")
        
        dest_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.convert_to.upper()})
        if not dest_wallet:
            raise HTTPException(404, f"Portefeuille destination {req.convert_to} non trouvé")
        
        # Get exchange rates
        from_cur = await db.currencies.find_one({"code": req.currency.upper()})
        to_cur = await db.currencies.find_one({"code": req.convert_to.upper()})
        
        from_rate = from_cur["rate_to_usd"] if from_cur else 1.0
        to_rate = to_cur["rate_to_usd"] if to_cur else 1.0
        
        # Apply conversion fee (1.5%)
        fee_percent = 1.5
        usd_amount = balance / from_rate
        fee_usd = usd_amount * (fee_percent / 100)
        net_usd = usd_amount - fee_usd
        converted_amount = net_usd * to_rate
        fee_in_dest = fee_usd * to_rate
        
        # Add to destination wallet
        await db.wallets.update_one({"id": dest_wallet["id"]}, {"$inc": {"balance": round(converted_amount, 2)}})
        
        # Record conversion transaction
        await db.transactions.insert_one({
            "id": gen_id(),
            "user_id": u["id"],
            "type": "conversion",
            "from_currency": req.currency.upper(),
            "to_currency": req.convert_to.upper(),
            "from_amount": balance,
            "to_amount": round(converted_amount, 2),
            "fee": round(fee_in_dest, 2),
            "fee_percent": fee_percent,
            "rate": to_rate / from_rate,
            "note": "Conversion lors de la suppression de portefeuille",
            "status": "completed",
            "created_at": now_iso()
        })
    
    # Delete the wallet
    await db.wallets.delete_one({"id": wallet_to_delete["id"]})
    
    return {
        "message": f"Portefeuille {req.currency} supprimé",
        "converted_amount": round(converted_amount, 2) if balance > 0 else 0,
        "conversion_fee": round(fee_in_dest, 2) if balance > 0 else 0,
        "destination_currency": req.convert_to if balance > 0 else None
    }


@api_router.post("/wallet/convert-and-replace")
async def convert_and_replace_wallet(req: WalletConvertAndReplaceReq, u=Depends(get_current_user)):
    """
    Create a new wallet by converting and replacing an existing one.
    This allows having a max of 2 wallets at any time.
    """
    # Validate source wallet exists
    source_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.source_currency.upper()})
    if not source_wallet:
        raise HTTPException(404, f"Portefeuille {req.source_currency} non trouvé")
    
    if source_wallet.get("is_primary"):
        raise HTTPException(400, "Impossible de remplacer le portefeuille principal")
    
    # Check target currency doesn't already exist
    existing_target = await db.wallets.find_one({"user_id": u["id"], "currency": req.target_currency.upper()})
    if existing_target:
        raise HTTPException(400, f"Vous avez déjà un portefeuille {req.target_currency}")
    
    # Validate target currency exists in system
    target_cur = await db.currencies.find_one({"code": req.target_currency.upper()})
    if not target_cur:
        raise HTTPException(400, f"Devise {req.target_currency} non supportée")
    
    balance = source_wallet.get("balance", 0)
    converted_amount = 0
    fee_amount = 0
    
    # Convert balance if any
    if balance > 0:
        from_cur = await db.currencies.find_one({"code": req.source_currency.upper()})
        from_rate = from_cur["rate_to_usd"] if from_cur else 1.0
        to_rate = target_cur["rate_to_usd"]
        
        # Calculate with fee
        fee_percent = req.conversion_fee_percent
        usd_amount = balance / from_rate
        fee_usd = usd_amount * (fee_percent / 100)
        net_usd = usd_amount - fee_usd
        converted_amount = round(net_usd * to_rate, 2)
        fee_amount = round(fee_usd * to_rate, 2)
        
        # Record conversion transaction
        await db.transactions.insert_one({
            "id": gen_id(),
            "user_id": u["id"],
            "type": "conversion",
            "from_currency": req.source_currency.upper(),
            "to_currency": req.target_currency.upper(),
            "from_amount": balance,
            "to_amount": converted_amount,
            "fee": fee_amount,
            "fee_percent": fee_percent,
            "rate": to_rate / from_rate,
            "note": "Conversion et remplacement de portefeuille",
            "status": "completed",
            "created_at": now_iso()
        })
    
    # Delete source wallet
    await db.wallets.delete_one({"id": source_wallet["id"]})
    
    # Create new wallet with converted balance
    new_wallet = {
        "id": gen_id(),
        "user_id": u["id"],
        "currency": req.target_currency.upper(),
        "balance": converted_amount,
        "is_primary": False,
        "created_at": now_iso()
    }
    await db.wallets.insert_one(new_wallet)
    
    return {
        "message": f"Portefeuille {req.source_currency} converti en {req.target_currency}",
        "old_currency": req.source_currency.upper(),
        "old_balance": balance,
        "new_currency": req.target_currency.upper(),
        "new_balance": converted_amount,
        "conversion_fee": fee_amount,
        "fee_percent": req.conversion_fee_percent
    }


@api_router.post("/wallet/conversion-preview")
async def conversion_preview(
    from_currency: str,
    to_currency: str,
    amount: float,
    u=Depends(get_current_user)
):
    """Preview a conversion with fees before executing"""
    from_cur = await db.currencies.find_one({"code": from_currency.upper()})
    to_cur = await db.currencies.find_one({"code": to_currency.upper()})
    
    if not from_cur or not to_cur:
        raise HTTPException(400, "Devise non supportée")
    
    from_rate = from_cur["rate_to_usd"]
    to_rate = to_cur["rate_to_usd"]
    
    # Calculate without fee
    usd_amount = amount / from_rate
    gross_converted = usd_amount * to_rate
    
    # Calculate with fee (1.5%)
    fee_percent = 1.5
    fee_usd = usd_amount * (fee_percent / 100)
    net_usd = usd_amount - fee_usd
    net_converted = net_usd * to_rate
    fee_in_target = fee_usd * to_rate
    
    return {
        "from_currency": from_currency.upper(),
        "to_currency": to_currency.upper(),
        "from_amount": amount,
        "exchange_rate": round(to_rate / from_rate, 6),
        "gross_amount": round(gross_converted, 2),
        "fee_percent": fee_percent,
        "fee_amount": round(fee_in_target, 2),
        "net_amount": round(net_converted, 2),
        "rate_info": f"1 {from_currency.upper()} = {round(to_rate/from_rate, 4)} {to_currency.upper()}"
    }


@api_router.post("/wallet/convert")
async def convert_currency(
    from_currency: str, 
    to_currency: str, 
    amount: float,
    u=Depends(get_current_user)
):
    """Convert all or part of one currency to another"""
    from_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": from_currency.upper()})
    if not from_wallet:
        raise HTTPException(404, f"Portefeuille {from_currency} non trouvé")
    
    if from_wallet["balance"] < amount:
        raise HTTPException(400, "Solde insuffisant")
    
    # Get exchange rates
    from_cur = await db.currencies.find_one({"code": from_currency.upper()})
    to_cur = await db.currencies.find_one({"code": to_currency.upper()})
    
    from_rate = from_cur["rate_to_usd"] if from_cur else 1.0
    to_rate = to_cur["rate_to_usd"] if to_cur else 1.0
    
    # Convert: from_currency -> USD -> to_currency
    usd_amount = amount / from_rate
    converted_amount = usd_amount * to_rate
    
    # Check if to_wallet exists
    to_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": to_currency.upper()})
    if not to_wallet:
        # Check if user can create new wallet
        wallet_count = await db.wallets.count_documents({"user_id": u["id"]})
        if wallet_count >= 2:
            raise HTTPException(400, "Vous avez déjà 2 devises. Supprimez d'abord une devise avec solde 0.")
        
        # Create new wallet
        to_wallet = {"id": gen_id(), "user_id": u["id"], "currency": to_currency.upper(), "balance": 0.0, "is_primary": False, "created_at": now_iso()}
        await db.wallets.insert_one(to_wallet)
    
    # Deduct from source
    await db.wallets.update_one({"id": from_wallet["id"]}, {"$inc": {"balance": -amount}})
    
    # Add to destination
    await db.wallets.update_one({"id": to_wallet["id"]}, {"$inc": {"balance": converted_amount}})
    
    # Record transaction
    await db.transactions.insert_one({
        "id": gen_id(),
        "user_id": u["id"],
        "type": "conversion",
        "from_currency": from_currency.upper(),
        "to_currency": to_currency.upper(),
        "from_amount": amount,
        "to_amount": round(converted_amount, 2),
        "rate": to_rate / from_rate,
        "status": "completed",
        "created_at": now_iso()
    })
    
    return {
        "message": "Conversion effectuée",
        "from_amount": amount,
        "from_currency": from_currency.upper(),
        "to_amount": round(converted_amount, 2),
        "to_currency": to_currency.upper(),
        "rate": round(to_rate / from_rate, 4)
    }

@api_router.get("/wallet/balance")
async def get_balance(u=Depends(get_current_user)):
    ws = await db.wallets.find({"user_id": u["id"]}, {"_id": 0}).to_list(100)
    primary = next((w for w in ws if w.get("is_primary")), ws[0] if ws else None)
    total_usd = 0.0
    for w in ws:
        cur = await db.currencies.find_one({"code": w["currency"]}, {"_id": 0})
        rate = cur["rate_to_usd"] if cur else 1.0
        total_usd += w["balance"] / rate
    return {
        "primary_balance": primary["balance"] if primary else 0.0,
        "primary_currency": primary["currency"] if primary else "USD",
        "total_usd": round(total_usd, 2), "wallets": ws
    }


@api_router.post("/wallet/transfer/preview")
async def transfer_preview(req: TransferReq, u=Depends(get_current_user)):
    """Preview transfer with exchange rate and fees calculation"""
    if req.amount <= 0: 
        raise HTTPException(400, "Montant invalide")
    
    # Block non-client roles from making transfers
    if u.get("role") in NON_CLIENT_ROLES:
        raise HTTPException(403, "Les comptes administrateurs ne peuvent pas effectuer de transferts")
    
    # Get sender's wallet
    sw = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
    if not sw: 
        raise HTTPException(400, f"Portefeuille {req.currency} non trouvé")
    
    # Find receiver
    receiver = None
    if req.receiver_phone:
        receiver = await db.users.find_one({"phone": req.receiver_phone})
    elif req.receiver_account:
        receiver = await db.users.find_one({"account_number": req.receiver_account})
    if not receiver: 
        raise HTTPException(404, "Destinataire non trouvé")
    if receiver["id"] == u["id"]: 
        raise HTTPException(400, "Auto-transfert interdit")
    if receiver.get("role") in NON_CLIENT_ROLES:
        raise HTTPException(404, "Destinataire non trouvé")
    
    # Determine countries
    sender_country = u.get("country", "CD")
    receiver_country = receiver.get("country", "CD")
    is_international = sender_country != receiver_country
    
    # Determine target currency
    target_currency = req.target_currency or req.currency
    
    # Get receiver's wallets
    receiver_wallets = await db.wallets.find({"user_id": receiver["id"]}).to_list(10)
    receiver_currencies = [w["currency"] for w in receiver_wallets]
    
    # Check if receiver has the target currency wallet (create if not exists on transfer)
    receiver_has_currency = target_currency in receiver_currencies
    
    # Get appropriate rule
    if is_international:
        rule = await get_international_rule(sender_country, receiver_country)
        tx_type = "international"
    else:
        rule = await get_transaction_rule(sender_country, "transfer")
        tx_type = "transfer"
    
    # Calculate base fee
    base_fee = calculate_fee(req.amount, rule)
    
    # Calculate exchange rate if currencies are different
    exchange_rate = 1.0
    conversion_fee = 0.0
    conversion_fee_percent = 2.0  # 2% conversion fee
    received_amount = req.amount
    
    if req.currency != target_currency:
        # Get exchange rate with margin
        margin = rule.get("exchange_rate_margin", 2.0) if is_international else conversion_fee_percent
        exchange_rate = await get_exchange_rate(req.currency, target_currency, margin)
        
        # Calculate conversion fee (separate from transfer fee)
        conversion_fee = round(req.amount * (conversion_fee_percent / 100), 2)
        
        # Calculate received amount after conversion
        received_amount = round((req.amount - conversion_fee) * exchange_rate, 2)
    else:
        received_amount = req.amount
    
    # Total to debit from sender
    total_debit = req.amount + base_fee
    
    # Check balance
    has_sufficient_balance = sw["balance"] >= total_debit
    
    return {
        "preview": True,
        "sender": {
            "name": u["name"],
            "phone": u["phone"],
            "country": sender_country,
            "wallet_balance": sw["balance"],
            "wallet_currency": req.currency
        },
        "receiver": {
            "id": receiver["id"],
            "name": receiver["name"],
            "phone": receiver["phone"],
            "country": receiver_country,
            "available_currencies": receiver_currencies,
            "has_target_currency": receiver_has_currency
        },
        "transfer": {
            "amount": req.amount,
            "source_currency": req.currency,
            "target_currency": target_currency,
            "is_conversion": req.currency != target_currency,
            "exchange_rate": exchange_rate,
            "conversion_fee": conversion_fee,
            "conversion_fee_percent": conversion_fee_percent if req.currency != target_currency else 0,
            "transfer_fee": base_fee,
            "total_fees": round(base_fee + conversion_fee, 2),
            "total_debit": total_debit,
            "received_amount": received_amount,
            "received_currency": target_currency
        },
        "is_international": is_international,
        "tx_type": tx_type,
        "has_sufficient_balance": has_sufficient_balance,
        "balance_after": round(sw["balance"] - total_debit, 2) if has_sufficient_balance else None
    }


@api_router.post("/wallet/transfer")
async def transfer(req: TransferReq, u=Depends(get_current_user)):
    if req.amount <= 0: raise HTTPException(400, "Montant invalide")
    
    # Idempotency check
    if hasattr(req, 'idempotency_key') and req.idempotency_key:
        existing = await db.idempotency_keys.find_one({"key": req.idempotency_key, "user_id": u["id"]})
        if existing:
            return existing.get("response", {"message": "Opération déjà effectuée", "duplicate": True})
    
    # Block non-client roles from making transfers
    if u.get("role") in NON_CLIENT_ROLES:
        raise HTTPException(403, "Les comptes administrateurs ne peuvent pas effectuer de transferts")
    
    sw = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
    if not sw: raise HTTPException(400, f"Portefeuille {req.currency} non trouvé")
    
    # Find receiver
    receiver = None
    if req.receiver_phone:
        receiver = await db.users.find_one({"phone": req.receiver_phone})
    elif req.receiver_account:
        receiver = await db.users.find_one({"account_number": req.receiver_account})
    if not receiver: raise HTTPException(404, "Destinataire non trouvé")
    if receiver["id"] == u["id"]: raise HTTPException(400, "Auto-transfert interdit")
    if receiver.get("role") in NON_CLIENT_ROLES: raise HTTPException(404, "Destinataire non trouvé")
    
    # Determine if international transfer
    sender_country = u.get("country", "CD")
    receiver_country = receiver.get("country", "CD")
    is_international = sender_country != receiver_country
    
    # Determine target currency
    target_currency = req.target_currency or req.currency
    is_conversion = req.currency != target_currency
    
    # Get appropriate rule
    if is_international:
        rule = await get_international_rule(sender_country, receiver_country)
        tx_type = "international"
    else:
        rule = await get_transaction_rule(sender_country, "transfer")
        tx_type = "transfer"
    
    # Check limits
    limit_check = await check_transaction_limits(u["id"], req.amount, tx_type, rule)
    if not limit_check["allowed"]:
        raise HTTPException(400, "; ".join(limit_check["errors"]))
    
    # Calculate base transfer fee
    base_fee = calculate_fee(req.amount, rule)
    
    # Calculate conversion fee if currencies are different
    conversion_fee = 0.0
    conversion_fee_percent = 2.0  # 2% conversion fee
    exchange_rate = 1.0
    received_amount = req.amount
    
    if is_conversion:
        # Calculate conversion fee
        conversion_fee = round(req.amount * (conversion_fee_percent / 100), 2)
        
        # Get exchange rate with margin
        margin = rule.get("exchange_rate_margin", 2.0) if is_international else conversion_fee_percent
        exchange_rate = await get_exchange_rate(req.currency, target_currency, margin)
        
        # Calculate received amount after conversion (conversion fee is deducted before conversion)
        received_amount = round((req.amount - conversion_fee) * exchange_rate, 2)
    
    # Total to debit: amount + base_fee (conversion fee is included in the received amount calculation)
    total = req.amount + base_fee
    total_fees = base_fee + conversion_fee
    
    if sw["balance"] < total: 
        raise HTTPException(400, f"Solde insuffisant. Disponible: {sw['balance']} {req.currency}, Requis: {total} (montant: {req.amount} + frais: {base_fee})")
    
    # Deduct sender immediately
    await db.wallets.update_one({"user_id": u["id"], "currency": req.currency}, {"$inc": {"balance": -total}})
    n = now_iso()
    
    # Auto-complete small transactions, pending for larger ones
    tx_status = "completed" if req.amount < 200 else "pending"
    tx_id = gen_id()
    
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": u["id"], "sender_name": u["name"], "sender_phone": u["phone"],
        "sender_country": sender_country,
        "receiver_id": receiver["id"], "receiver_name": receiver["name"], "receiver_phone": receiver["phone"],
        "receiver_country": receiver_country,
        "amount": req.amount, "fee": base_fee, "conversion_fee": conversion_fee, "total_fees": total_fees,
        "currency": req.currency, 
        "received_amount": received_amount, "received_currency": target_currency,
        "exchange_rate": exchange_rate, "is_conversion": is_conversion,
        "type": tx_type, "is_international": is_international,
        "status": tx_status, "description": req.description or ("Transfert international" if is_international else ("Transfert avec conversion" if is_conversion else "Transfert")),
        "created_at": n, "completed_at": n if tx_status == "completed" else None, "admin_note": None,
        "rule_applied": {
            "fee_type": rule.get("fee_type"), "fee_value": rule.get("fee_value"),
            "daily_limit": rule.get("daily_limit"), "monthly_limit": rule.get("monthly_limit")
        }
    })
    
    if tx_status == "completed":
        rw = await db.wallets.find_one({"user_id": receiver["id"], "currency": target_currency})
        if rw:
            await db.wallets.update_one({"user_id": receiver["id"], "currency": target_currency}, {"$inc": {"balance": received_amount}})
        else:
            await db.wallets.insert_one({"id": gen_id(), "user_id": receiver["id"], "currency": target_currency, "balance": received_amount, "is_primary": False, "created_at": n})
        
        # Notifications
        if is_conversion:
            sender_msg = f"Vous avez envoyé {req.amount} {req.currency} à {receiver['name']} (converti en {received_amount} {target_currency})"
            receiver_msg = f"Vous avez reçu {received_amount} {target_currency} de {u['name']} (envoyé: {req.amount} {req.currency})"
        elif is_international:
            sender_msg = f"Vous avez envoyé {req.amount} {req.currency} à {receiver['name']} (reçu: {received_amount} {target_currency})"
            receiver_msg = f"Vous avez reçu {received_amount} {target_currency} de {u['name']} (envoyé: {req.amount} {req.currency})"
        else:
            sender_msg = f"Vous avez envoyé {req.amount} {req.currency} à {receiver['name']}"
            receiver_msg = f"Vous avez reçu {req.amount} {req.currency} de {u['name']}"
        
        await db.notifications.insert_many([
            {"id": gen_id(), "user_id": u["id"], "message": sender_msg, "type": "transaction", "is_read": False, "created_at": n},
            {"id": gen_id(), "user_id": receiver["id"], "message": receiver_msg, "type": "transaction", "is_read": False, "created_at": n}
        ])
    
    response = {
        "message": "En attente de validation admin" if tx_status == "pending" else "Transfert réussi", 
        "transaction_id": tx_id, "status": tx_status, 
        "amount": req.amount, "fee": base_fee, "conversion_fee": conversion_fee, "total_fees": total_fees,
        "total_debited": total,
        "source_currency": req.currency,
        "received_amount": received_amount,
        "received_currency": target_currency,
        "exchange_rate": exchange_rate if is_conversion else None,
        "is_conversion": is_conversion,
        "receiver": receiver["name"],
        "daily_remaining": limit_check["daily_remaining"],
        "monthly_remaining": limit_check["monthly_remaining"]
    }
    if is_international:
        response["is_international"] = True
        response["exchange_rate"] = exchange_rate
        response["received_amount"] = received_amount
        response["received_currency"] = target_currency
    
    # Store idempotency key
    if hasattr(req, 'idempotency_key') and req.idempotency_key:
        await db.idempotency_keys.insert_one({
            "key": req.idempotency_key,
            "user_id": u["id"],
            "response": response,
            "created_at": datetime.now(timezone.utc)
        })
    
    return response

@api_router.post("/wallet/recharge")
async def recharge(req: RechargeReq, u=Depends(get_current_user)):
    # Get rule for recharge
    user_country = u.get("country", "CD")
    rule = await get_transaction_rule(user_country, "recharge")
    
    # Check limits
    limit_check = await check_transaction_limits(u["id"], req.amount, "recharge", rule)
    if not limit_check["allowed"]:
        raise HTTPException(400, "; ".join(limit_check["errors"]))
    
    # Calculate fee (usually 0 for recharge, but configurable)
    fee = calculate_fee(req.amount, rule)
    
    tx_id = gen_id(); n = now_iso()
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": None, "sender_name": "Système", "sender_phone": None,
        "receiver_id": u["id"], "receiver_name": u["name"], "receiver_phone": u["phone"],
        "receiver_country": user_country,
        "amount": req.amount, "fee": fee, "currency": req.currency, "type": "recharge",
        "status": "pending", "description": f"Rechargement {req.method}", 
        "created_at": n, "completed_at": None, "admin_note": None,
        "rule_applied": {
            "fee_type": rule.get("fee_type"), "fee_value": rule.get("fee_value"),
            "daily_limit": rule.get("daily_limit"), "monthly_limit": rule.get("monthly_limit")
        }
    })
    return {
        "message": "Rechargement en attente de validation", 
        "transaction_id": tx_id, "status": "pending",
        "amount": req.amount, "fee": fee,
        "daily_remaining": limit_check["daily_remaining"],
        "monthly_remaining": limit_check["monthly_remaining"]
    }

@api_router.post("/wallet/withdraw")
async def withdraw(req: WithdrawReq, u=Depends(get_current_user)):
    w = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
    if not w: raise HTTPException(400, "Portefeuille non trouvé")
    
    # Get rule for withdrawal
    user_country = u.get("country", "CD")
    rule = await get_transaction_rule(user_country, "withdrawal")
    
    # Check limits
    limit_check = await check_transaction_limits(u["id"], req.amount, "withdrawal", rule)
    if not limit_check["allowed"]:
        raise HTTPException(400, "; ".join(limit_check["errors"]))
    
    # Calculate fee
    fee = calculate_fee(req.amount, rule)
    total = req.amount + fee
    
    if w["balance"] < total: 
        raise HTTPException(400, f"Solde insuffisant. Disponible: {w['balance']} {req.currency}, Requis: {total} (montant: {req.amount} + frais: {fee})")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": req.currency}, {"$inc": {"balance": -total}})
    tx_id = gen_id(); n = now_iso()
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": u["id"], "sender_name": u["name"], "sender_phone": u["phone"],
        "sender_country": user_country,
        "receiver_id": None, "receiver_name": "Retrait", "receiver_phone": req.destination,
        "amount": req.amount, "fee": fee, "currency": req.currency, "type": "withdrawal",
        "status": "pending", "description": f"Retrait {req.method} - {req.destination}", 
        "created_at": n, "completed_at": None, "admin_note": None,
        "rule_applied": {
            "fee_type": rule.get("fee_type"), "fee_value": rule.get("fee_value"),
            "daily_limit": rule.get("daily_limit"), "monthly_limit": rule.get("monthly_limit")
        }
    })
    return {
        "message": "Retrait en attente de validation", 
        "transaction_id": tx_id, "fee": fee, "status": "pending",
        "total_debited": total,
        "daily_remaining": limit_check["daily_remaining"],
        "monthly_remaining": limit_check["monthly_remaining"]
    }

@api_router.get("/wallet/transactions")
async def get_transactions(page: int = 1, limit: int = 20, u=Depends(get_current_user)):
    skip = (page - 1) * limit
    q = {"$or": [{"sender_id": u["id"]}, {"receiver_id": u["id"]}]}
    total = await db.transactions.count_documents(q)
    txs = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"transactions": txs, "total": total, "page": page, "pages": -(-total // limit)}


# === CARDS ===
@api_router.get("/cards")
async def get_cards(u=Depends(get_current_user)):
    return await db.cards.find({"user_id": u["id"]}, {"_id": 0, "pin": 0}).to_list(20)

@api_router.post("/cards")
async def create_card(req: CardReq, u=Depends(get_current_user)):
    now_dt = datetime.now(timezone.utc)
    doc = {
        "id": gen_id(), "user_id": u["id"],
        "card_number": f"**** **** **** {''.join(random.choices(string.digits, k=4))}",
        "card_type": req.card_type, "balance": 0.0, "limit": req.limit,
        "is_locked": False, "expiry_date": f"{now_dt.month:02d}/{(now_dt.year+3)%100:02d}",
        "currency": "USD", "created_at": now_dt.isoformat()
    }
    await db.cards.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.patch("/cards/{card_id}/lock")
async def toggle_lock(card_id: str, u=Depends(get_current_user)):
    card = await db.cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card: raise HTTPException(404, "Carte non trouvée")
    new_status = not card.get("is_locked", False)
    await db.cards.update_one({"id": card_id}, {"$set": {"is_locked": new_status}})
    return {"message": f"Carte {'verrouillée' if new_status else 'déverrouillée'}", "is_locked": new_status}

@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str, u=Depends(get_current_user)):
    card = await db.cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card: raise HTTPException(404, "Carte non trouvée")
    await db.cards.delete_one({"id": card_id})
    return {"message": "Carte supprimée"}


# === SAVINGS ===
@api_router.get("/savings")
async def get_savings(u=Depends(get_current_user)):
    return await db.savings.find({"user_id": u["id"]}, {"_id": 0}).to_list(50)

@api_router.post("/savings")
async def create_savings(req: SavingsReq, u=Depends(get_current_user)):
    w = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
    if not w or w["balance"] < req.amount: raise HTTPException(400, "Solde insuffisant")
    now_dt = datetime.now(timezone.utc)
    rate = 0.08 if req.type == "fixed" else 0.05
    locked = (now_dt + timedelta(days=30 * req.duration_months)).isoformat() if req.type == "fixed" and req.duration_months else None
    doc = {
        "id": gen_id(), "user_id": u["id"], "type": req.type, "amount": req.amount,
        "currency": req.currency, "interest_rate": rate, "locked_until": locked,
        "status": "active", "created_at": now_dt.isoformat()
    }
    await db.savings.insert_one(doc)
    await db.wallets.update_one({"user_id": u["id"], "currency": req.currency}, {"$inc": {"balance": -req.amount}})
    doc.pop("_id", None)
    return doc

@api_router.post("/savings/v2")
async def create_savings_v2(req: SavingsReqV2, u=Depends(get_current_user)):
    """Create savings with advanced options (frequency, auto-debit)"""
    now_dt = datetime.now(timezone.utc)
    rate = 0.08 if req.type == "fixed" else 0.05
    
    doc = {
        "id": gen_id(), 
        "user_id": u["id"],
        "name": req.name,
        "type": req.type,  # flexible, fixed
        "target_amount": req.target_amount,
        "contribution_amount": req.contribution_amount,
        "currency": req.currency, 
        "frequency": req.frequency,  # daily, weekly, biweekly, monthly, quarterly
        "auto_debit": req.auto_debit,
        "duration_months": req.duration_months,
        "interest_rate": rate,
        "total_contributed": 0,
        "next_contribution_date": now_dt.isoformat(),
        "status": "active", 
        "created_at": now_dt.isoformat()
    }
    await db.savings.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/savings/{sid}/contribute")
async def contribute_to_savings(sid: str, amount: Optional[float] = None, u=Depends(get_current_user)):
    """Manual contribution to savings"""
    s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
    if not s:
        raise HTTPException(404, "Épargne non trouvée")
    if s.get("status") != "active":
        raise HTTPException(400, "Cette épargne n'est plus active")
    
    contribution = amount or s.get("contribution_amount", 0)
    if contribution <= 0:
        raise HTTPException(400, "Montant invalide")
    
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": s["currency"]})
    if not wallet or wallet["balance"] < contribution:
        raise HTTPException(400, "Solde insuffisant")
    
    # Deduct from wallet
    await db.wallets.update_one(
        {"user_id": u["id"], "currency": s["currency"]},
        {"$inc": {"balance": -contribution}}
    )
    
    # Add to savings
    new_total = s.get("total_contributed", s.get("amount", 0)) + contribution
    await db.savings.update_one(
        {"id": sid},
        {
            "$inc": {"total_contributed": contribution, "amount": contribution},
            "$set": {"last_contribution": now_iso()}
        }
    )
    
    return {
        "message": f"Contribution de {contribution} {s['currency']} effectuée",
        "new_total": new_total,
        "remaining": max(0, s.get("target_amount", 0) - new_total) if s.get("target_amount") else None
    }

@api_router.patch("/savings/{sid}")
async def update_savings_settings(sid: str, auto_debit: Optional[bool] = None, frequency: Optional[str] = None,
                        contribution_amount: Optional[float] = None, u=Depends(get_current_user)):
    """Update savings settings"""
    s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
    if not s:
        raise HTTPException(404, "Épargne non trouvée")
    
    update = {}
    if auto_debit is not None: update["auto_debit"] = auto_debit
    if frequency: update["frequency"] = frequency
    if contribution_amount is not None: update["contribution_amount"] = contribution_amount
    
    if update:
        update["updated_at"] = now_iso()
        await db.savings.update_one({"id": sid}, {"$set": update})
    
    return {"message": "Épargne mise à jour"}

@api_router.delete("/savings/{sid}")
async def withdraw_savings(sid: str, u=Depends(get_current_user)):
    s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
    if not s: raise HTTPException(404, "Épargne non trouvée")
    if s.get("status") == "completed": raise HTTPException(400, "Épargne déjà retirée")
    if s.get("locked_until"):
        ld = datetime.fromisoformat(s["locked_until"])
        if ld.tzinfo is None: ld = ld.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < ld: raise HTTPException(400, f"Épargne verrouillée jusqu'au {s['locked_until'][:10]}")
    cd = datetime.fromisoformat(s["created_at"])
    if cd.tzinfo is None: cd = cd.replace(tzinfo=timezone.utc)
    days = (datetime.now(timezone.utc) - cd).days
    interest = round(s["amount"] * s["interest_rate"] * (days / 365), 2)
    total = s["amount"] + interest
    await db.wallets.update_one({"user_id": u["id"], "currency": s["currency"]}, {"$inc": {"balance": total}})
    await db.savings.update_one({"id": sid}, {"$set": {"status": "completed"}})
    return {"message": "Épargne retirée avec succès", "amount": s["amount"], "interest": interest, "total": total}


# === GROUPS ===
@api_router.get("/groups")
async def get_groups(u=Depends(get_current_user)):
    return await db.groups.find({"$or": [{"creator_id": u["id"]}, {"members": u["id"]}]}, {"_id": 0}).to_list(50)

@api_router.post("/groups")
async def create_group(req: GroupReq, u=Depends(get_current_user)):
    invite_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    doc = {
        "id": gen_id(), 
        "name": req.name, 
        "description": req.description,
        "creator_id": u["id"], 
        "creator_name": u["name"],
        "members": [u["id"]], 
        "member_names": {u["id"]: u["name"]},
        "admins": [u["id"]],  # Group admins
        "contribution_amount": req.contribution_amount,
        "currency": req.currency, 
        "frequency": req.frequency,  # daily, weekly, biweekly, monthly, quarterly
        "auto_debit": req.auto_debit,
        "max_members": req.max_members,
        "total_collected": 0,
        "current_pot": 0,  # Current cycle pot amount
        "status": "active", 
        "invite_code": invite_code,
        "pending_invitations": [],  # List of pending invitation user IDs
        "pending_join_requests": [],  # List of users waiting admin approval
        # Rotation system
        "rotation_order": [u["id"]],  # Order of beneficiaries
        "current_cycle": 1,  # Current rotation cycle
        "current_beneficiary_index": 0,  # Index in rotation_order
        "payout_history": [],  # History of payouts
        "cycle_contributions": {},  # {user_id: amount} for current cycle
        "created_at": now_iso()
    }
    await db.groups.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/groups/{group_id}")
async def get_group_details(group_id: str, u=Depends(get_current_user)):
    """Get detailed group information"""
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []) and u["id"] not in group.get("pending_invitations", []):
        raise HTTPException(403, "Vous n'avez pas accès à ce groupe")
    
    # Get member details
    members = []
    for member_id in group.get("members", []):
        member = await db.users.find_one({"id": member_id}, {"_id": 0, "password": 0, "transaction_pin": 0})
        if member:
            members.append({
                "id": member["id"],
                "name": member["name"],
                "phone": member["phone"],
                "is_admin": member_id in group.get("admins", []),
                "is_creator": member_id == group["creator_id"]
            })
    
    group["members_details"] = members
    return group

@api_router.post("/groups/{group_id}/invite")
async def invite_to_group(group_id: str, req: GroupInviteReq, u=Depends(get_current_user)):
    """Invite users to group by phone numbers"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    invited = []
    already_member = []
    not_found = []
    already_invited = []
    
    for phone in req.phone_numbers:
        # Find user by phone
        target_user = await db.users.find_one({"phone": phone})
        if not target_user:
            not_found.append(phone)
            continue
        
        if target_user["id"] in group.get("members", []):
            already_member.append(phone)
            continue
        
        if target_user["id"] in group.get("pending_invitations", []):
            already_invited.append(phone)
            continue
        
        # Check max members
        if len(group.get("members", [])) + len(group.get("pending_invitations", [])) >= group.get("max_members", 10):
            break
        
        # Add to pending invitations
        await db.groups.update_one(
            {"id": group_id},
            {"$addToSet": {"pending_invitations": target_user["id"]}}
        )
        
        # Create invitation notification
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": target_user["id"],
            "type": "group_invitation",
            "title": "Invitation à rejoindre un groupe",
            "message": f"{u['name']} vous invite à rejoindre le groupe '{group['name']}'",
            "data": {
                "group_id": group_id,
                "group_name": group["name"],
                "inviter_id": u["id"],
                "inviter_name": u["name"],
                "contribution_amount": group["contribution_amount"],
                "currency": group["currency"],
                "frequency": group["frequency"]
            },
            "is_read": False,
            "created_at": now_iso()
        })
        
        invited.append({"phone": phone, "name": target_user["name"]})
    
    return {
        "invited": invited,
        "already_member": already_member,
        "already_invited": already_invited,
        "not_found": not_found,
        "message": f"{len(invited)} invitation(s) envoyée(s)"
    }

@api_router.get("/groups/invitations/pending")
async def get_pending_invitations(u=Depends(get_current_user)):
    """Get all pending group invitations for current user"""
    invitations = await db.notifications.find({
        "user_id": u["id"],
        "type": "group_invitation",
        "is_read": False
    }, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    return {"invitations": invitations}

@api_router.post("/groups/{group_id}/invitation/respond")
async def respond_to_invitation(group_id: str, req: InvitationResponseReq, u=Depends(get_current_user)):
    """Accept or reject group invitation"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("pending_invitations", []):
        raise HTTPException(400, "Aucune invitation en attente pour ce groupe")
    
    # Remove from pending
    await db.groups.update_one(
        {"id": group_id},
        {"$pull": {"pending_invitations": u["id"]}}
    )
    
    # Mark notification as read
    await db.notifications.update_many(
        {"user_id": u["id"], "type": "group_invitation", "data.group_id": group_id},
        {"$set": {"is_read": True}}
    )
    
    if req.action == "accept":
        # Add to members
        await db.groups.update_one(
            {"id": group_id},
            {
                "$addToSet": {"members": u["id"]},
                "$set": {f"member_names.{u['id']}": u["name"]}
            }
        )
        
        # Add system message
        await db.group_messages.insert_one({
            "id": gen_id(),
            "group_id": group_id,
            "sender_id": "system",
            "sender_name": "Système",
            "content": f"{u['name']} a rejoint le groupe",
            "type": "member_joined",
            "created_at": now_iso()
        })
        
        return {"message": f"Vous avez rejoint le groupe '{group['name']}'", "status": "accepted"}
    else:
        return {"message": "Invitation refusée", "status": "rejected"}

@api_router.post("/groups/join/request")
async def request_to_join_group(req: GroupJoinRequestReq, u=Depends(get_current_user)):
    """Request to join a group via invite code (requires admin approval)"""
    group = await db.groups.find_one({"invite_code": req.invite_code})
    if not group:
        raise HTTPException(404, "Code d'invitation invalide")
    
    if u["id"] in group.get("members", []):
        raise HTTPException(400, "Vous êtes déjà membre de ce groupe")
    
    if u["id"] in group.get("pending_join_requests", []):
        raise HTTPException(400, "Votre demande est déjà en attente d'approbation")
    
    if len(group.get("members", [])) >= group.get("max_members", 10):
        raise HTTPException(400, "Ce groupe est complet")
    
    # Add to pending join requests
    await db.groups.update_one(
        {"id": group["id"]},
        {"$addToSet": {"pending_join_requests": u["id"]}}
    )
    
    # Notify group admins
    for admin_id in group.get("admins", [group["creator_id"]]):
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": admin_id,
            "type": "join_request",
            "title": "Nouvelle demande d'adhésion",
            "message": f"{u['name']} souhaite rejoindre le groupe '{group['name']}'",
            "data": {
                "group_id": group["id"],
                "group_name": group["name"],
                "requester_id": u["id"],
                "requester_name": u["name"],
                "requester_phone": u["phone"]
            },
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {
        "message": f"Demande envoyée pour rejoindre '{group['name']}'. En attente d'approbation.",
        "group_name": group["name"],
        "status": "pending"
    }

@api_router.get("/groups/{group_id}/join-requests")
async def get_join_requests(group_id: str, u=Depends(get_current_user)):
    """Get pending join requests for a group (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent voir les demandes")
    
    requests = []
    for req_user_id in group.get("pending_join_requests", []):
        req_user = await db.users.find_one({"id": req_user_id}, {"_id": 0, "password": 0})
        if req_user:
            requests.append({
                "id": req_user["id"],
                "name": req_user["name"],
                "phone": req_user["phone"],
                "country": req_user.get("country", "CD")
            })
    
    return {"requests": requests}

@api_router.post("/groups/{group_id}/join-requests/{user_id}/respond")
async def respond_to_join_request(group_id: str, user_id: str, action: str, u=Depends(get_current_user)):
    """Approve or reject a join request (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent approuver les demandes")
    
    if user_id not in group.get("pending_join_requests", []):
        raise HTTPException(400, "Aucune demande en attente pour cet utilisateur")
    
    # Remove from pending
    await db.groups.update_one(
        {"id": group_id},
        {"$pull": {"pending_join_requests": user_id}}
    )
    
    requester = await db.users.find_one({"id": user_id})
    
    if action == "approve":
        # Add to members
        await db.groups.update_one(
            {"id": group_id},
            {
                "$addToSet": {"members": user_id},
                "$set": {f"member_names.{user_id}": requester["name"] if requester else "Membre"}
            }
        )
        
        # Notify requester
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": user_id,
            "type": "join_approved",
            "title": "Demande approuvée",
            "message": f"Votre demande pour rejoindre '{group['name']}' a été approuvée",
            "data": {"group_id": group_id, "group_name": group["name"]},
            "is_read": False,
            "created_at": now_iso()
        })
        
        # Add system message
        if requester:
            await db.group_messages.insert_one({
                "id": gen_id(),
                "group_id": group_id,
                "sender_id": "system",
                "sender_name": "Système",
                "content": f"{requester['name']} a rejoint le groupe",
                "type": "member_joined",
                "created_at": now_iso()
            })
        
        return {"message": "Demande approuvée", "status": "approved"}
    else:
        # Notify rejection
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": user_id,
            "type": "join_rejected",
            "title": "Demande refusée",
            "message": f"Votre demande pour rejoindre '{group['name']}' a été refusée",
            "data": {"group_id": group_id, "group_name": group["name"]},
            "is_read": False,
            "created_at": now_iso()
        })
        
        return {"message": "Demande refusée", "status": "rejected"}

@api_router.post("/groups/{group_id}/admin/{user_id}")
async def toggle_group_admin(group_id: str, user_id: str, u=Depends(get_current_user)):
    """Add or remove admin role for a member (creator only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] != group["creator_id"]:
        raise HTTPException(403, "Seul le créateur peut gérer les administrateurs")
    
    if user_id not in group.get("members", []):
        raise HTTPException(400, "Cet utilisateur n'est pas membre du groupe")
    
    if user_id == group["creator_id"]:
        raise HTTPException(400, "Le créateur est toujours administrateur")
    
    if user_id in group.get("admins", []):
        await db.groups.update_one({"id": group_id}, {"$pull": {"admins": user_id}})
        return {"message": "Rôle admin retiré", "is_admin": False}
    else:
        await db.groups.update_one({"id": group_id}, {"$addToSet": {"admins": user_id}})
        return {"message": "Rôle admin ajouté", "is_admin": True}

@api_router.delete("/groups/{group_id}/members/{user_id}")
async def remove_group_member(group_id: str, user_id: str, u=Depends(get_current_user)):
    """Remove a member from group or leave group"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    # User can remove themselves (leave) or admin can remove others
    if user_id == u["id"]:
        # User leaving
        if user_id == group["creator_id"]:
            raise HTTPException(400, "Le créateur ne peut pas quitter le groupe. Transférez d'abord la propriété.")
    else:
        # Admin removing someone
        if u["id"] not in group.get("admins", [group["creator_id"]]):
            raise HTTPException(403, "Seuls les administrateurs peuvent retirer des membres")
    
    if user_id not in group.get("members", []):
        raise HTTPException(400, "Cet utilisateur n'est pas membre du groupe")
    
    await db.groups.update_one(
        {"id": group_id},
        {
            "$pull": {"members": user_id, "admins": user_id},
            "$unset": {f"member_names.{user_id}": ""}
        }
    )
    
    # Add system message
    removed_user = await db.users.find_one({"id": user_id})
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{removed_user['name'] if removed_user else 'Un membre'} a quitté le groupe",
        "type": "member_left",
        "created_at": now_iso()
    })
    
    return {"message": "Membre retiré du groupe"}

@api_router.patch("/groups/{group_id}")
async def update_group(group_id: str, name: Optional[str] = None, description: Optional[str] = None, 
                       contribution_amount: Optional[float] = None, frequency: Optional[str] = None,
                       auto_debit: Optional[bool] = None, u=Depends(get_current_user)):
    """Update group settings (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent modifier le groupe")
    
    update = {}
    if name: update["name"] = name
    if description is not None: update["description"] = description
    if contribution_amount is not None: update["contribution_amount"] = contribution_amount
    if frequency: update["frequency"] = frequency
    if auto_debit is not None: update["auto_debit"] = auto_debit
    
    if update:
        update["updated_at"] = now_iso()
        await db.groups.update_one({"id": group_id}, {"$set": update})
    
    return {"message": "Groupe mis à jour"}

@api_router.post("/groups/join/{code}")
async def join_group_direct(code: str, u=Depends(get_current_user)):
    """Join group directly with invite code (deprecated - use request flow)"""
    g = await db.groups.find_one({"invite_code": code})
    if not g: raise HTTPException(404, "Groupe non trouvé")
    if u["id"] in g.get("members", []): raise HTTPException(400, "Vous êtes déjà membre")
    if len(g.get("members", [])) >= g.get("max_members", 10): raise HTTPException(400, "Groupe complet")
    await db.groups.update_one({"invite_code": code}, {"$push": {"members": u["id"]}})
    return {"message": f"Vous avez rejoint le groupe {g['name']}", "group_name": g["name"]}


# === REFERRAL ===
@api_router.get("/referral/stats")
async def referral_stats(u=Depends(get_current_user)):
    refs = await db.referrals.find({"referrer_id": u["id"]}, {"_id": 0}).to_list(100)
    return {
        "referral_code": u.get("referral_code"),
        "total_referrals": len(refs),
        "total_earned": sum(r["reward_amount"] for r in refs if r["status"] == "paid"),
        "pending_rewards": sum(r["reward_amount"] for r in refs if r["status"] == "pending"),
        "referrals": refs
    }


# === CURRENCIES ===
@api_router.get("/currencies")
async def get_currencies():
    return await db.currencies.find({"is_active": True}, {"_id": 0}).to_list(100)

@api_router.get("/currencies/convert")
async def convert(from_cur: str, to_cur: str, amount: float):
    f = await db.currencies.find_one({"code": from_cur.upper()}, {"_id": 0})
    t = await db.currencies.find_one({"code": to_cur.upper()}, {"_id": 0})
    if not f or not t: raise HTTPException(404, "Devise non trouvée")
    usd = amount / f["rate_to_usd"]
    converted = usd * t["rate_to_usd"]
    return {"from": from_cur.upper(), "to": to_cur.upper(), "amount": amount, "converted": round(converted, 2), "rate": round(t["rate_to_usd"] / f["rate_to_usd"], 6)}


# === PROFILE ===
@api_router.get("/profile")
async def get_profile(u=Depends(get_current_user)): return u

@api_router.patch("/profile")
async def update_profile_simple(req: ProfileReq, u=Depends(get_current_user)):
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if update: await db.users.update_one({"id": u["id"]}, {"$set": update})
    return {"message": "Profil mis à jour"}

# KYC Document type configuration
KYC_DOCUMENT_TYPES = {
    "national_id": {
        "name": "Carte d'identité nationale",
        "requires_front": True,
        "requires_back": True,
        "description": "Recto et verso de votre carte d'identité"
    },
    "passport": {
        "name": "Passeport",
        "requires_front": True,
        "requires_back": False,
        "description": "Page d'information de votre passeport"
    },
    "voter_card": {
        "name": "Carte d'électeur",
        "requires_front": True,
        "requires_back": True,
        "description": "Recto et verso de votre carte d'électeur"
    },
    "driving_license": {
        "name": "Permis de conduire",
        "requires_front": True,
        "requires_back": True,
        "description": "Recto et verso de votre permis de conduire"
    }
}

@api_router.get("/profile/kyc/document-types")
async def get_kyc_document_types():
    """Get available KYC document types and their requirements"""
    return {"document_types": KYC_DOCUMENT_TYPES}


@api_router.post("/profile/kyc/personal-info")
async def save_kyc_personal_info(req: KYCPersonalInfoReq, u=Depends(get_current_user)):
    """Save KYC personal information"""
    user = await db.users.find_one({"id": u["id"]})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Only allow updating if KYC is not approved
    if user.get("kyc_status") == "approved":
        raise HTTPException(400, "Impossible de modifier les informations d'un KYC approuvé")
    
    # Store personal info
    personal_info = {
        "last_name": req.last_name.strip(),
        "first_name": req.first_name.strip(),
        "date_of_birth": req.date_of_birth,
        "place_of_birth": req.place_of_birth.strip(),
        "occupation": req.occupation.strip() if req.occupation else None,
        "residence_address": req.residence_address.strip(),
        "postal_box": req.postal_box.strip() if req.postal_box else None,
        "postal_code": req.postal_code.strip() if req.postal_code else None,
        "street": req.street.strip() if req.street else None,
        "city": req.city.strip() if req.city else None,
        "country": req.country or user.get("country", "CD"),
        "submitted_at": now_iso()
    }
    
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "kyc_personal_info": personal_info,
        "kyc_personal_info_submitted": True
    }})
    
    return {"message": "Informations personnelles enregistrées", "personal_info": personal_info}


@api_router.get("/profile/kyc/personal-info")
async def get_kyc_personal_info(u=Depends(get_current_user)):
    """Get KYC personal information"""
    user = await db.users.find_one({"id": u["id"]})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    return {
        "personal_info": user.get("kyc_personal_info"),
        "submitted": user.get("kyc_personal_info_submitted", False)
    }


@api_router.get("/profile/kyc/status")
async def get_kyc_status(u=Depends(get_current_user)):
    """Get current KYC status and submitted documents"""
    user = await db.users.find_one({"id": u["id"]})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check if personal info is complete
    personal_info = user.get("kyc_personal_info", {})
    personal_info_complete = all([
        personal_info.get("last_name"),
        personal_info.get("first_name"),
        personal_info.get("date_of_birth"),
        personal_info.get("place_of_birth"),
        personal_info.get("residence_address")
    ])
    
    # Check if documents are complete
    documents = user.get("kyc_documents", [])
    doc_type = user.get("kyc_document_type")
    doc_config = KYC_DOCUMENT_TYPES.get(doc_type, {}) if doc_type else {}
    has_front = any(d.get("side") == "front" for d in documents)
    has_back = any(d.get("side") == "back" for d in documents)
    documents_complete = has_front and (has_back or not doc_config.get("requires_back", False))
    
    # KYC is fully submitted only if both personal info and documents are complete
    kyc_ready_for_review = personal_info_complete and documents_complete
    
    return {
        "kyc_status": user.get("kyc_status", "pending"),
        "kyc_document_type": doc_type,
        "kyc_submitted_at": user.get("kyc_submitted_at"),
        "kyc_reviewed_at": user.get("kyc_reviewed_at"),
        "kyc_review_note": user.get("kyc_review_note"),
        "documents": documents,
        "personal_info": personal_info,
        "personal_info_submitted": user.get("kyc_personal_info_submitted", False),
        "personal_info_complete": personal_info_complete,
        "documents_complete": documents_complete,
        "kyc_ready_for_review": kyc_ready_for_review,
        "discrepancies": user.get("kyc_discrepancies", [])
    }

@api_router.post("/profile/kyc")
async def kyc_upload(
    document_type: str = Form(...), 
    side: str = Form(...),  # "front" or "back"
    file: UploadFile = File(...), 
    u=Depends(get_current_user)
):
    """Upload KYC identity document (front or back)"""
    # Validate document type
    if document_type not in KYC_DOCUMENT_TYPES:
        raise HTTPException(400, f"Type de document invalide. Types acceptés: {', '.join(KYC_DOCUMENT_TYPES.keys())}")
    
    doc_config = KYC_DOCUMENT_TYPES[document_type]
    
    # Validate side
    if side not in ["front", "back"]:
        raise HTTPException(400, "Côté invalide. Utilisez 'front' ou 'back'")
    
    # Check if back is required for this document type
    if side == "back" and not doc_config["requires_back"]:
        raise HTTPException(400, f"Le {doc_config['name']} ne nécessite pas de verso")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Format non supporté. Utilisez JPG, PNG, WebP ou PDF")
    
    # Read and validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Le fichier ne doit pas dépasser 5 Mo")
    
    # Generate unique filename and upload to object storage
    from utils.storage import upload_file as storage_upload
    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    storage_path = storage_upload(u['id'], content, file.filename, file.content_type or "image/jpeg", "kyc")
    
    # Get existing documents list or create new
    user = await db.users.find_one({"id": u["id"]})
    existing_docs = user.get("kyc_documents", [])
    
    # Remove existing document of same type and side
    existing_docs = [d for d in existing_docs if not (d.get("document_type") == document_type and d.get("side") == side)]
    
    # Add new document
    new_doc = {
        "id": gen_id(),
        "document_type": document_type,
        "document_name": doc_config["name"],
        "side": side,
        "side_label": "Recto" if side == "front" else "Verso",
        "storage_path": storage_path,
        "original_filename": file.filename,
        "file_path": f"/api/files/{storage_path}",
        "file_size": len(content),
        "content_type": file.content_type,
        "uploaded_at": now_iso()
    }
    existing_docs.append(new_doc)
    
    # Check if all required documents are uploaded
    has_front = any(d.get("document_type") == document_type and d.get("side") == "front" for d in existing_docs)
    has_back = any(d.get("document_type") == document_type and d.get("side") == "back" for d in existing_docs)
    
    is_complete = has_front and (has_back or not doc_config["requires_back"])
    
    # Determine KYC status
    new_status = "submitted" if is_complete else "incomplete"
    
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "kyc_documents": existing_docs,
        "kyc_document_type": document_type,
        "kyc_document_name": doc_config["name"],
        "kyc_status": new_status,
        "kyc_submitted_at": now_iso() if is_complete else user.get("kyc_submitted_at"),
        "kyc_filename": file.filename
    }})
    
    # Prepare response message
    if is_complete:
        message = f"Document KYC complet. {doc_config['name']} soumis pour validation."
    else:
        if doc_config["requires_back"]:
            missing = "verso" if has_front else "recto"
            message = f"Document {side == 'front' and 'recto' or 'verso'} enregistré. Veuillez soumettre le {missing}."
        else:
            message = "Document KYC soumis. En attente de validation."
    
    return {
        "message": message,
        "document": new_doc,
        "is_complete": is_complete,
        "kyc_status": new_status
    }

@api_router.delete("/profile/kyc/documents")
async def clear_kyc_documents(u=Depends(get_current_user)):
    """Clear all KYC documents to start fresh"""
    user = await db.users.find_one({"id": u["id"]})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Only allow clearing if not approved
    if user.get("kyc_status") == "approved":
        raise HTTPException(400, "Impossible de supprimer les documents d'un KYC approuvé")
    
    # Delete physical files
    kyc_dir = ROOT_DIR / "uploads" / "kyc"
    for doc in user.get("kyc_documents", []):
        try:
            filepath = kyc_dir / doc.get("filename", "")
            if filepath.exists():
                filepath.unlink()
        except Exception:
            pass
    
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "kyc_documents": [],
        "kyc_document_type": None,
        "kyc_document_name": None,
        "kyc_status": "pending",
        "kyc_submitted_at": None,
        "kyc_filename": None
    }})
    
    return {"message": "Documents KYC supprimés"}


# === NOTIFICATIONS ===
@api_router.get("/notifications")
async def get_notifs(u=Depends(get_current_user)):
    ns = await db.notifications.find({"user_id": u["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"notifications": ns, "unread_count": sum(1 for n in ns if not n.get("is_read"))}

@api_router.patch("/notifications/{notif_id}/read")
async def mark_notif_read(notif_id: str, u=Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": u["id"]}, {"$set": {"is_read": True}})
    return {"message": "Notification lue"}

@api_router.patch("/notifications/read-all")
async def read_all_notifs(u=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": u["id"]}, {"$set": {"is_read": True}})
    return {"message": "Toutes les notifications lues"}


# === GROUP MESSAGING ===
@api_router.get("/groups/{group_id}/messages")
async def get_group_messages(group_id: str, page: int = 1, limit: int = 50, u=Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    skip = (page - 1) * limit
    messages = await db.group_messages.find(
        {"group_id": group_id}, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {"messages": list(reversed(messages)), "group": group["name"]}

@api_router.post("/groups/{group_id}/messages")
async def send_group_message(group_id: str, content: str, u=Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    doc = {
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": u["id"],
        "sender_name": u["name"],
        "content": content,
        "type": "text",
        "created_at": now_iso()
    }
    await db.group_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/groups/{group_id}/contribute")
async def contribute_to_group(group_id: str, amount: Optional[float] = None, u=Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    contribution = amount or group["contribution_amount"]
    currency = group["currency"]
    
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
    if not wallet or wallet["balance"] < contribution:
        raise HTTPException(400, "Solde insuffisant")
    
    n = now_iso()
    
    # Deduct from user
    await db.wallets.update_one({"user_id": u["id"], "currency": currency}, {"$inc": {"balance": -contribution}})
    
    # Add to group pool
    await db.groups.update_one({"id": group_id}, {"$inc": {"total_collected": contribution}})
    
    # Record contribution
    await db.group_contributions.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "user_id": u["id"],
        "user_name": u["name"],
        "amount": contribution,
        "currency": currency,
        "created_at": n
    })
    
    # Add system message
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{u['name']} a contribué {contribution} {currency}",
        "type": "contribution",
        "created_at": n
    })
    
    return {"message": f"Contribution de {contribution} {currency} effectuée"}

@api_router.get("/groups/{group_id}/contributions")
async def get_group_contributions(group_id: str, u=Depends(get_current_user)):
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    contributions = await db.group_contributions.find({"group_id": group_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    total = sum(c["amount"] for c in contributions)
    
    return {"contributions": contributions, "total": total, "currency": group["currency"]}


# === MANAGED ACCOUNTS (Parental/Manager Control) ===
@api_router.get("/managed-accounts")
async def get_managed_accounts(u=Depends(get_current_user)):
    """Get accounts that the current user manages"""
    managed = await db.managed_accounts.find({"manager_id": u["id"], "status": "active"}, {"_id": 0}).to_list(50)
    result = []
    for m in managed:
        managed_user = await db.users.find_one({"id": m["managed_user_id"]}, {"_id": 0, "password": 0})
        if managed_user:
            result.append({**m, "managed_user": managed_user})
    return result

@api_router.get("/managed-by")
async def get_managers(u=Depends(get_current_user)):
    """Get accounts that manage the current user"""
    managers = await db.managed_accounts.find({"managed_user_id": u["id"], "status": "active"}, {"_id": 0}).to_list(50)
    result = []
    for m in managers:
        manager = await db.users.find_one({"id": m["manager_id"]}, {"_id": 0, "password": 0})
        if manager:
            result.append({**m, "manager": manager})
    return result

@api_router.post("/managed-accounts")
async def add_managed_account(req: ManagedAccountReq, u=Depends(get_current_user)):
    """Request to manage another account"""
    managed_user = await db.users.find_one({"phone": req.managed_user_phone})
    if not managed_user:
        raise HTTPException(404, "Utilisateur non trouvé")
    if managed_user["id"] == u["id"]:
        raise HTTPException(400, "Vous ne pouvez pas vous gérer vous-même")
    
    existing = await db.managed_accounts.find_one({
        "manager_id": u["id"], 
        "managed_user_id": managed_user["id"],
        "status": {"$in": ["pending", "active"]}
    })
    if existing:
        raise HTTPException(400, "Demande déjà existante")
    
    doc = {
        "id": gen_id(),
        "manager_id": u["id"],
        "manager_name": u["name"],
        "managed_user_id": managed_user["id"],
        "managed_user_name": managed_user["name"],
        "permissions": req.permissions,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.managed_accounts.insert_one(doc)
    
    # Send notification to managed user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": managed_user["id"],
        "message": f"{u['name']} demande à gérer votre compte",
        "type": "managed_account_request",
        "data": {"request_id": doc["id"]},
        "is_read": False,
        "created_at": now_iso()
    })
    
    doc.pop("_id", None)
    return {"message": "Demande envoyée", "request": doc}

@api_router.patch("/managed-accounts/{request_id}")
async def respond_to_management_request(request_id: str, action: str, u=Depends(get_current_user)):
    """Accept or reject a management request"""
    request = await db.managed_accounts.find_one({"id": request_id, "managed_user_id": u["id"]})
    if not request:
        raise HTTPException(404, "Demande non trouvée")
    if request["status"] != "pending":
        raise HTTPException(400, f"Demande déjà {request['status']}")
    
    status = "active" if action == "accept" else "rejected"
    await db.managed_accounts.update_one({"id": request_id}, {"$set": {"status": status, "responded_at": now_iso()}})
    
    # Notify manager
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": request["manager_id"],
        "message": f"{u['name']} a {'accepté' if action == 'accept' else 'refusé'} votre demande de gestion",
        "type": "managed_account_response",
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {"message": f"Demande {'acceptée' if action == 'accept' else 'refusée'}"}

@api_router.get("/managed-accounts/{managed_id}/balance")
async def get_managed_balance(managed_id: str, u=Depends(get_current_user)):
    """Get balance of a managed account (if permitted)"""
    management = await db.managed_accounts.find_one({
        "manager_id": u["id"],
        "managed_user_id": managed_id,
        "status": "active"
    })
    if not management:
        raise HTTPException(403, "Accès non autorisé")
    if "view_balance" not in management.get("permissions", []):
        raise HTTPException(403, "Permission insuffisante")
    
    wallets = await db.wallets.find({"user_id": managed_id}, {"_id": 0}).to_list(100)
    total_usd = 0.0
    for w in wallets:
        cur = await db.currencies.find_one({"code": w["currency"]}, {"_id": 0})
        rate = cur["rate_to_usd"] if cur else 1.0
        total_usd += w["balance"] / rate
    
    return {"wallets": wallets, "total_usd": round(total_usd, 2)}

@api_router.get("/managed-accounts/{managed_id}/transactions")
async def get_managed_transactions(managed_id: str, page: int = 1, limit: int = 20, u=Depends(get_current_user)):
    """Get transactions of a managed account (if permitted)"""
    management = await db.managed_accounts.find_one({
        "manager_id": u["id"],
        "managed_user_id": managed_id,
        "status": "active"
    })
    if not management:
        raise HTTPException(403, "Accès non autorisé")
    if "view_transactions" not in management.get("permissions", []):
        raise HTTPException(403, "Permission insuffisante")
    
    skip = (page - 1) * limit
    q = {"$or": [{"sender_id": managed_id}, {"receiver_id": managed_id}]}
    total = await db.transactions.count_documents(q)
    txs = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {"transactions": txs, "total": total, "page": page}

@api_router.delete("/managed-accounts/{management_id}")
async def remove_management(management_id: str, u=Depends(get_current_user)):
    """Remove management relationship (by either party)"""
    management = await db.managed_accounts.find_one({"id": management_id})
    if not management:
        raise HTTPException(404, "Relation non trouvée")
    if u["id"] not in [management["manager_id"], management["managed_user_id"]]:
        raise HTTPException(403, "Accès non autorisé")
    
    await db.managed_accounts.delete_one({"id": management_id})
    return {"message": "Relation de gestion supprimée"}


# === INTEGRATION ROUTES ===
# Import integration routes module
from routes.integrations import (
    SendOTPRequest, VerifyOTPRequest, SetPINRequest, VerifyPINRequest, 
    ChangePINRequest, MobileMoneyRechargeRequest, MobileMoneyWithdrawRequest,
    CheckTransactionStatusRequest, send_otp_endpoint, verify_otp_endpoint,
    set_pin_endpoint, verify_pin_endpoint, change_pin_endpoint, reset_pin_endpoint,
    mobile_money_recharge_endpoint, mobile_money_withdraw_endpoint, 
    check_momo_status_endpoint, get_supported_countries_endpoint,
    get_providers_for_country_endpoint
)
from fastapi import BackgroundTasks


@api_router.post("/otp/send")
async def send_otp(req: SendOTPRequest, background_tasks: BackgroundTasks):
    """Send OTP via SMS"""
    return await send_otp_endpoint(req, db, background_tasks)


@api_router.post("/otp/verify")
async def verify_otp_route(req: VerifyOTPRequest):
    """Verify OTP code"""
    return await verify_otp_endpoint(req, db)


@api_router.post("/pin/set")
async def set_pin(req: SetPINRequest, u=Depends(get_current_user)):
    """Set transaction PIN"""
    return await set_pin_endpoint(req, u, db)


@api_router.post("/pin/verify")
async def verify_pin_route(req: VerifyPINRequest, u=Depends(get_current_user)):
    """Verify transaction PIN"""
    return await verify_pin_endpoint(req, u, db)


@api_router.post("/pin/change")
async def change_pin(req: ChangePINRequest, u=Depends(get_current_user)):
    """Change transaction PIN"""
    return await change_pin_endpoint(req, u, db)


@api_router.post("/pin/reset")
async def reset_pin(background_tasks: BackgroundTasks, u=Depends(get_current_user)):
    """Request PIN reset via OTP"""
    return await reset_pin_endpoint(u["phone"], u, db, background_tasks)


@api_router.post("/mobile-money/recharge")
async def mobile_money_recharge(req: MobileMoneyRechargeRequest, u=Depends(get_current_user)):
    """Initiate mobile money recharge"""
    return await mobile_money_recharge_endpoint(req, u, db)


@api_router.post("/mobile-money/withdraw")
async def mobile_money_withdraw(req: MobileMoneyWithdrawRequest, u=Depends(get_current_user)):
    """Initiate mobile money withdrawal"""
    return await mobile_money_withdraw_endpoint(req, u, db)


@api_router.post("/mobile-money/status")
async def check_momo_status(req: CheckTransactionStatusRequest, u=Depends(get_current_user)):
    """Check mobile money transaction status"""
    return await check_momo_status_endpoint(req, u, db)


@api_router.get("/integrations/countries")
async def get_supported_countries():
    """Get list of supported countries and their providers"""
    return await get_supported_countries_endpoint()


@api_router.get("/integrations/providers/{country_code}")
async def get_providers_for_country(country_code: str):
    """Get available providers for a country"""
    return await get_providers_for_country_endpoint(country_code)


@api_router.get("/integrations/status")
async def get_integration_status():
    """Get integration service status"""
    enable_sms = os.environ.get("ENABLE_SMS_OTP", "false").lower() == "true"
    enable_momo = os.environ.get("ENABLE_MOBILE_MONEY", "false").lower() == "true"
    
    return {
        "sms_otp_enabled": enable_sms,
        "mobile_money_enabled": enable_momo,
        "sms_provider": os.environ.get("SMS_PROVIDER", "africas_talking"),
        "default_momo_provider": os.environ.get("DEFAULT_MOBILE_MONEY_PROVIDER", "mtn_momo"),
        "environment": os.environ.get("ENVIRONMENT", "development")
    }


# === CONTACTS & NOTIFICATIONS ===
@api_router.get("/contacts/recent")
async def get_recent_contacts(u=Depends(get_current_user)):
    """Get recent contacts from transaction history"""
    # Get unique users from recent transactions
    transactions = await db.transactions.find({
        "$or": [{"from_user_id": u["id"]}, {"to_user_id": u["id"]}]
    }).sort("created_at", -1).to_list(100)
    
    contact_ids = set()
    contacts = []
    
    for tx in transactions:
        other_id = tx["to_user_id"] if tx["from_user_id"] == u["id"] else tx.get("from_user_id")
        if other_id and other_id not in contact_ids and other_id != u["id"]:
            contact_ids.add(other_id)
            other_user = await db.users.find_one({"id": other_id}, {"_id": 0, "password": 0, "transaction_pin": 0})
            if other_user:
                contacts.append({
                    "id": other_user["id"],
                    "name": other_user["name"],
                    "phone": other_user["phone"],
                    "country": other_user.get("country", "CD"),
                    "last_transaction": tx["created_at"]
                })
        if len(contacts) >= 20:
            break
    
    return {"contacts": contacts}

@api_router.get("/contacts/search")
async def search_contacts(query: str, u=Depends(get_current_user)):
    """Search users by phone or name - excludes admin/manager accounts"""
    if len(query) < 3:
        raise HTTPException(400, "Recherche trop courte (min 3 caractères)")
    
    users = await db.users.find({
        "$and": [
            {"id": {"$ne": u["id"]}},
            {"role": {"$nin": NON_CLIENT_ROLES}},
            {"$or": [
                {"phone": {"$regex": query, "$options": "i"}},
                {"name": {"$regex": query, "$options": "i"}}
            ]}
        ]
    }, {"_id": 0, "password": 0, "transaction_pin": 0}).limit(20).to_list(20)
    
    return {"results": [{
        "id": user["id"],
        "name": user["name"],
        "phone": user["phone"],
        "country": user.get("country", "CD")
    } for user in users]}

@api_router.get("/notifications")
async def get_notifications(u=Depends(get_current_user)):
    """Get user notifications"""
    notifications = await db.notifications.find(
        {"user_id": u["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    unread_count = await db.notifications.count_documents({"user_id": u["id"], "is_read": False})
    
    return {"notifications": notifications, "unread_count": unread_count}

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, u=Depends(get_current_user)):
    """Mark notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": u["id"]},
        {"$set": {"is_read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Notification non trouvée")
    return {"message": "Notification marquée comme lue"}

@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(u=Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": u["id"], "is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "Toutes les notifications marquées comme lues"}


# === COTISATION ROTATION SYSTEM (TONTINE PAYOUT) ===
@api_router.get("/groups/{group_id}/rotation")
async def get_rotation_order(group_id: str, u=Depends(get_current_user)):
    """Get the rotation order and current beneficiary for a group"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    rotation_order = group.get("rotation_order", [])
    current_index = group.get("current_beneficiary_index", 0)
    current_cycle = group.get("current_cycle", 1)
    current_pot = group.get("current_pot", 0)
    cycle_contributions = group.get("cycle_contributions", {})
    
    # Build rotation list with member details
    rotation_list = []
    for idx, member_id in enumerate(rotation_order):
        member = await db.users.find_one({"id": member_id}, {"_id": 0, "password": 0, "transaction_pin": 0})
        if member:
            contribution = cycle_contributions.get(member_id, 0)
            rotation_list.append({
                "position": idx + 1,
                "user_id": member["id"],
                "name": member["name"],
                "phone": member["phone"],
                "is_current_beneficiary": idx == current_index,
                "has_received": idx < current_index,
                "cycle_contribution": contribution,
                "expected_contribution": group.get("contribution_amount", 0)
            })
    
    # Calculate expected pot (all members contribute)
    expected_pot = len(group.get("members", [])) * group.get("contribution_amount", 0)
    
    return {
        "group_id": group_id,
        "group_name": group["name"],
        "current_cycle": current_cycle,
        "current_beneficiary_index": current_index,
        "current_beneficiary": rotation_list[current_index] if current_index < len(rotation_list) else None,
        "current_pot": current_pot,
        "expected_pot": expected_pot,
        "contribution_amount": group.get("contribution_amount", 0),
        "currency": group["currency"],
        "frequency": group.get("frequency", "monthly"),
        "rotation_order": rotation_list,
        "total_members": len(group.get("members", [])),
        "total_in_rotation": len(rotation_order)
    }


@api_router.put("/groups/{group_id}/rotation")
async def set_rotation_order(group_id: str, req: RotationOrderReq, u=Depends(get_current_user)):
    """Set or update the rotation order (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    # Only admins can set rotation
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent définir l'ordre de rotation")
    
    # Validate all members exist in the group
    members = set(group.get("members", []))
    for member_id in req.member_order:
        if member_id not in members:
            raise HTTPException(400, f"Utilisateur {member_id} n'est pas membre du groupe")
    
    # Check for duplicates
    if len(req.member_order) != len(set(req.member_order)):
        raise HTTPException(400, "Liste contient des doublons")
    
    # Update rotation order
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {
            "rotation_order": req.member_order,
            "updated_at": now_iso()
        }}
    )
    
    # Add system message
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{u['name']} a défini l'ordre de rotation ({len(req.member_order)} membres)",
        "type": "rotation_updated",
        "created_at": now_iso()
    })
    
    return {"message": "Ordre de rotation mis à jour", "rotation_order": req.member_order}


@api_router.post("/groups/{group_id}/rotation/add")
async def add_member_to_rotation(group_id: str, user_id: str, position: Optional[int] = None, u=Depends(get_current_user)):
    """Add a member to the rotation (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent modifier la rotation")
    
    if user_id not in group.get("members", []):
        raise HTTPException(400, "Cet utilisateur n'est pas membre du groupe")
    
    rotation_order = group.get("rotation_order", [])
    if user_id in rotation_order:
        raise HTTPException(400, "Ce membre est déjà dans la rotation")
    
    # Add at position or at the end
    if position is not None and 0 <= position <= len(rotation_order):
        rotation_order.insert(position, user_id)
    else:
        rotation_order.append(user_id)
    
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {"rotation_order": rotation_order, "updated_at": now_iso()}}
    )
    
    member = await db.users.find_one({"id": user_id}, {"name": 1})
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{member['name'] if member else 'Un membre'} ajouté à la rotation en position {position + 1 if position else len(rotation_order)}",
        "type": "rotation_updated",
        "created_at": now_iso()
    })
    
    return {"message": "Membre ajouté à la rotation", "new_position": position if position else len(rotation_order) - 1}


@api_router.delete("/groups/{group_id}/rotation/{user_id}")
async def remove_from_rotation(group_id: str, user_id: str, u=Depends(get_current_user)):
    """Remove a member from the rotation (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent modifier la rotation")
    
    rotation_order = group.get("rotation_order", [])
    if user_id not in rotation_order:
        raise HTTPException(400, "Ce membre n'est pas dans la rotation")
    
    # Adjust current beneficiary index if needed
    current_index = group.get("current_beneficiary_index", 0)
    removed_index = rotation_order.index(user_id)
    rotation_order.remove(user_id)
    
    new_index = current_index
    if removed_index < current_index:
        new_index = max(0, current_index - 1)
    elif removed_index == current_index and len(rotation_order) > 0:
        new_index = min(current_index, len(rotation_order) - 1)
    
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {
            "rotation_order": rotation_order,
            "current_beneficiary_index": new_index,
            "updated_at": now_iso()
        }}
    )
    
    member = await db.users.find_one({"id": user_id}, {"name": 1})
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{member['name'] if member else 'Un membre'} retiré de la rotation",
        "type": "rotation_updated",
        "created_at": now_iso()
    })
    
    return {"message": "Membre retiré de la rotation"}


@api_router.post("/groups/{group_id}/contribute-cycle")
async def contribute_to_cycle(group_id: str, amount: Optional[float] = None, u=Depends(get_current_user)):
    """Contribute to the current cycle's pot"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    contribution = amount or group.get("contribution_amount", 0)
    if contribution <= 0:
        raise HTTPException(400, "Montant invalide")
    
    currency = group["currency"]
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
    if not wallet or wallet["balance"] < contribution:
        raise HTTPException(400, f"Solde insuffisant. Disponible: {wallet['balance'] if wallet else 0} {currency}")
    
    n = now_iso()
    
    # Deduct from wallet
    await db.wallets.update_one({"user_id": u["id"], "currency": currency}, {"$inc": {"balance": -contribution}})
    
    # Add to current pot and track user contribution for this cycle
    cycle_contributions = group.get("cycle_contributions", {})
    user_cycle_contribution = cycle_contributions.get(u["id"], 0) + contribution
    cycle_contributions[u["id"]] = user_cycle_contribution
    
    await db.groups.update_one(
        {"id": group_id},
        {
            "$inc": {"current_pot": contribution, "total_collected": contribution},
            "$set": {f"cycle_contributions.{u['id']}": user_cycle_contribution, "updated_at": n}
        }
    )
    
    # Record contribution
    await db.group_contributions.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "user_id": u["id"],
        "user_name": u["name"],
        "amount": contribution,
        "currency": currency,
        "cycle": group.get("current_cycle", 1),
        "type": "cycle_contribution",
        "created_at": n
    })
    
    # System message
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{u['name']} a cotisé {contribution} {currency} pour ce cycle",
        "type": "contribution",
        "created_at": n
    })
    
    # Fetch updated group
    updated_group = await db.groups.find_one({"id": group_id})
    
    return {
        "message": f"Contribution de {contribution} {currency} effectuée",
        "your_cycle_contribution": user_cycle_contribution,
        "current_pot": updated_group.get("current_pot", 0),
        "expected_pot": len(group.get("members", [])) * group.get("contribution_amount", 0)
    }


@api_router.post("/groups/{group_id}/payout")
async def execute_payout(group_id: str, req: PayoutReq, u=Depends(get_current_user)):
    """Execute payout to the current beneficiary (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent effectuer les paiements")
    
    rotation_order = group.get("rotation_order", [])
    if not rotation_order:
        raise HTTPException(400, "Aucun ordre de rotation défini")
    
    current_index = group.get("current_beneficiary_index", 0)
    if current_index >= len(rotation_order):
        raise HTTPException(400, "Tous les membres ont déjà reçu pour ce cycle. Démarrez un nouveau cycle.")
    
    current_beneficiary_id = rotation_order[current_index]
    
    # Verify beneficiary matches if specified
    if req.beneficiary_id and req.beneficiary_id != current_beneficiary_id:
        raise HTTPException(400, "Le bénéficiaire spécifié ne correspond pas à l'ordre de rotation")
    
    beneficiary = await db.users.find_one({"id": current_beneficiary_id})
    if not beneficiary:
        raise HTTPException(404, "Bénéficiaire non trouvé")
    
    current_pot = group.get("current_pot", 0)
    payout_amount = req.amount if req.amount else current_pot
    
    if payout_amount <= 0:
        raise HTTPException(400, "Aucun montant à payer")
    if payout_amount > current_pot:
        raise HTTPException(400, f"Montant demandé ({payout_amount}) supérieur au pot actuel ({current_pot})")
    
    currency = group["currency"]
    n = now_iso()
    
    # Credit beneficiary wallet
    beneficiary_wallet = await db.wallets.find_one({"user_id": current_beneficiary_id, "currency": currency})
    if beneficiary_wallet:
        await db.wallets.update_one(
            {"user_id": current_beneficiary_id, "currency": currency},
            {"$inc": {"balance": payout_amount}}
        )
    else:
        await db.wallets.insert_one({
            "id": gen_id(),
            "user_id": current_beneficiary_id,
            "currency": currency,
            "balance": payout_amount,
            "is_primary": False,
            "created_at": n
        })
    
    # Record payout in history
    payout_record = {
        "id": gen_id(),
        "beneficiary_id": current_beneficiary_id,
        "beneficiary_name": beneficiary["name"],
        "amount": payout_amount,
        "currency": currency,
        "cycle": group.get("current_cycle", 1),
        "position": current_index + 1,
        "note": req.note,
        "paid_by": u["id"],
        "paid_at": n
    }
    
    # Move to next beneficiary
    new_index = current_index + 1
    is_cycle_complete = new_index >= len(rotation_order)
    
    update_data = {
        "$push": {"payout_history": payout_record},
        "$inc": {"current_pot": -payout_amount},
        "$set": {
            "current_beneficiary_index": new_index if not is_cycle_complete else 0,
            "last_payout_at": n,
            "updated_at": n
        }
    }
    
    if is_cycle_complete:
        # Reset for new cycle
        update_data["$inc"]["current_cycle"] = 1
        update_data["$set"]["cycle_contributions"] = {}
    
    await db.groups.update_one({"id": group_id}, update_data)
    
    # Record transaction
    await db.transactions.insert_one({
        "id": gen_id(),
        "sender_id": None,
        "sender_name": f"Tontine - {group['name']}",
        "sender_phone": None,
        "receiver_id": current_beneficiary_id,
        "receiver_name": beneficiary["name"],
        "receiver_phone": beneficiary["phone"],
        "amount": payout_amount,
        "fee": 0,
        "currency": currency,
        "type": "tontine_payout",
        "status": "completed",
        "description": f"Paiement tontine cycle {group.get('current_cycle', 1)} - {group['name']}",
        "created_at": n,
        "completed_at": n
    })
    
    # Send notification to beneficiary
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": current_beneficiary_id,
        "type": "tontine_payout",
        "title": "Paiement Tontine reçu",
        "message": f"Vous avez reçu {payout_amount} {currency} du groupe '{group['name']}'",
        "data": {"group_id": group_id, "amount": payout_amount, "currency": currency},
        "is_read": False,
        "created_at": n
    })
    
    # System message
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{beneficiary['name']} a reçu {payout_amount} {currency} (position {current_index + 1}/{len(rotation_order)})" + (" - Nouveau cycle démarré!" if is_cycle_complete else ""),
        "type": "payout",
        "created_at": n
    })
    
    # Get next beneficiary info
    next_beneficiary = None
    if not is_cycle_complete and new_index < len(rotation_order):
        next_user = await db.users.find_one({"id": rotation_order[new_index]}, {"name": 1, "phone": 1})
        if next_user:
            next_beneficiary = {"name": next_user["name"], "phone": next_user["phone"], "position": new_index + 1}
    elif is_cycle_complete and len(rotation_order) > 0:
        first_user = await db.users.find_one({"id": rotation_order[0]}, {"name": 1, "phone": 1})
        if first_user:
            next_beneficiary = {"name": first_user["name"], "phone": first_user["phone"], "position": 1, "new_cycle": True}
    
    return {
        "message": f"Paiement de {payout_amount} {currency} effectué à {beneficiary['name']}",
        "payout": payout_record,
        "cycle_complete": is_cycle_complete,
        "new_cycle": group.get("current_cycle", 1) + 1 if is_cycle_complete else None,
        "next_beneficiary": next_beneficiary,
        "remaining_pot": current_pot - payout_amount
    }


@api_router.get("/groups/{group_id}/payout-history")
async def get_payout_history(group_id: str, u=Depends(get_current_user)):
    """Get the payout history for a group"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    if u["id"] not in group.get("members", []):
        raise HTTPException(403, "Vous n'êtes pas membre de ce groupe")
    
    payout_history = group.get("payout_history", [])
    
    # Group by cycle
    cycles = {}
    for payout in payout_history:
        cycle = payout.get("cycle", 1)
        if cycle not in cycles:
            cycles[cycle] = {"cycle": cycle, "payouts": [], "total_paid": 0}
        cycles[cycle]["payouts"].append(payout)
        cycles[cycle]["total_paid"] += payout.get("amount", 0)
    
    return {
        "group_id": group_id,
        "group_name": group["name"],
        "current_cycle": group.get("current_cycle", 1),
        "total_payouts": len(payout_history),
        "total_paid": sum(p.get("amount", 0) for p in payout_history),
        "currency": group["currency"],
        "history_by_cycle": list(cycles.values()),
        "all_payouts": payout_history
    }


@api_router.post("/groups/{group_id}/new-cycle")
async def start_new_cycle(group_id: str, u=Depends(get_current_user)):
    """Start a new rotation cycle (admin only)"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(404, "Groupe non trouvé")
    
    if u["id"] not in group.get("admins", [group["creator_id"]]):
        raise HTTPException(403, "Seuls les administrateurs peuvent démarrer un nouveau cycle")
    
    current_index = group.get("current_beneficiary_index", 0)
    rotation_order = group.get("rotation_order", [])
    
    # Only allow new cycle if current one is complete or admin explicitly starts new
    if current_index < len(rotation_order) - 1:
        remaining = len(rotation_order) - current_index
        raise HTTPException(400, f"Le cycle actuel n'est pas terminé. {remaining} membre(s) n'ont pas encore reçu.")
    
    new_cycle = group.get("current_cycle", 1) + 1
    n = now_iso()
    
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {
            "current_cycle": new_cycle,
            "current_beneficiary_index": 0,
            "current_pot": 0,
            "cycle_contributions": {},
            "updated_at": n
        }}
    )
    
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group_id,
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"Nouveau cycle #{new_cycle} démarré par {u['name']}",
        "type": "new_cycle",
        "created_at": n
    })
    
    # Get first beneficiary
    first_beneficiary = None
    if rotation_order:
        first_user = await db.users.find_one({"id": rotation_order[0]}, {"name": 1})
        if first_user:
            first_beneficiary = first_user["name"]
    
    return {
        "message": f"Cycle #{new_cycle} démarré",
        "new_cycle": new_cycle,
        "first_beneficiary": first_beneficiary
    }


# === FINANCIAL API INTEGRATIONS ===

@api_router.get("/admin/integrations/types")
async def get_integration_types(adm=Depends(get_admin)):
    """Get all available integration types"""
    check_permission(adm, "settings.view")
    
    # Group by category
    grouped = {}
    for type_code, type_info in INTEGRATION_TYPES.items():
        category = type_info["category"]
        if category not in grouped:
            grouped[category] = {
                "name": INTEGRATION_CATEGORIES.get(category, category),
                "integrations": []
            }
        grouped[category]["integrations"].append({
            "code": type_code,
            **type_info
        })
    
    return {
        "categories": INTEGRATION_CATEGORIES,
        "types": grouped
    }


@api_router.get("/admin/integrations")
async def get_financial_integrations(
    category: str = None,
    is_active: bool = None,
    adm=Depends(get_admin)
):
    """Get all configured financial integrations"""
    check_permission(adm, "settings.view")
    
    query = {}
    if category:
        query["category"] = category
    if is_active is not None:
        query["is_active"] = is_active
    
    integrations = await db.financial_integrations.find(
        query, 
        {"_id": 0, "api_secret": 0, "api_token": 0, "webhook_secret": 0}
    ).sort([("category", 1), ("priority", 1)]).to_list(100)
    
    # Get stats for each integration
    for integration in integrations:
        stats = await db.integration_transactions.aggregate([
            {"$match": {"integration_code": integration["integration_code"]}},
            {"$group": {
                "_id": None,
                "total_transactions": {"$sum": 1},
                "total_volume": {"$sum": "$amount"},
                "successful": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}
            }}
        ]).to_list(1)
        
        if stats:
            integration["stats"] = stats[0]
            integration["stats"].pop("_id", None)
        else:
            integration["stats"] = {
                "total_transactions": 0,
                "total_volume": 0,
                "successful": 0,
                "failed": 0
            }
    
    return {"integrations": integrations}


@api_router.post("/admin/integrations")
async def create_financial_integration(req: FinancialIntegrationReq, adm=Depends(get_admin_with_kyc)):
    """Create a new financial integration"""
    check_permission(adm, "settings.edit")
    
    # Validate integration type
    if req.integration_type not in INTEGRATION_TYPES and req.integration_type != "custom":
        raise HTTPException(400, f"Type d'intégration invalide: {req.integration_type}")
    
    # Check if code already exists
    existing = await db.financial_integrations.find_one({"integration_code": req.integration_code.upper()})
    if existing:
        raise HTTPException(400, f"Une intégration avec le code '{req.integration_code}' existe déjà")
    
    # Get type info
    type_info = INTEGRATION_TYPES.get(req.integration_type, {"name": req.display_name, "category": req.category})
    
    doc = {
        "id": gen_id(),
        "integration_type": req.integration_type,
        "integration_code": req.integration_code.upper(),
        "display_name": req.display_name or type_info.get("name", req.integration_type),
        "category": req.category or type_info.get("category", "other"),
        "description": type_info.get("description", ""),
        
        # API Configuration
        "api_base_url": req.api_base_url,
        "api_key": req.api_key,
        "api_secret": req.api_secret,
        "api_token": req.api_token,
        "merchant_id": req.merchant_id,
        "account_id": req.account_id,
        
        # Endpoints
        "deposit_endpoint": req.deposit_endpoint,
        "withdrawal_endpoint": req.withdrawal_endpoint,
        "balance_endpoint": req.balance_endpoint,
        "status_endpoint": req.status_endpoint,
        "webhook_endpoint": req.webhook_endpoint,
        
        # Webhook
        "webhook_url": req.webhook_url,
        "webhook_secret": req.webhook_secret,
        
        # Supported operations
        "supports_deposit": req.supports_deposit,
        "supports_withdrawal": req.supports_withdrawal,
        "supports_balance_check": req.supports_balance_check,
        
        # Countries & Currencies
        "supported_countries": req.supported_countries,
        "supported_currencies": req.supported_currencies,
        "default_currency": req.default_currency,
        
        # Fees
        "deposit_fee_type": req.deposit_fee_type,
        "deposit_fee_percentage": req.deposit_fee_percentage,
        "deposit_fee_fixed": req.deposit_fee_fixed,
        "withdrawal_fee_type": req.withdrawal_fee_type,
        "withdrawal_fee_percentage": req.withdrawal_fee_percentage,
        "withdrawal_fee_fixed": req.withdrawal_fee_fixed,
        
        # Limits
        "min_deposit": req.min_deposit,
        "max_deposit": req.max_deposit,
        "min_withdrawal": req.min_withdrawal,
        "max_withdrawal": req.max_withdrawal,
        "daily_limit": req.daily_limit,
        "monthly_limit": req.monthly_limit,
        
        # Status
        "is_active": req.is_active,
        "is_test_mode": req.is_test_mode,
        "priority": req.priority,
        
        # Extra
        "extra_config": req.extra_config or {},
        
        # Metadata
        "created_by": adm["id"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_test_at": None,
        "last_test_status": None
    }
    
    await db.financial_integrations.insert_one(doc)
    await log_admin_activity(adm, "create", "integration", doc["id"], {"integration_code": doc["integration_code"], "category": doc["category"]})
    
    # Remove sensitive fields from response
    doc.pop("_id", None)
    doc.pop("api_secret", None)
    doc.pop("api_token", None)
    doc.pop("webhook_secret", None)
    
    return {"message": "Intégration créée avec succès", "integration": doc}


@api_router.get("/admin/integrations/{integration_code}")
async def get_financial_integration(integration_code: str, adm=Depends(get_admin)):
    """Get details of a specific integration"""
    check_permission(adm, "settings.view")
    
    integration = await db.financial_integrations.find_one(
        {"integration_code": integration_code.upper()},
        {"_id": 0, "api_secret": 0, "api_token": 0, "webhook_secret": 0}
    )
    if not integration:
        raise HTTPException(404, "Intégration non trouvée")
    
    # Get recent transactions
    recent_transactions = await db.integration_transactions.find(
        {"integration_code": integration_code.upper()},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    # Get stats
    stats = await db.integration_transactions.aggregate([
        {"$match": {"integration_code": integration_code.upper()}},
        {"$group": {
            "_id": None,
            "total_transactions": {"$sum": 1},
            "total_volume": {"$sum": "$amount"},
            "total_fees": {"$sum": "$fee"},
            "successful": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}}
        }}
    ]).to_list(1)
    
    integration["recent_transactions"] = recent_transactions
    integration["stats"] = stats[0] if stats else {
        "total_transactions": 0, "total_volume": 0, "total_fees": 0,
        "successful": 0, "failed": 0, "pending": 0
    }
    if integration["stats"].get("_id"):
        integration["stats"].pop("_id")
    
    return integration


@api_router.patch("/admin/integrations/{integration_code}")
async def update_financial_integration(
    integration_code: str, 
    req: FinancialIntegrationUpdateReq, 
    adm=Depends(get_admin_with_kyc)
):
    """Update a financial integration"""
    check_permission(adm, "settings.edit")
    
    integration = await db.financial_integrations.find_one({"integration_code": integration_code.upper()})
    if not integration:
        raise HTTPException(404, "Intégration non trouvée")
    
    update = {"updated_at": now_iso()}
    
    # Update only provided fields
    update_fields = [
        "display_name", "api_base_url", "api_key", "api_secret", "api_token",
        "merchant_id", "account_id", "deposit_endpoint", "withdrawal_endpoint",
        "balance_endpoint", "status_endpoint", "webhook_endpoint", "webhook_url",
        "webhook_secret", "supports_deposit", "supports_withdrawal", "supports_balance_check",
        "supported_countries", "supported_currencies", "default_currency",
        "deposit_fee_type", "deposit_fee_percentage", "deposit_fee_fixed",
        "withdrawal_fee_type", "withdrawal_fee_percentage", "withdrawal_fee_fixed",
        "min_deposit", "max_deposit", "min_withdrawal", "max_withdrawal",
        "daily_limit", "monthly_limit", "is_active", "is_test_mode", "priority", "extra_config"
    ]
    
    for field in update_fields:
        value = getattr(req, field, None)
        if value is not None:
            update[field] = value
    
    await db.financial_integrations.update_one(
        {"integration_code": integration_code.upper()},
        {"$set": update}
    )
    
    await log_admin_activity(adm, "update", "integration", integration["id"], {"integration_code": integration_code.upper(), "updated_fields": list(update.keys())})
    
    return {"message": "Intégration mise à jour"}


@api_router.delete("/admin/integrations/{integration_code}")
async def delete_financial_integration(integration_code: str, adm=Depends(get_admin_with_kyc)):
    """Delete a financial integration"""
    check_permission(adm, "settings.edit")
    
    integration = await db.financial_integrations.find_one({"integration_code": integration_code.upper()})
    if not integration:
        raise HTTPException(404, "Intégration non trouvée")
    
    # Check if there are pending transactions
    pending_count = await db.integration_transactions.count_documents({
        "integration_code": integration_code.upper(),
        "status": "pending"
    })
    if pending_count > 0:
        raise HTTPException(400, f"Impossible de supprimer: {pending_count} transactions en attente")
    
    await db.financial_integrations.delete_one({"integration_code": integration_code.upper()})
    await log_admin_activity(adm, "delete", "integration", integration["id"], {"integration_code": integration_code.upper()})
    
    return {"message": "Intégration supprimée"}


@api_router.post("/admin/integrations/{integration_code}/test")
async def test_financial_integration(integration_code: str, req: IntegrationTestReq, adm=Depends(get_admin)):
    """Test connection to a financial integration"""
    check_permission(adm, "settings.view")
    
    integration = await db.financial_integrations.find_one({"integration_code": integration_code.upper()})
    if not integration:
        raise HTTPException(404, "Intégration non trouvée")
    
    test_result = {
        "integration_code": integration_code.upper(),
        "test_type": req.test_type,
        "timestamp": now_iso(),
        "success": False,
        "response_time_ms": 0,
        "message": "",
        "details": {}
    }
    
    import time
    start_time = time.time()
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Build test request based on test type
            headers = {"Content-Type": "application/json"}
            
            if integration.get("api_key"):
                headers["Authorization"] = f"Bearer {integration['api_key']}"
            
            # Test connection by calling balance or status endpoint
            test_url = integration.get("balance_endpoint") or integration.get("status_endpoint") or integration.get("api_base_url")
            
            if not test_url:
                test_result["message"] = "Aucun endpoint de test configuré"
            else:
                # Make the test request
                if test_url.startswith("/"):
                    test_url = integration["api_base_url"].rstrip("/") + test_url
                
                response = await client.get(test_url, headers=headers)
                
                test_result["response_time_ms"] = int((time.time() - start_time) * 1000)
                test_result["details"]["status_code"] = response.status_code
                test_result["details"]["response_preview"] = response.text[:500] if response.text else ""
                
                if response.status_code in [200, 201, 204]:
                    test_result["success"] = True
                    test_result["message"] = "Connexion réussie"
                elif response.status_code == 401:
                    test_result["message"] = "Erreur d'authentification - Vérifiez vos clés API"
                elif response.status_code == 403:
                    test_result["message"] = "Accès refusé - Vérifiez vos permissions"
                else:
                    test_result["message"] = f"Erreur HTTP {response.status_code}"
                    
    except httpx.TimeoutException:
        test_result["response_time_ms"] = int((time.time() - start_time) * 1000)
        test_result["message"] = "Timeout - Le serveur n'a pas répondu à temps"
    except httpx.ConnectError:
        test_result["response_time_ms"] = int((time.time() - start_time) * 1000)
        test_result["message"] = "Impossible de se connecter au serveur"
    except Exception as e:
        test_result["response_time_ms"] = int((time.time() - start_time) * 1000)
        test_result["message"] = f"Erreur: {str(e)}"
    
    # Update integration with test result
    await db.financial_integrations.update_one(
        {"integration_code": integration_code.upper()},
        {"$set": {
            "last_test_at": test_result["timestamp"],
            "last_test_status": "success" if test_result["success"] else "failed",
            "last_test_message": test_result["message"]
        }}
    )
    
    # Log test
    await db.integration_logs.insert_one({
        "id": gen_id(),
        "integration_code": integration_code.upper(),
        "log_type": "test",
        "admin_id": adm["id"],
        "admin_name": adm.get("name"),
        "test_result": test_result,
        "created_at": now_iso()
    })
    
    return test_result


@api_router.post("/admin/integrations/{integration_code}/toggle")
async def toggle_financial_integration(integration_code: str, adm=Depends(get_admin_with_kyc)):
    """Toggle integration active status"""
    check_permission(adm, "settings.edit")
    
    integration = await db.financial_integrations.find_one({"integration_code": integration_code.upper()})
    if not integration:
        raise HTTPException(404, "Intégration non trouvée")
    
    new_status = not integration.get("is_active", True)
    
    await db.financial_integrations.update_one(
        {"integration_code": integration_code.upper()},
        {"$set": {"is_active": new_status, "updated_at": now_iso()}}
    )
    
    await log_admin_activity(adm, "update", "integration", integration["id"], {
        "integration_code": integration_code.upper(),
        "action": "activate" if new_status else "deactivate"
    })
    
    return {"message": f"Intégration {'activée' if new_status else 'désactivée'}", "is_active": new_status}


@api_router.get("/admin/integrations/{integration_code}/logs")
async def get_integration_logs(
    integration_code: str,
    log_type: str = None,
    limit: int = 50,
    adm=Depends(get_admin)
):
    """Get logs for a specific integration"""
    check_permission(adm, "settings.view")
    
    query = {"integration_code": integration_code.upper()}
    if log_type:
        query["log_type"] = log_type
    
    logs = await db.integration_logs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"logs": logs}


@api_router.get("/admin/integrations/{integration_code}/transactions")
async def get_integration_transactions(
    integration_code: str,
    status: str = None,
    transaction_type: str = None,
    limit: int = 50,
    page: int = 1,
    adm=Depends(get_admin)
):
    """Get transactions for a specific integration"""
    check_permission(adm, "transactions.view")
    
    query = {"integration_code": integration_code.upper()}
    if status:
        query["status"] = status
    if transaction_type:
        query["transaction_type"] = transaction_type
    
    skip = (page - 1) * limit
    
    transactions = await db.integration_transactions.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.integration_transactions.count_documents(query)
    
    return {
        "transactions": transactions,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


# User-facing integration endpoints
@api_router.get("/integrations/available")
async def get_available_integrations(u=Depends(get_current_user)):
    """Get available integrations for the user's country"""
    user_country = u.get("country", "CD")
    
    integrations = await db.financial_integrations.find({
        "is_active": True,
        "$or": [
            {"supported_countries": []},
            {"supported_countries": {"$in": [user_country, "*"]}}
        ]
    }, {
        "_id": 0, "api_key": 0, "api_secret": 0, "api_token": 0, 
        "webhook_secret": 0, "merchant_id": 0, "account_id": 0,
        "deposit_endpoint": 0, "withdrawal_endpoint": 0, "balance_endpoint": 0,
        "status_endpoint": 0, "webhook_endpoint": 0
    }).sort([("category", 1), ("priority", 1)]).to_list(50)
    
    # Group by category
    grouped = {}
    for integration in integrations:
        category = integration.get("category", "other")
        if category not in grouped:
            grouped[category] = {
                "name": INTEGRATION_CATEGORIES.get(category, category),
                "integrations": []
            }
        grouped[category]["integrations"].append(integration)
    
    return {"integrations": grouped}


@api_router.post("/integrations/transaction")
async def execute_integration_transaction(req: IntegrationTransactionReq, u=Depends(get_current_user)):
    """Execute a transaction via an integration (deposit/withdrawal)"""
    
    # Get integration
    integration = await db.financial_integrations.find_one({
        "integration_code": req.integration_code.upper(),
        "is_active": True
    })
    if not integration:
        raise HTTPException(404, "Intégration non disponible")
    
    # Validate transaction type
    if req.transaction_type == "deposit" and not integration.get("supports_deposit"):
        raise HTTPException(400, "Cette intégration ne supporte pas les dépôts")
    if req.transaction_type == "withdrawal" and not integration.get("supports_withdrawal"):
        raise HTTPException(400, "Cette intégration ne supporte pas les retraits")
    
    # Validate amount
    if req.transaction_type == "deposit":
        if req.amount < integration.get("min_deposit", 0):
            raise HTTPException(400, f"Montant minimum: {integration['min_deposit']}")
        if req.amount > integration.get("max_deposit", float('inf')):
            raise HTTPException(400, f"Montant maximum: {integration['max_deposit']}")
    else:
        if req.amount < integration.get("min_withdrawal", 0):
            raise HTTPException(400, f"Montant minimum: {integration['min_withdrawal']}")
        if req.amount > integration.get("max_withdrawal", float('inf')):
            raise HTTPException(400, f"Montant maximum: {integration['max_withdrawal']}")
    
    # Calculate fee
    if req.transaction_type == "deposit":
        fee_type = integration.get("deposit_fee_type", "percentage")
        fee_pct = integration.get("deposit_fee_percentage", 0)
        fee_fixed = integration.get("deposit_fee_fixed", 0)
    else:
        fee_type = integration.get("withdrawal_fee_type", "percentage")
        fee_pct = integration.get("withdrawal_fee_percentage", 0)
        fee_fixed = integration.get("withdrawal_fee_fixed", 0)
    
    if fee_type == "percentage":
        fee = round(req.amount * (fee_pct / 100), 2)
    elif fee_type == "fixed":
        fee = fee_fixed
    else:  # both
        fee = round(req.amount * (fee_pct / 100) + fee_fixed, 2)
    
    # Create transaction record
    tx_id = gen_id()
    transaction = {
        "id": tx_id,
        "integration_code": req.integration_code.upper(),
        "integration_name": integration.get("display_name"),
        "category": integration.get("category"),
        "user_id": u["id"],
        "user_name": u.get("name"),
        "user_phone": u.get("phone"),
        "transaction_type": req.transaction_type,
        "amount": req.amount,
        "currency": req.currency,
        "fee": fee,
        "net_amount": req.amount - fee if req.transaction_type == "withdrawal" else req.amount + fee,
        "recipient_info": req.recipient_info,
        "reference": req.reference or f"TX-{tx_id[:8].upper()}",
        "external_reference": None,
        "status": "pending",
        "metadata": req.metadata,
        "error_message": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "completed_at": None
    }
    
    await db.integration_transactions.insert_one(transaction)
    
    # Log the transaction
    await db.integration_logs.insert_one({
        "id": gen_id(),
        "integration_code": req.integration_code.upper(),
        "log_type": "transaction",
        "transaction_id": tx_id,
        "user_id": u["id"],
        "action": f"{req.transaction_type}_initiated",
        "details": {
            "amount": req.amount,
            "currency": req.currency,
            "fee": fee
        },
        "created_at": now_iso()
    })
    
    # Return transaction info (actual API call would be made here in production)
    transaction.pop("_id", None)
    
    return {
        "message": f"Transaction {'de dépôt' if req.transaction_type == 'deposit' else 'de retrait'} initiée",
        "transaction": transaction,
        "note": "En mode test - La transaction sera traitée manuellement" if integration.get("is_test_mode") else None
    }


# === APP SETUP ===
# Register main API router
app.include_router(api_router)

# Register extracted route modules
from routes.admin_whatsapp import router as admin_whatsapp_router
from routes.partner_routes import router as partner_routes_router
from routes.virtual_cards_routes import router as virtual_cards_router
from routes.admin_mgmt import router as admin_mgmt_router
from routes.payments_routes import router as payments_router
from routes.admin_analytics import router as admin_analytics_router
from routes.nfc_bank_cards import router as nfc_bank_cards_router
from routes.mobile_sms import router as mobile_sms_router
from routes.admin_rules import router as admin_rules_router
from routes.admin_stats import router as admin_stats_router
from routes.admin_countries import router as admin_countries_router
from routes.mobile_compat import router as mobile_compat_router

app.include_router(admin_whatsapp_router)
app.include_router(partner_routes_router)
app.include_router(virtual_cards_router)
app.include_router(admin_mgmt_router)
app.include_router(payments_router)
app.include_router(admin_analytics_router)
app.include_router(nfc_bank_cards_router)
app.include_router(mobile_sms_router)
app.include_router(admin_rules_router)
app.include_router(admin_stats_router)
app.include_router(admin_countries_router)
app.include_router(mobile_compat_router)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','), allow_methods=["*"], allow_headers=["*"])


@app.get("/")
async def root_status():
    return {
        "service": "Monity World API",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    """K8s health check endpoint — root level"""
    return {"status": "ok"}


@api_router.get("/system/sync")
async def system_sync(u=Depends(get_current_user)):
    """Lightweight periodic synchronization check for connected frontends."""
    return {
        "server_time": now_iso(),
        "api_version": os.getenv("API_VERSION", "1"),
        "user": u,
        "user_updated_at": u.get("updated_at"),
        "permissions_updated_at": u.get("permissions_updated_at"),
        "services_updated_at": u.get("services_updated_at"),
    }

CURRENCIES_SEED = [
    {"code": "USD", "name": "Dollar US", "symbol": "$", "rate_to_usd": 1.0},
    {"code": "EUR", "name": "Euro", "symbol": "€", "rate_to_usd": 0.92},
    {"code": "XAF", "name": "Franc CFA (BEAC)", "symbol": "FCFA", "rate_to_usd": 600.0},
    {"code": "XOF", "name": "Franc CFA (BCEAO)", "symbol": "FCFA", "rate_to_usd": 600.0},
    {"code": "GBP", "name": "Livre Sterling", "symbol": "£", "rate_to_usd": 0.79},
    {"code": "CNY", "name": "Yuan Chinois", "symbol": "¥", "rate_to_usd": 7.24},
    {"code": "CDF", "name": "Franc Congolais", "symbol": "FC", "rate_to_usd": 2800.0},
    {"code": "NGN", "name": "Naira Nigérian", "symbol": "₦", "rate_to_usd": 1600.0},
    {"code": "GHS", "name": "Cedi Ghanéen", "symbol": "₵", "rate_to_usd": 15.0},
    {"code": "RUB", "name": "Rouble Russe", "symbol": "₽", "rate_to_usd": 92.0},
    {"code": "CAD", "name": "Dollar Canadien", "symbol": "C$", "rate_to_usd": 1.36},
    {"code": "MXN", "name": "Peso Mexicain", "symbol": "$", "rate_to_usd": 17.2},
    {"code": "ZAR", "name": "Rand Sud-Africain", "symbol": "R", "rate_to_usd": 18.5},
    {"code": "EGP", "name": "Livre Égyptienne", "symbol": "E£", "rate_to_usd": 30.9},
    {"code": "MAD", "name": "Dirham Marocain", "symbol": "DH", "rate_to_usd": 10.0},
    {"code": "TND", "name": "Dinar Tunisien", "symbol": "DT", "rate_to_usd": 3.1},
    {"code": "DZD", "name": "Dinar Algérien", "symbol": "DA", "rate_to_usd": 135.0},
    {"code": "KES", "name": "Shilling Kényan", "symbol": "KSh", "rate_to_usd": 153.0},
    {"code": "UGX", "name": "Shilling Ougandais", "symbol": "USh", "rate_to_usd": 3750.0},
    {"code": "TZS", "name": "Shilling Tanzanien", "symbol": "TSh", "rate_to_usd": 2500.0},
    {"code": "RWF", "name": "Franc Rwandais", "symbol": "FRw", "rate_to_usd": 1250.0},
    {"code": "ETB", "name": "Birr Éthiopien", "symbol": "Br", "rate_to_usd": 56.0},
    {"code": "AOA", "name": "Kwanza Angolais", "symbol": "Kz", "rate_to_usd": 830.0},
    {"code": "MZN", "name": "Metical Mozambicain", "symbol": "MT", "rate_to_usd": 64.0},
    {"code": "ZMW", "name": "Kwacha Zambien", "symbol": "ZK", "rate_to_usd": 25.0},
    {"code": "BWP", "name": "Pula Botswanais", "symbol": "P", "rate_to_usd": 13.5},
    {"code": "MUR", "name": "Roupie Mauricienne", "symbol": "Rs", "rate_to_usd": 45.0},
    {"code": "SCR", "name": "Roupie Seychelloise", "symbol": "SR", "rate_to_usd": 13.5},
]

COUNTRIES_SEED = [
    # Afrique Centrale
    {"code": "CD", "name": "RD Congo", "dial_code": "+243", "currency_code": "CDF", "flag": "🇨🇩"},
    {"code": "CG", "name": "Congo-Brazzaville", "dial_code": "+242", "currency_code": "XAF", "flag": "🇨🇬"},
    {"code": "CM", "name": "Cameroun", "dial_code": "+237", "currency_code": "XAF", "flag": "🇨🇲"},
    {"code": "GA", "name": "Gabon", "dial_code": "+241", "currency_code": "XAF", "flag": "🇬🇦"},
    {"code": "GQ", "name": "Guinée Équatoriale", "dial_code": "+240", "currency_code": "XAF", "flag": "🇬🇶"},
    {"code": "CF", "name": "Centrafrique", "dial_code": "+236", "currency_code": "XAF", "flag": "🇨🇫"},
    {"code": "TD", "name": "Tchad", "dial_code": "+235", "currency_code": "XAF", "flag": "🇹🇩"},
    # Afrique de l'Ouest
    {"code": "SN", "name": "Sénégal", "dial_code": "+221", "currency_code": "XOF", "flag": "🇸🇳"},
    {"code": "CI", "name": "Côte d'Ivoire", "dial_code": "+225", "currency_code": "XOF", "flag": "🇨🇮"},
    {"code": "ML", "name": "Mali", "dial_code": "+223", "currency_code": "XOF", "flag": "🇲🇱"},
    {"code": "BF", "name": "Burkina Faso", "dial_code": "+226", "currency_code": "XOF", "flag": "🇧🇫"},
    {"code": "NE", "name": "Niger", "dial_code": "+227", "currency_code": "XOF", "flag": "🇳🇪"},
    {"code": "BJ", "name": "Bénin", "dial_code": "+229", "currency_code": "XOF", "flag": "🇧🇯"},
    {"code": "TG", "name": "Togo", "dial_code": "+228", "currency_code": "XOF", "flag": "🇹🇬"},
    {"code": "GN", "name": "Guinée", "dial_code": "+224", "currency_code": "GNF", "flag": "🇬🇳"},
    {"code": "GW", "name": "Guinée-Bissau", "dial_code": "+245", "currency_code": "XOF", "flag": "🇬🇼"},
    {"code": "NG", "name": "Nigeria", "dial_code": "+234", "currency_code": "NGN", "flag": "🇳🇬"},
    {"code": "GH", "name": "Ghana", "dial_code": "+233", "currency_code": "GHS", "flag": "🇬🇭"},
    {"code": "LR", "name": "Libéria", "dial_code": "+231", "currency_code": "LRD", "flag": "🇱🇷"},
    {"code": "SL", "name": "Sierra Leone", "dial_code": "+232", "currency_code": "SLL", "flag": "🇸🇱"},
    {"code": "GM", "name": "Gambie", "dial_code": "+220", "currency_code": "GMD", "flag": "🇬🇲"},
    {"code": "CV", "name": "Cap-Vert", "dial_code": "+238", "currency_code": "CVE", "flag": "🇨🇻"},
    {"code": "MR", "name": "Mauritanie", "dial_code": "+222", "currency_code": "MRU", "flag": "🇲🇷"},
    # Afrique de l'Est
    {"code": "KE", "name": "Kenya", "dial_code": "+254", "currency_code": "KES", "flag": "🇰🇪"},
    {"code": "UG", "name": "Ouganda", "dial_code": "+256", "currency_code": "UGX", "flag": "🇺🇬"},
    {"code": "TZ", "name": "Tanzanie", "dial_code": "+255", "currency_code": "TZS", "flag": "🇹🇿"},
    {"code": "RW", "name": "Rwanda", "dial_code": "+250", "currency_code": "RWF", "flag": "🇷🇼"},
    {"code": "BI", "name": "Burundi", "dial_code": "+257", "currency_code": "BIF", "flag": "🇧🇮"},
    {"code": "ET", "name": "Éthiopie", "dial_code": "+251", "currency_code": "ETB", "flag": "🇪🇹"},
    {"code": "ER", "name": "Érythrée", "dial_code": "+291", "currency_code": "ERN", "flag": "🇪🇷"},
    {"code": "DJ", "name": "Djibouti", "dial_code": "+253", "currency_code": "DJF", "flag": "🇩🇯"},
    {"code": "SO", "name": "Somalie", "dial_code": "+252", "currency_code": "SOS", "flag": "🇸🇴"},
    {"code": "SS", "name": "Soudan du Sud", "dial_code": "+211", "currency_code": "SSP", "flag": "🇸🇸"},
    {"code": "SD", "name": "Soudan", "dial_code": "+249", "currency_code": "SDG", "flag": "🇸🇩"},
    # Afrique du Nord
    {"code": "EG", "name": "Égypte", "dial_code": "+20", "currency_code": "EGP", "flag": "🇪🇬"},
    {"code": "MA", "name": "Maroc", "dial_code": "+212", "currency_code": "MAD", "flag": "🇲🇦"},
    {"code": "TN", "name": "Tunisie", "dial_code": "+216", "currency_code": "TND", "flag": "🇹🇳"},
    {"code": "DZ", "name": "Algérie", "dial_code": "+213", "currency_code": "DZD", "flag": "🇩🇿"},
    {"code": "LY", "name": "Libye", "dial_code": "+218", "currency_code": "LYD", "flag": "🇱🇾"},
    # Afrique Australe
    {"code": "ZA", "name": "Afrique du Sud", "dial_code": "+27", "currency_code": "ZAR", "flag": "🇿🇦"},
    {"code": "AO", "name": "Angola", "dial_code": "+244", "currency_code": "AOA", "flag": "🇦🇴"},
    {"code": "MZ", "name": "Mozambique", "dial_code": "+258", "currency_code": "MZN", "flag": "🇲🇿"},
    {"code": "ZW", "name": "Zimbabwe", "dial_code": "+263", "currency_code": "ZWL", "flag": "🇿🇼"},
    {"code": "ZM", "name": "Zambie", "dial_code": "+260", "currency_code": "ZMW", "flag": "🇿🇲"},
    {"code": "MW", "name": "Malawi", "dial_code": "+265", "currency_code": "MWK", "flag": "🇲🇼"},
    {"code": "BW", "name": "Botswana", "dial_code": "+267", "currency_code": "BWP", "flag": "🇧🇼"},
    {"code": "NA", "name": "Namibie", "dial_code": "+264", "currency_code": "NAD", "flag": "🇳🇦"},
    {"code": "SZ", "name": "Eswatini", "dial_code": "+268", "currency_code": "SZL", "flag": "🇸🇿"},
    {"code": "LS", "name": "Lesotho", "dial_code": "+266", "currency_code": "LSL", "flag": "🇱🇸"},
    # Îles
    {"code": "MG", "name": "Madagascar", "dial_code": "+261", "currency_code": "MGA", "flag": "🇲🇬"},
    {"code": "MU", "name": "Maurice", "dial_code": "+230", "currency_code": "MUR", "flag": "🇲🇺"},
    {"code": "SC", "name": "Seychelles", "dial_code": "+248", "currency_code": "SCR", "flag": "🇸🇨"},
    {"code": "KM", "name": "Comores", "dial_code": "+269", "currency_code": "KMF", "flag": "🇰🇲"},
    {"code": "ST", "name": "São Tomé-et-Príncipe", "dial_code": "+239", "currency_code": "STN", "flag": "🇸🇹"},
    # Amérique du Nord
    {"code": "CA", "name": "Canada", "dial_code": "+1", "currency_code": "CAD", "flag": "🇨🇦"},
    {"code": "MX", "name": "Mexique", "dial_code": "+52", "currency_code": "MXN", "flag": "🇲🇽"},
]


@app.on_event("startup")
async def startup():
    # Merchant functionality now lives in the independent merchant1 app.
    # Remove legacy merchant records and collections from this application.
    merchant_users = await db.users.find({"role": "merchant"}, {"id": 1, "_id": 0}).to_list(10000)
    merchant_ids = [user["id"] for user in merchant_users]
    if merchant_ids:
        await db.users.delete_many({"id": {"$in": merchant_ids}})
        await db.merchants.delete_many({"user_id": {"$in": merchant_ids}})
        await db.merchant_transactions.delete_many({"merchant_id": {"$in": merchant_ids}})
        await db.invoices.delete_many({"merchant_id": {"$in": merchant_ids}})
        await db.products.delete_many({"merchant_id": {"$in": merchant_ids}})
    else:
        await db.merchants.delete_many({})
        await db.merchant_transactions.delete_many({})
        await db.invoices.delete_many({})
        await db.products.delete_many({})

    # Init object storage
    try:
        from utils.storage import init_storage
        init_storage()
    except Exception as e:
        logger.warning(f"Object storage init deferred: {e}")
    
    # Seed currencies
    for cur in CURRENCIES_SEED:
        if not await db.currencies.find_one({"code": cur["code"]}):
            await db.currencies.insert_one({"id": gen_id(), "is_active": True, "last_updated": now_iso(), **cur})
    
    # Seed countries
    for country in COUNTRIES_SEED:
        if not await db.countries.find_one({"code": country["code"]}):
            await db.countries.insert_one({"id": gen_id(), "is_active": True, "created_at": now_iso(), **country})

    # One-time migration: some states had been configured with two accepted
    # currencies (their own + a secondary one, e.g. USD/EUR). Reset every
    # country back to its own single default currency. Runs only once per
    # country (flagged), so an admin's later manual choice isn't overwritten.
    countries_to_fix = await db.countries.find({"currencies_normalized_v1": {"$ne": True}}, {"_id": 0}).to_list(500)
    for country in countries_to_fix:
        own_currency = country.get("currency_code") or get_country_config(country["code"]).get("default_currency", "USD")
        await db.countries.update_one(
            {"code": country["code"]},
            {"$set": {
                "accepted_currencies": [own_currency],
                "currencies_normalized_v1": True,
                "currencies_updated_at": now_iso()
            }}
        )

    if not await db.users.find_one({"role": "admin"}):
        aid = gen_id()
        await db.users.insert_one({
            "id": aid, "phone": "+243000000000", "name": "Administrateur Principal",
            "email": "admin@monityworld.com", "password": hash_pw("Admin@123"),
            "role": "admin", "country": "CD", "language": "fr",
            "is_active": True, "is_verified": True, "is_super_admin": True,
            "kyc_status": "approved",
            "account_number": "0000000000", "referral_code": "ADMIN00",
            "assigned_countries": [],  # Empty = all countries
            "assigned_transaction_types": [],  # Empty = all types
            "referred_by": None, "otp": None, "profile_image": None, "created_at": now_iso()
        })
        # Admin accounts do NOT get wallets
        logger.info("Super Admin créé: +243000000000 / Admin@123")

    # Disable wallets for all admin/manager accounts (they should not have client features)
    admin_users = await db.users.find({"role": {"$in": NON_CLIENT_ROLES}}, {"id": 1}).to_list(1000)
    admin_ids = [u["id"] for u in admin_users]
    if admin_ids:
        result = await db.wallets.delete_many({"user_id": {"$in": admin_ids}})
        if result.deleted_count > 0:
            logger.info(f"Supprimé {result.deleted_count} portefeuilles de comptes administrateurs")

    # Create TTL index for idempotency keys (expire after 24 hours)
    try:
        await db.idempotency_keys.create_index("created_at", expireAfterSeconds=86400)
    except Exception:
        pass  # Index may already exist

    if not await db.users.find_one({"phone": "+243100000001"}):
        did = gen_id()
        now_dt = datetime.now(timezone.utc)
        await db.users.insert_one({
            "id": did, "phone": "+243100000001", "name": "Jean Mutombo",
            "email": "jean@example.com", "password": hash_pw("Client@123"),
            "role": "client", "country": "CD", "language": "fr",
            "is_active": True, "is_verified": True, "kyc_status": "approved",
            "account_number": "1234567890", "referral_code": "JEAN001",
            "referred_by": None, "otp": None, "profile_image": None, "created_at": now_iso()
        })
        for cur, bal, primary in [("USD", 250.0, True), ("EUR", 180.0, False), ("XAF", 50000.0, False)]:
            await db.wallets.insert_one({"id": gen_id(), "user_id": did, "currency": cur, "balance": bal, "is_primary": primary, "created_at": now_iso()})
        await db.cards.insert_one({"id": gen_id(), "user_id": did, "card_number": "**** **** **** 4521", "card_type": "virtual", "balance": 50.0, "limit": 1000.0, "is_locked": False, "expiry_date": "03/28", "currency": "USD", "created_at": now_iso()})
        await db.transactions.insert_many([
            {"id": gen_id(), "sender_id": did, "sender_name": "Jean Mutombo", "sender_phone": "+243100000001", "receiver_id": None, "receiver_name": "Marie Kalala", "receiver_phone": "+243100000002", "amount": 50.0, "fee": 0.5, "currency": "USD", "type": "transfer", "status": "completed", "description": "Transfert famille", "created_at": (now_dt - timedelta(days=1)).isoformat(), "completed_at": (now_dt - timedelta(days=1)).isoformat(), "admin_note": None},
            {"id": gen_id(), "sender_id": None, "sender_name": "Système", "sender_phone": None, "receiver_id": did, "receiver_name": "Jean Mutombo", "receiver_phone": "+243100000001", "amount": 100.0, "fee": 0.0, "currency": "USD", "type": "recharge", "status": "completed", "description": "Rechargement Mobile Money", "created_at": (now_dt - timedelta(days=2)).isoformat(), "completed_at": (now_dt - timedelta(days=2)).isoformat(), "admin_note": None},
            {"id": gen_id(), "sender_id": did, "sender_name": "Jean Mutombo", "sender_phone": "+243100000001", "receiver_id": None, "receiver_name": "Retrait", "receiver_phone": "+243100000001", "amount": 30.0, "fee": 0.45, "currency": "USD", "type": "withdrawal", "status": "pending", "description": "Retrait Mobile Money", "created_at": now_dt.isoformat(), "completed_at": None, "admin_note": None}
        ])
        logger.info("Client démo créé: +243100000001 / Client@123")


@app.on_event("shutdown")
async def shutdown(): client.close()
