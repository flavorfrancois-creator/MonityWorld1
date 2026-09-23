"""
Monity World - Shared Route Dependencies
========================================
This module provides shared dependencies for all route modules.
Import from here to access db, auth functions, and utilities.
"""
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# Database connection
mongo_url = os.environ.get('MONGO_URL')
if mongo_url:
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'monity_world')]
else:
    db = None
    client = None

# Security
security = HTTPBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'monity-world-secret-2024')
JWT_ALGORITHM = "HS256"


def create_token(user_id: str, role: str) -> str:
    """Create JWT token"""
    from datetime import datetime, timezone, timedelta
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from JWT token"""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Token invalide")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "otp": 0})
        if not user:
            raise HTTPException(401, "Utilisateur non trouvé")
        if not user.get("is_active"):
            raise HTTPException(403, "Compte suspendu")
        
        return user
    except JWTError:
        raise HTTPException(401, "Token invalide ou expiré")


async def get_admin(u=Depends(get_current_user)):
    """Require admin role"""
    admin_roles = ["admin", "super_admin", "primary_admin", "partner_admin", "support", "country_admin"]
    if u.get("role") not in admin_roles:
        raise HTTPException(403, "Accès refusé - Droits administrateur requis")
    return u


# Re-export utilities
from utils.helpers import (
    gen_id, hash_pw, verify_pw, gen_otp, gen_account, gen_ref,
    gen_barcode, gen_nfc_code, gen_printed_card_number, gen_reset_token,
    validate_nfc_serial, now_iso
)

__all__ = [
    'db', 'client', 'security', 'JWT_SECRET', 'JWT_ALGORITHM',
    'create_token', 'get_current_user', 'get_admin',
    'gen_id', 'hash_pw', 'verify_pw', 'gen_otp', 'gen_account', 'gen_ref',
    'gen_barcode', 'gen_nfc_code', 'gen_printed_card_number', 'gen_reset_token',
    'validate_nfc_serial', 'now_iso'
]
