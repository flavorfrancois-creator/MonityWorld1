"""
Monity World - Admin Management Routes
Extracted from server.py during refactoring
"""
import os
import logging
import random
import string
import secrets
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List
from fastapi import APIRouter, Body, HTTPException, Depends, Query, UploadFile, File, Request
from fastapi.responses import JSONResponse
from database import (
    db, get_current_user, get_admin, get_admin_with_kyc,
    gen_id, now_iso, hash_pw, verify_pw, create_token, gen_otp,
    gen_account, gen_ref, gen_barcode, gen_nfc_code, gen_printed_card_number,
    gen_reset_token, NON_CLIENT_ROLES, check_admin_kyc_status
)
from utils.fees import get_exchange_rate, calculate_fee, get_transaction_rule, get_international_rule, check_transaction_limits
from utils.admin_helpers import get_admin_country_filter, build_country_query, build_transaction_country_query, check_admin_card_access
from utils.auth import is_admin_role, can_access_admin_routes, requires_admin_kyc
from rbac import (
    check_permission, get_role_info, get_role_level,
    is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role,
    has_permission, require_permission, PERMISSIONS, PERMISSION_GROUPS,
    get_permission_categories, get_user_permissions, get_accessible_countries,
    can_access_user, check_can_suspend, check_can_create_role, get_default_admin_data,
    ROLES, can_access_country, can_suspend_user_by_type, check_can_suspend_user_by_type
)
from utils.auth import KYC_REQUIRED_OPERATIONS
from models.schemas import (
    AdminCreateReqV2, AdminPermissionsUpdateReq, AdminSuspendReq, UserSuspendReq,
    AdminRegistrationStartReq, AdminRegistrationVerifyReq, AdminRegistrationCompleteReq,
)
from utils.whatsapp import send_whatsapp_otp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=['Admin Management'])


# === MODEL FOR CLIENT DEPOSIT ===
class ClientDepositReq(BaseModel):
    client_phone: Optional[str] = None
    client_account: Optional[str] = None
    amount: float
    currency: str = "USD"
    method: str = "cash"
    note: Optional[str] = None
    idempotency_key: Optional[str] = None

# === ADVANCED ADMIN MANAGEMENT WITH RBAC ===

def _send_admin_email_otp(email: str, otp: str):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM", username)
    if not all([host, username, password, sender]):
        raise RuntimeError("SMTP is not configured for administrator email verification")
    message = EmailMessage()
    message["Subject"] = "Monity World - Code de confirmation administrateur"
    message["From"] = sender
    message["To"] = email
    message.set_content(f"Votre code de confirmation administrateur est : {otp}\n\nCe code expire dans 10 minutes.")
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(message)


@router.post("/administrators/registration/start")
async def start_admin_registration(req: AdminRegistrationStartReq, adm=Depends(get_admin)):
    check_permission(adm, "admins.create")
    country = await db.countries.find_one({"code": req.country.upper()}, {"_id": 0})
    if not country:
        raise HTTPException(400, "Pays de résidence invalide")
    dial_code = country.get("dial_code") or country.get("phone_prefix")
    if dial_code and not req.phone.startswith(dial_code):
        raise HTTPException(400, f"Le numéro doit commencer par {dial_code}")
    if await db.users.find_one({"phone": req.phone}):
        raise HTTPException(400, "Ce numéro de téléphone est déjà utilisé")
    if await db.users.find_one({"email": req.email.lower().strip()}):
        raise HTTPException(400, "Cette adresse mail est déjà utilisée")
    phone_otp = str(random.randint(100000, 999999))
    email_otp = str(random.randint(100000, 999999))
    verification_id = secrets.token_urlsafe(24)
    await db.admin_registration_verifications.insert_one({
        "id": verification_id,
        "country": req.country.upper(),
        "phone": req.phone,
        "email": req.email.lower().strip(),
        "phone_otp": hash_pw(phone_otp),
        "email_otp": hash_pw(email_otp),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "created_by": adm["id"],
    })
    try:
        await send_whatsapp_otp(req.phone, phone_otp)
        _send_admin_email_otp(req.email.lower().strip(), email_otp)
    except Exception as exc:
        await db.admin_registration_verifications.delete_one({"id": verification_id})
        logger.error("Administrator OTP delivery failed: %s", exc)
        raise HTTPException(503, "Impossible d'envoyer les codes OTP. Vérifiez la configuration WhatsApp et email.")
    return {"verification_id": verification_id, "expires_in": 600}


@router.post("/administrators/registration/verify")
async def verify_admin_registration(req: AdminRegistrationVerifyReq, adm=Depends(get_admin)):
    record = await db.admin_registration_verifications.find_one({"id": req.verification_id})
    if not record or datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "La vérification a expiré")
    if not verify_pw(req.phone_otp, record["phone_otp"]) or not verify_pw(req.email_otp, record["email_otp"]):
        raise HTTPException(400, "Code OTP incorrect")
    token = secrets.token_urlsafe(32)
    await db.admin_registration_verifications.update_one(
        {"id": req.verification_id},
        {"$set": {"verified": True, "verification_token": token}},
    )
    return {"verification_token": token}


@router.post("/administrators/registration/complete")
async def complete_admin_registration(req: AdminRegistrationCompleteReq, adm=Depends(get_admin)):
    check_permission(adm, "admins.create")
    record = await db.admin_registration_verifications.find_one({
        "verification_token": req.verification_token,
        "verified": True,
    })
    if not record:
        raise HTTPException(400, "Vérification OTP requise")
    if await db.users.find_one({"phone": record["phone"]}) or await db.users.find_one({"email": record["email"]}):
        raise HTTPException(400, "Le téléphone ou l'adresse mail est déjà utilisé")
    if len(req.password) < 8:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 8 caractères")
    check_can_create_role(adm, req.role)
    for permission in req.permissions:
        if permission not in PERMISSIONS:
            raise HTTPException(400, f"Permission invalide: {permission}")
    uid = gen_id()
    admin_data = get_default_admin_data()
    admin_data.update({
        "admin_level": None,
        "permissions": req.permissions,
        "assigned_countries": req.assigned_countries,
        "can_create_roles": req.can_create_roles,
        "can_suspend_roles": req.can_suspend_roles,
        "created_by_admin_id": adm["id"],
        "created_by_admin_name": adm.get("name"),
    })
    await db.users.insert_one({
        "id": uid, "phone": record["phone"], "name": req.name.strip(),
        "email": record["email"], "password": hash_pw(req.password),
        "role": req.role, "country": record["country"], "language": "fr",
        "is_active": True, "is_verified": True, "kyc_status": "pending",
        "date_of_birth": req.date_of_birth, "place_of_birth": req.place_of_birth,
        "account_number": gen_account(), "referral_code": gen_ref(req.name),
        "created_at": now_iso(), **admin_data,
    })
    await db.admin_registration_verifications.delete_one({"id": record["id"]})
    return {"message": "Administrateur créé avec succès", "user_id": uid}

async def get_primary_admin(user=Depends(get_current_user)):
    """Check if user is primary admin (original or secondary)"""
    if not is_primary_admin(user):
        raise HTTPException(403, "Accès réservé aux administrateurs principaux")
    if user.get("is_suspended"):
        raise HTTPException(403, "Votre compte est suspendu")
    return user

async def get_original_primary_admin(user=Depends(get_current_user)):
    """Check if user is the original primary admin"""
    if not is_original_primary_admin(user):
        raise HTTPException(403, "Seul l'administrateur principal original peut effectuer cette action")
    return user

# Models for admin management
@router.get("/rbac/permissions")
async def get_rbac_permissions(adm=Depends(get_admin)):
    """Get all available permissions and categories"""
    return {
        "permissions": PERMISSIONS,
        "categories": get_permission_categories(),
        "roles": {k: {"label": v["label"], "level": v["level"]} for k, v in ROLES.items()},
        "permission_groups": PERMISSION_GROUPS
    }


@router.get("/rbac/my-permissions")
async def get_my_permissions(adm=Depends(get_admin)):
    """Get current admin's permissions including KYC status"""
    kyc_info = check_admin_kyc_status(adm)
    
    return {
        "permissions": get_user_permissions(adm),
        "role": adm.get("role"),
        "role_label": get_role_info(adm.get("role", "")).get("label", ""),
        "is_primary_admin": is_primary_admin(adm),
        "is_original_primary": is_original_primary_admin(adm),
        "assigned_countries": get_accessible_countries(adm),
        "can_create_roles": adm.get("can_create_roles", []),
        "can_suspend_roles": adm.get("can_suspend_roles", []),
        "is_suspended": adm.get("is_suspended", False),
        "kyc_status": kyc_info["kyc_status"],
        "kyc_required": kyc_info["kyc_required"],
        "kyc_exempt": kyc_info["kyc_exempt"],
        "kyc_reason": kyc_info["reason"],
        "kyc_required_operations": KYC_REQUIRED_OPERATIONS if kyc_info["kyc_required"] else []
    }


@router.get("/administrators")
async def get_administrators(
    role: Optional[str] = None,
    country: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    adm=Depends(get_admin)
):
    """Get list of administrators with RBAC filtering"""
    check_permission(adm, "admins.view")
    
    query = {"role": {"$in": ["primary_admin", "secondary_primary_admin", "admin", "manager"]}}
    
    if role:
        query["role"] = role
    
    # Filter by country access
    accessible_countries = get_accessible_countries(adm)
    if accessible_countries:
        if country:
            if country not in accessible_countries:
                raise HTTPException(403, "Vous n'avez pas accès à ce pays")
            query["$or"] = [
                {"assigned_countries": {"$in": [country]}},
                {"assigned_countries": {"$size": 0}},
                {"country": country}
            ]
        else:
            query["$or"] = [
                {"assigned_countries": {"$in": accessible_countries}},
                {"assigned_countries": {"$size": 0}},
                {"country": {"$in": accessible_countries}}
            ]
    elif country:
        query["$or"] = [
            {"assigned_countries": {"$in": [country]}},
            {"country": country}
        ]
    
    skip = (page - 1) * limit
    total = await db.users.count_documents(query)
    
    admins = await db.users.find(query, {"_id": 0, "password": 0}).sort([
        ("admin_level", 1),
        ("role", 1),
        ("created_at", -1)
    ]).skip(skip).limit(limit).to_list(limit)
    
    # Add computed fields
    for admin in admins:
        admin["role_label"] = get_role_info(admin.get("role", "")).get("label", "")
        admin["is_primary"] = is_primary_admin(admin)
        admin["can_be_edited"] = can_manage_role(adm, admin.get("role", "client"))
        admin["can_be_suspended"] = can_suspend_role(adm, admin.get("role", "client")) and admin.get("id") != adm.get("id")
    
    return {
        "administrators": admins,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


@router.get("/administrators/{admin_id}")
async def get_administrator_details(admin_id: str, adm=Depends(get_admin)):
    """Get detailed info about an administrator"""
    check_permission(adm, "admins.view")
    
    admin = await db.users.find_one({"id": admin_id}, {"_id": 0, "password": 0})
    if not admin:
        raise HTTPException(404, "Administrateur non trouvé")
    
    if not can_access_user(adm, admin):
        raise HTTPException(403, "Vous n'avez pas accès à cet administrateur")
    
    admin["role_label"] = get_role_info(admin.get("role", "")).get("label", "")
    admin["effective_permissions"] = get_user_permissions(admin)
    admin["can_be_edited"] = can_manage_role(adm, admin.get("role", "client"))
    admin["can_be_suspended"] = can_suspend_role(adm, admin.get("role", "client"))
    
    return admin


@router.post("/administrators")
async def create_administrator_v2(req: AdminCreateReqV2, adm=Depends(get_admin_with_kyc)):
    """Create a new administrator with RBAC permissions. Requires approved KYC."""
    check_permission(adm, "admins.create")
    if not req.verification_token:
        raise HTTPException(400, "Vérification OTP requise avant la création")
    verification = await db.admin_registration_verifications.find_one({
        "verification_token": req.verification_token,
        "verified": True,
        "phone": req.phone,
        "email": (req.email or "").lower().strip(),
    })
    if not verification:
        raise HTTPException(400, "Vérification OTP invalide ou expirée")
    
    # Validate role creation permission
    check_can_create_role(adm, req.role)
    
    # Check if phone already exists
    if await db.users.find_one({"phone": req.phone}):
        raise HTTPException(400, "Ce numéro de téléphone est déjà utilisé")
    
    if req.email and await db.users.find_one({"email": req.email}):
        raise HTTPException(400, "Cet email est déjà utilisé")
    
    # Validate permissions being granted
    if req.permissions:
        actor_perms = get_user_permissions(adm)
        for p in req.permissions:
            if p not in PERMISSIONS:
                raise HTTPException(400, f"Permission invalide: {p}")
            # Can only grant permissions you have (except for original primary admin)
            if not is_original_primary_admin(adm) and p not in actor_perms:
                raise HTTPException(403, f"Vous ne pouvez pas accorder une permission que vous n'avez pas: {p}")
    
    # Determine admin_level for secondary primary admins
    admin_level = None
    if req.role == "secondary_primary_admin":
        # Count existing secondary primary admins
        count = await db.users.count_documents({"role": "secondary_primary_admin"})
        admin_level = count + 1  # 1, 2, 3, etc.
    
    uid = gen_id()
    n = now_iso()
    
    admin_data = get_default_admin_data()
    admin_data.update({
        "admin_level": admin_level,
        "permissions": req.permissions,
        "assigned_countries": req.assigned_countries,
        "can_create_roles": req.can_create_roles,
        "can_suspend_roles": req.can_suspend_roles,
        "created_by_admin_id": adm["id"],
        "created_by_admin_name": adm.get("name"),
    })
    
    doc = {
        "id": uid,
        "phone": req.phone,
        "name": req.name,
        "email": req.email,
        "password": hash_pw(req.password),
        "role": req.role,
        "country": req.country,
        "language": "fr",
        "is_active": True,
        "is_verified": True,
        "kyc_status": "pending",  # New admins need KYC
        "account_number": gen_account(),
        "referral_code": gen_ref(req.name),
        "created_at": n,
        **admin_data
    }
    
    await db.users.insert_one(doc)
    
    # Send notification
    role_label = get_role_info(req.role).get("label", req.role)
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "admin_created",
        "title": f"Compte {role_label} créé",
        "message": f"Votre compte {role_label} a été créé par {adm.get('name')}. Veuillez compléter votre vérification d'identité (KYC).",
        "is_read": False,
        "created_at": n
    })
    
    doc.pop("password", None)
    doc.pop("_id", None)
    
    return {
        "message": f"{role_label} créé avec succès",
        "administrator": doc
    }


@router.put("/administrators/{admin_id}/permissions")
async def update_administrator_permissions(
    admin_id: str, 
    req: AdminPermissionsUpdateReq, 
    adm=Depends(get_admin_with_kyc)
):
    """Update administrator permissions and access. Requires approved KYC."""
    check_permission(adm, "admins.assign_permissions")
    
    admin = await db.users.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(404, "Administrateur non trouvé")
    
    # Cannot modify original primary admin
    if is_original_primary_admin(admin):
        raise HTTPException(403, "Impossible de modifier les permissions de l'administrateur principal original")
    
    # Cannot modify if target has higher or equal level
    if not can_manage_role(adm, admin.get("role", "client")):
        raise HTTPException(403, "Vous ne pouvez pas modifier cet administrateur")
    
    # Validate permissions being granted
    if req.permissions:
        actor_perms = get_user_permissions(adm)
        for p in req.permissions:
            if p not in PERMISSIONS:
                raise HTTPException(400, f"Permission invalide: {p}")
            if not is_original_primary_admin(adm) and p not in actor_perms:
                raise HTTPException(403, f"Vous ne pouvez pas accorder une permission que vous n'avez pas: {p}")
    
    # Validate roles being granted for creation/suspension
    for role in req.can_create_roles:
        if role not in ROLES:
            raise HTTPException(400, f"Rôle invalide: {role}")
        if not can_create_role(adm, role):
            raise HTTPException(403, f"Vous ne pouvez pas autoriser la création de: {role}")
    
    for role in req.can_suspend_roles:
        if role not in ROLES:
            raise HTTPException(400, f"Rôle invalide: {role}")
        if not can_suspend_role(adm, role):
            raise HTTPException(403, f"Vous ne pouvez pas autoriser la suspension de: {role}")
    
    update_data = {
        "permissions": req.permissions,
        "assigned_countries": req.assigned_countries,
        "can_create_roles": req.can_create_roles,
        "can_suspend_roles": req.can_suspend_roles,
        "permissions_updated_at": now_iso(),
        "permissions_updated_by": adm["id"],
        "permissions_updated_by_name": adm.get("name")
    }
    
    await db.users.update_one({"id": admin_id}, {"$set": update_data})
    
    # Notify the admin
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": admin_id,
        "type": "permissions_updated",
        "title": "Permissions mises à jour",
        "message": f"Vos permissions ont été mises à jour par {adm.get('name')}.",
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {"message": "Permissions mises à jour avec succès"}


@router.post("/administrators/{admin_id}/suspend")
async def suspend_administrator(
    admin_id: str, 
    req: AdminSuspendReq,
    adm=Depends(get_admin_with_kyc)
):
    """Suspend an administrator account. Requires approved KYC."""
    check_permission(adm, "admins.suspend")
    
    admin = await db.users.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(404, "Administrateur non trouvé")
    
    # Use RBAC check
    check_can_suspend(adm, admin)
    
    n = now_iso()
    await db.users.update_one({"id": admin_id}, {"$set": {
        "is_suspended": True,
        "suspended_at": n,
        "suspended_by": adm["id"],
        "suspended_by_name": adm.get("name"),
        "suspension_reason": req.reason or "Suspendu par l'administrateur"
    }})
    
    # Notify the admin
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": admin_id,
        "type": "account_suspended",
        "title": "Compte suspendu",
        "message": f"Votre compte a été suspendu. Raison: {req.reason or 'Non spécifiée'}",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "Administrateur suspendu"}


@router.post("/administrators/{admin_id}/unsuspend")
async def unsuspend_administrator(admin_id: str, adm=Depends(get_admin)):
    """Unsuspend an administrator account"""
    check_permission(adm, "admins.suspend")
    
    admin = await db.users.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(404, "Administrateur non trouvé")
    
    if not can_manage_role(adm, admin.get("role", "client")):
        raise HTTPException(403, "Vous ne pouvez pas réactiver cet administrateur")
    
    n = now_iso()
    await db.users.update_one({"id": admin_id}, {"$set": {
        "is_suspended": False,
        "suspended_at": None,
        "suspended_by": None,
        "suspended_by_name": None,
        "suspension_reason": None,
        "unsuspended_at": n,
        "unsuspended_by": adm["id"]
    }})
    
    # Notify the admin
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": admin_id,
        "type": "account_unsuspended",
        "title": "Compte réactivé",
        "message": f"Votre compte a été réactivé par {adm.get('name')}.",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "Administrateur réactivé"}


@router.delete("/administrators/{admin_id}")
async def delete_administrator(admin_id: str, adm=Depends(get_admin)):
    """Demote an administrator to client (soft delete)"""
    check_permission(adm, "admins.delete")
    
    admin = await db.users.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(404, "Administrateur non trouvé")
    
    role_info = get_role_info(admin.get("role", ""))
    if not role_info.get("can_be_deleted", False):
        raise HTTPException(403, "Ce type d'administrateur ne peut pas être supprimé")
    
    if not can_manage_role(adm, admin.get("role", "client")):
        raise HTTPException(403, "Vous ne pouvez pas supprimer cet administrateur")
    
    # Demote to client
    n = now_iso()
    await db.users.update_one({"id": admin_id}, {"$set": {
        "role": "client",
        "admin_level": None,
        "permissions": [],
        "assigned_countries": [],
        "can_create_roles": [],
        "can_suspend_roles": [],
        "demoted_at": n,
        "demoted_by": adm["id"],
        "demoted_by_name": adm.get("name")
    }})
    
    # Notify the user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": admin_id,
        "type": "account_demoted",
        "title": "Compte modifié",
        "message": "Votre compte administrateur a été converti en compte client.",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "Administrateur rétrogradé en client"}


# === USER SUSPENSION (for all user types) ===
@router.post("/users/{uid}/suspend")
async def suspend_user(uid: str, req: UserSuspendReq, adm=Depends(get_admin)):
    """Suspend any user account based on RBAC permissions (granular by user type)"""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check country access
    if not can_access_country(adm, user.get("country", "")):
        raise HTTPException(403, "Vous n'avez pas accès aux utilisateurs de ce pays")
    
    # Check granular suspension permission based on user type
    check_can_suspend_user_by_type(adm, user)
    
    n = now_iso()
    await db.users.update_one({"id": uid}, {"$set": {
        "is_suspended": True,
        "suspended_at": n,
        "suspended_by": adm["id"],
        "suspended_by_name": adm.get("name"),
        "suspension_reason": req.reason or "Suspendu par l'administrateur"
    }})
    
    # Notify the user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "account_suspended",
        "title": "Compte suspendu",
        "message": f"Votre compte a été suspendu. Raison: {req.reason or 'Non spécifiée'}. Contactez le support pour plus d'informations.",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "Utilisateur suspendu"}


@router.post("/users/{uid}/unsuspend")
async def unsuspend_user(uid: str, adm=Depends(get_admin)):
    """Unsuspend a user account (uses same granular permissions as suspend)"""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    if not can_access_country(adm, user.get("country", "")):
        raise HTTPException(403, "Vous n'avez pas accès aux utilisateurs de ce pays")
    
    # Use granular permission check for unsuspend (same as suspend)
    if not can_suspend_user_by_type(adm, user.get("role", "client")):
        role_label = ROLES.get(user.get("role", "client"), {}).get("label", user.get("role", "client"))
        raise HTTPException(403, f"Vous n'êtes pas autorisé à gérer les {role_label.lower()}s")
    
    n = now_iso()
    await db.users.update_one({"id": uid}, {"$set": {
        "is_suspended": False,
        "suspended_at": None,
        "suspended_by": None,
        "suspended_by_name": None,
        "suspension_reason": None,
        "unsuspended_at": n,
        "unsuspended_by": adm["id"]
    }})
    
    # Notify the user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "account_unsuspended",
        "title": "Compte réactivé",
        "message": "Votre compte a été réactivé. Vous pouvez à nouveau utiliser tous les services.",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "Utilisateur réactivé"}


# Update user promotion endpoint with RBAC
@router.post("/users/{uid}/promote-v2")
async def admin_promote_user_v2(
    uid: str, 
    role: str,
    permissions: Optional[List[str]] = None,
    assigned_countries: Optional[List[str]] = None,
    adm=Depends(get_admin_with_kyc)
):
    """Promote a user to admin/manager with specific permissions. Requires approved KYC."""
    check_permission(adm, "users.promote")
    check_can_create_role(adm, role)
    
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    if is_primary_admin(user):
        raise HTTPException(403, "Impossible de modifier un administrateur principal")
    
    if not can_access_country(adm, user.get("country", "")):
        raise HTTPException(403, "Vous n'avez pas accès aux utilisateurs de ce pays")
    
    # Validate permissions
    valid_permissions = []
    if permissions:
        actor_perms = get_user_permissions(adm)
        for p in permissions:
            if p not in PERMISSIONS:
                continue
            if is_original_primary_admin(adm) or p in actor_perms:
                valid_permissions.append(p)
    
    admin_data = get_default_admin_data()
    admin_data.update({
        "permissions": valid_permissions,
        "assigned_countries": assigned_countries or [],
        "created_by_admin_id": adm["id"],
        "created_by_admin_name": adm.get("name"),
    })
    
    n = now_iso()
    update_data = {
        "role": role,
        "promoted_at": n,
        "promoted_by": adm["id"],
        "promoted_by_name": adm["name"],
        **admin_data
    }
    
    # If KYC not approved, set to pending
    if user.get("kyc_status") != "approved":
        update_data["kyc_status"] = "pending"
    
    await db.users.update_one({"id": uid}, {"$set": update_data})
    
    role_label = get_role_info(role).get("label", role)
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "promotion",
        "title": f"Promotion: {role_label}",
        "message": f"Félicitations ! Vous avez été promu(e) au rôle de {role_label} par {adm.get('name')}.",
        "is_read": False,
        "created_at": n
    })
    
    return {
        "message": f"Utilisateur promu en {role_label}",
        "user_name": user.get("name"),
        "new_role": role
    }


# Legacy endpoints for backward compatibility
async def get_super_admin(user=Depends(get_current_user)):
    """Check if user is super admin (first admin created) - LEGACY"""
    if user.get("role") != "admin":
        raise HTTPException(403, "Accès refusé")
    if not user.get("is_super_admin") and not is_original_primary_admin(user):
        raise HTTPException(403, "Seul le super administrateur peut effectuer cette action")
    return user



# === CLIENT DEPOSIT BY MANAGER/ADMIN ===
@router.post("/client-deposit")
async def client_deposit(req: ClientDepositReq, adm=Depends(get_admin)):
    """
    Deposit money into a client's wallet.
    Requires 'clients.deposit' permission.
    Manager can only deposit to clients in their assigned countries.
    """
    # 1. Check permission
    check_permission(adm, "clients.deposit")

    # 2. Validate amount
    if req.amount <= 0:
        raise HTTPException(400, "Montant invalide")

    # 3. Idempotency check
    if req.idempotency_key:
        existing = await db.idempotency_keys.find_one({
            "key": req.idempotency_key,
            "admin_id": adm["id"]
        })
        if existing:
            return existing.get("response", {"message": "Opération déjà effectuée", "duplicate": True})

    # 4. Find the client
    client = None
    if req.client_phone:
        client = await db.users.find_one({"phone": req.client_phone})
    elif req.client_account:
        client = await db.users.find_one({"account_number": req.client_account})

    if not client:
        raise HTTPException(404, "Client non trouvé")

    # 5. Verify target is a client (not admin/manager/etc.)
    if client.get("role") in NON_CLIENT_ROLES:
        raise HTTPException(403, "Le dépôt est autorisé uniquement vers les comptes clients")

    # 6. Check country restriction
    assigned_countries = adm.get("assigned_countries", [])
    if assigned_countries:
        client_country = (client.get("country") or "").upper()
        allowed = [c.upper() for c in assigned_countries]
        if client_country not in allowed:
            raise HTTPException(403, f"Vous n'avez pas accès aux clients de ce pays ({client_country})")

    # 7. Check if client is suspended
    if client.get("is_suspended"):
        raise HTTPException(400, "Le compte du client est suspendu")

    # 8. Find or create the client's wallet
    wallet = await db.wallets.find_one({"user_id": client["id"], "currency": req.currency})
    if not wallet:
        # Create wallet if it doesn't exist
        wallet_id = gen_id()
        wallet = {
            "id": wallet_id, "user_id": client["id"], "currency": req.currency,
            "balance": 0.0, "is_primary": False, "created_at": now_iso()
        }
        await db.wallets.insert_one(wallet)

    # 9. Credit the wallet
    new_balance = wallet["balance"] + req.amount
    await db.wallets.update_one(
        {"user_id": client["id"], "currency": req.currency},
        {"$inc": {"balance": req.amount}}
    )

    # 10. Create transaction record
    tx_id = gen_id()
    n = now_iso()
    tx = {
        "id": tx_id,
        "sender_id": None,
        "sender_name": f"Dépôt par: {adm['name']} ({adm.get('role', 'manager')})",
        "sender_phone": adm.get("phone"),
        "receiver_id": client["id"],
        "receiver_name": client["name"],
        "receiver_phone": client.get("phone"),
        "receiver_country": client.get("country"),
        "amount": req.amount,
        "fee": 0.0,
        "currency": req.currency,
        "type": "manager_deposit",
        "status": "completed",
        "method": req.method,
        "description": req.note or f"Dépôt par gestionnaire ({req.method})",
        "created_at": n,
        "completed_at": n,
        "admin_id": adm["id"],
        "admin_name": adm["name"],
        "admin_role": adm.get("role"),
    }
    await db.transactions.insert_one(tx)

    # 11. Notify the client
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": client["id"],
        "type": "deposit_received",
        "title": "Dépôt reçu",
        "message": f"Un dépôt de {req.amount} {req.currency} a été effectué sur votre compte par {adm['name']}.",
        "data": {"transaction_id": tx_id, "amount": req.amount, "currency": req.currency},
        "is_read": False,
        "created_at": n
    })

    # 12. Log activity
    await db.activity_logs.insert_one({
        "id": gen_id(),
        "admin_id": adm["id"],
        "admin_name": adm["name"],
        "admin_role": adm.get("role"),
        "action": "client_deposit",
        "target_type": "user",
        "target_id": client["id"],
        "target_name": client["name"],
        "details": {
            "amount": req.amount,
            "currency": req.currency,
            "method": req.method,
            "client_country": client.get("country"),
            "new_balance": new_balance,
        },
        "created_at": n
    })

    response = {
        "message": f"Dépôt de {req.amount} {req.currency} effectué avec succès",
        "transaction_id": tx_id,
        "client_name": client["name"],
        "client_phone": client.get("phone"),
        "amount": req.amount,
        "currency": req.currency,
        "new_balance": new_balance,
        "status": "completed"
    }

    # 13. Store idempotency key
    if req.idempotency_key:
        await db.idempotency_keys.insert_one({
            "key": req.idempotency_key,
            "admin_id": adm["id"],
            "response": response,
            "created_at": n
        })

    return response


@router.get("/client-deposit/search")
async def search_clients_for_deposit(
    q: str = "",
    country: Optional[str] = None,
    adm=Depends(get_admin)
):
    """
    Search clients for deposit. Only returns clients in manager's assigned countries.
    """
    check_permission(adm, "clients.deposit")

    query = {"role": "client", "is_suspended": {"$ne": True}}

    # Filter by manager's assigned countries
    assigned_countries = adm.get("assigned_countries", [])
    if assigned_countries:
        allowed = [c.upper() for c in assigned_countries]
        query["country"] = {"$in": allowed}
    elif country:
        query["country"] = country.upper()

    # Search by phone, name or account number
    if q:
        import re
        # Escape special regex characters in search query
        escaped_q = re.escape(q)
        query["$or"] = [
            {"phone": {"$regex": escaped_q, "$options": "i"}},
            {"name": {"$regex": escaped_q, "$options": "i"}},
            {"account_number": {"$regex": escaped_q, "$options": "i"}},
        ]

    clients = await db.users.find(
        query, {"_id": 0, "password": 0, "otp": 0, "reset_token": 0}
    ).limit(20).to_list(20)

    # Get wallet info for each client
    for c in clients:
        wallets = await db.wallets.find({"user_id": c["id"]}, {"_id": 0}).to_list(10)
        c["wallets"] = wallets

    return {"clients": clients, "count": len(clients)}
