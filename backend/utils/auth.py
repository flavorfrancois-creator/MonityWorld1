"""
Monity World - Authentication Utilities
JWT token management and user authentication
"""
import os
from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'monity-world-secret-2024')
JWT_ALGORITHM = "HS256"

# Security bearer
security = HTTPBearer()


def create_token(user_id: str, role: str, expires_days: int = 30) -> str:
    """Create a JWT token for a user"""
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=expires_days)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(401, "Token invalide ou expiré")


async def get_current_user_from_db(db, credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get the current user from database based on JWT token"""
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


def get_user_role(user: dict) -> str:
    """Get the role of a user"""
    return user.get("role", "client")


def is_admin_role(role: str) -> bool:
    """Check if a role is an admin role"""
    admin_roles = ["admin", "super_admin", "primary_admin", "partner_admin", "support", "country_admin"]
    return role in admin_roles


def can_access_admin_routes(user: dict) -> bool:
    """Check if a user can access admin routes"""
    return is_admin_role(user.get("role", "client"))


# List of operations that require KYC for admins
KYC_REQUIRED_OPERATIONS = [
    "users.create", "users.edit", "users.delete", "users.promote",
    "transactions.approve", "transactions.reject",
    "currencies.edit", "rates.edit",
    "partners.create", "partners.edit", "partners.approve",
    "admins.create", "admins.edit", "admins.assign_permissions",
    "rules_fees.edit", "settings.edit"
]


def requires_admin_kyc(permission: str) -> bool:
    """Check if a permission requires KYC verification."""
    return permission in KYC_REQUIRED_OPERATIONS
