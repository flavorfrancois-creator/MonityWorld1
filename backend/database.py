"""
Monity World - Centralized Database Connection and Shared Dependencies
All route modules and utils should import db, auth deps, and constants from here.
"""
import os
import uuid
import random
import string
import secrets
import logging
import bcrypt
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from utils.helpers import now_iso

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL')
if not mongo_url:
    raise ValueError("MONGO_URL environment variable is not set")

client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'monity_world')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'monity-world-secret-2024')
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

NON_CLIENT_ROLES = ["primary_admin", "secondary_primary_admin", "admin", "manager"]

logger = logging.getLogger(__name__)


# --- Shared utility functions ---
def gen_id(): return str(uuid.uuid4())
def hash_pw(p: str) -> str: return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pw(p: str, h: str) -> bool: return bcrypt.checkpw(p.encode(), h.encode())
def gen_otp(): return ''.join(random.choices(string.digits, k=6))
def gen_account(): return ''.join(random.choices(string.digits, k=10))
def gen_ref(name): return name[:3].upper() + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
def gen_barcode(): return 'MVC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=13))
def gen_nfc_code(): return 'NFC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
def gen_printed_card_number(): return '-'.join([''.join(random.choices(string.digits, k=4)) for _ in range(4)])
def gen_reset_token(): return secrets.token_urlsafe(32)


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
    from rbac import is_original_primary_admin
    if is_original_primary_admin(user):
        return user
    kyc_status = user.get("kyc_status", "pending")
    if kyc_status != "approved":
        raise HTTPException(
            403,
            f"Vérification d'identité requise. Votre KYC est actuellement: {kyc_status}.",
            headers={"X-KYC-Required": "true", "X-KYC-Status": kyc_status}
        )
    return user



def check_admin_kyc_status(user: dict) -> dict:
    """
    Return KYC status info for an admin user.
    """
    from rbac import is_original_primary_admin
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
