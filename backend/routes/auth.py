"""
Monity World - Authentication Routes
=====================================
Handles user registration, login, OTP, 2FA, password reset, and biometric authentication.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import os
import logging
import random
import string
import secrets
from pathlib import Path

from jose import jwt, JWTError
import bcrypt

# Webauthn imports
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
)
from webauthn.helpers import bytes_to_base64url

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Security
security = HTTPBearer()

# === MODELS ===
class RegisterReq(BaseModel):
    phone: str
    name: str
    email: Optional[str] = None
    password: str
    country: str = "CD"
    language: str = "fr"
    referral_code: Optional[str] = None
    nfc_card_number: Optional[str] = None


class LoginReq(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    password: str


class OTPReq(BaseModel):
    phone: str
    otp: str


class PasswordChangeReq(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdateReq(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = None


class BiometricRegistrationReq(BaseModel):
    id: str
    rawId: str
    response: dict
    type: str
    name: Optional[str] = "Mon appareil"


class BiometricAuthenticationReq(BaseModel):
    user_id: str
    id: str
    rawId: str
    response: dict
    type: str


# === HELPER FUNCTIONS ===
def gen_id():
    import uuid
    return str(uuid.uuid4())

def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_pw(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())

def gen_otp():
    return ''.join(random.choices(string.digits, k=6))

def gen_account():
    return ''.join(random.choices(string.digits, k=10))

def gen_ref(name):
    return name[:3].upper() + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))

def gen_reset_token():
    return secrets.token_urlsafe(32)

def now_iso():
    return datetime.now(timezone.utc).isoformat()


# === SETUP FUNCTION ===
def setup_auth_routes(db, get_current_user, create_token, send_whatsapp_otp=None, send_whatsapp_message=None, get_default_currencies=None):
    """
    Setup authentication routes with database and dependencies.
    
    Args:
        db: MongoDB database instance
        get_current_user: Dependency function to get authenticated user
        create_token: Function to create JWT tokens
        send_whatsapp_otp: Optional function to send OTP via WhatsApp
        send_whatsapp_message: Optional function to send messages via WhatsApp
        get_default_currencies: Optional function to get default currencies for a country
    """
    
    # Uploads directory
    UPLOADS_DIR = Path(__file__).parent.parent / "uploads" / "profiles"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    
    # WebAuthn configuration
    RP_NAME = "Monity World"
    
    def get_webauthn_rp_id(request=None):
        rp_id = os.environ.get("WEBAUTHN_RP_ID", "")
        if rp_id:
            return rp_id
        if request:
            host = request.headers.get("host", "").split(":")[0]
            if host:
                return host
        return "localhost"

    def get_webauthn_origin(request=None):
        origin = os.environ.get("WEBAUTHN_ORIGIN", "")
        if origin:
            return origin
        if request:
            proto = request.headers.get("x-forwarded-proto", "https")
            host = request.headers.get("host", "localhost")
            return f"{proto}://{host}"
        return "https://localhost"

    # === REGISTRATION ===
    @router.post("/register")
    async def register(req: RegisterReq):
        if await db.users.find_one({"phone": req.phone}):
            raise HTTPException(400, "Ce numéro est déjà enregistré")
        
        if req.email:
            if await db.users.find_one({"email": req.email.lower()}):
                raise HTTPException(400, "Cet email est déjà enregistré")
        
        # Check NFC card
        linked_card = None
        if req.nfc_card_number:
            card_number_clean = req.nfc_card_number.replace("-", "")
            if len(card_number_clean) != 16 or not card_number_clean.isdigit():
                raise HTTPException(400, "Numéro de carte NFC invalide")
            
            linked_card = await db.virtual_cards.find_one({
                "printed_card_number": req.nfc_card_number,
                "is_standalone": True,
                "user_id": None
            })
            if not linked_card:
                raise HTTPException(400, "Carte NFC non trouvée ou déjà associée")
        
        referrer_id = None
        if req.referral_code:
            ref = await db.users.find_one({"referral_code": req.referral_code})
            if ref:
                referrer_id = ref["id"]
        
        # Get default currencies
        default_currency, secondary_currency = "USD", "EUR"
        if get_default_currencies:
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
            "free_card_used": False, "max_wallets": 2,
            "reset_token": None, "reset_token_expires": None,
            "created_at": now_iso()
        }
        await db.users.insert_one(doc)
        
        # Create wallets
        await db.wallets.insert_one({
            "id": gen_id(), "user_id": uid, "currency": default_currency,
            "balance": 0.0, "is_primary": True, "created_at": now_iso()
        })
        await db.wallets.insert_one({
            "id": gen_id(), "user_id": uid, "currency": secondary_currency,
            "balance": 0.0, "is_primary": False, "created_at": now_iso()
        })
        
        # Link card if provided
        if linked_card:
            await db.virtual_cards.update_one(
                {"id": linked_card["id"]},
                {"$set": {
                    "user_id": uid, "owner_name": req.name,
                    "is_standalone": False, "linked_at": now_iso(), "status": "approved"
                }}
            )
        
        if referrer_id:
            await db.referrals.insert_one({
                "id": gen_id(), "referrer_id": referrer_id, "referred_user_id": uid,
                "reward_amount": 5.0, "status": "pending", "created_at": now_iso()
            })
        
        # Send OTP via WhatsApp
        if send_whatsapp_otp:
            try:
                await send_whatsapp_otp(req.phone, otp)
            except Exception as e:
                logger.error(f"Failed to send OTP via WhatsApp: {e}")
        
        logger.info(f"Registered: {req.phone}")
        return {"message": "Inscription réussie. Un code OTP a été envoyé via WhatsApp.", "user_id": uid}

    @router.post("/verify-otp")
    async def verify_otp(req: OTPReq):
        user = await db.users.find_one({"phone": req.phone})
        if not user:
            raise HTTPException(404, "Utilisateur non trouvé")
        if user.get("otp") != req.otp:
            raise HTTPException(400, "OTP incorrect")
        await db.users.update_one({"phone": req.phone}, {"$set": {"is_verified": True, "otp": None}})
        user.pop("_id", None)
        user.pop("password", None)
        user.pop("otp", None)
        return {"token": create_token(user["id"], user["role"]), "user": user, "message": "Compte vérifié"}

    @router.post("/resend-otp")
    async def resend_otp(phone: str = Body(..., embed=True)):
        user = await db.users.find_one({"phone": phone})
        if not user:
            raise HTTPException(404, "Utilisateur non trouvé")
        
        otp = gen_otp()
        await db.users.update_one({"phone": phone}, {"$set": {"otp": otp}})
        
        if send_whatsapp_otp:
            try:
                await send_whatsapp_otp(phone, otp)
            except Exception as e:
                logger.error(f"Failed to send OTP via WhatsApp: {e}")
        
        return {"message": "Code OTP envoyé via WhatsApp"}

    @router.post("/login")
    async def login(req: LoginReq):
        user = None
        if req.phone:
            user = await db.users.find_one({"phone": req.phone})
        elif req.email:
            user = await db.users.find_one({"email": req.email.lower()})
        
        if not user or not verify_pw(req.password, user.get("password", "")):
            raise HTTPException(401, "Identifiants incorrects")
        if not user.get("is_active"):
            raise HTTPException(403, "Compte suspendu")
        
        # Check 2FA
        if user.get("two_factor_enabled"):
            otp = gen_otp()
            expires = datetime.now(timezone.utc) + timedelta(minutes=10)
            
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {
                    "two_factor_otp": otp,
                    "two_factor_otp_expires": expires.isoformat()
                }}
            )
            
            if send_whatsapp_otp:
                try:
                    await send_whatsapp_otp(user.get("phone"), otp, is_2fa=True)
                except Exception as e:
                    logger.error(f"Failed to send 2FA OTP: {e}")
            
            return {
                "requires_2fa": True,
                "user_id": user["id"],
                "message": "Code de vérification envoyé via WhatsApp"
            }
        
        user.pop("_id", None)
        user.pop("password", None)
        return {"token": create_token(user["id"], user["role"]), "user": user}

    @router.post("/verify-2fa")
    async def verify_2fa(user_id: str = Body(...), otp: str = Body(...)):
        user = await db.users.find_one({"id": user_id})
        if not user:
            raise HTTPException(404, "Utilisateur non trouvé")
        
        if user.get("two_factor_otp") != otp:
            raise HTTPException(400, "Code OTP incorrect")
        
        expires = user.get("two_factor_otp_expires")
        if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
            raise HTTPException(400, "Code OTP expiré")
        
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"two_factor_otp": None, "two_factor_otp_expires": None}}
        )
        
        user.pop("_id", None)
        user.pop("password", None)
        user.pop("two_factor_otp", None)
        user.pop("two_factor_otp_expires", None)
        
        return {"token": create_token(user["id"], user["role"]), "user": user}

    @router.post("/forgot-password")
    async def forgot_password(email: str = Body(..., embed=True)):
        user = await db.users.find_one({"email": email.lower()})
        if not user:
            return {"message": "Si l'adresse existe, un lien a été envoyé"}
        
        reset_token = gen_reset_token()
        expires = datetime.now(timezone.utc) + timedelta(minutes=30)
        
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "reset_token": reset_token,
                "reset_token_expires": expires.isoformat()
            }}
        )
        
        reset_url = f"https://monityworld.com/reset-password?token={reset_token}"
        
        if send_whatsapp_message and user.get("phone"):
            try:
                message = f"Monity World - Réinitialisation de mot de passe\n\nCliquez sur ce lien pour réinitialiser votre mot de passe:\n{reset_url}\n\nCe lien expire dans 30 minutes."
                await send_whatsapp_message(user["phone"], message)
            except Exception as e:
                logger.error(f"Failed to send reset link via WhatsApp: {e}")
        
        logger.info(f"Password reset for {email}: {reset_url}")
        return {"message": "Lien de réinitialisation envoyé par email et WhatsApp"}

    @router.post("/toggle-2fa")
    async def toggle_two_factor(enable: bool = Body(..., embed=True), u=Depends(get_current_user)):
        await db.users.update_one(
            {"id": u["id"]},
            {"$set": {"two_factor_enabled": enable}}
        )
        status = "activée" if enable else "désactivée"
        return {"message": f"Double authentification {status}", "two_factor_enabled": enable}

    @router.post("/change-password")
    async def change_password(req: PasswordChangeReq, u=Depends(get_current_user)):
        user = await db.users.find_one({"id": u["id"]})
        if not verify_pw(req.current_password, user.get("password", "")):
            raise HTTPException(400, "Mot de passe actuel incorrect")
        if len(req.new_password) < 6:
            raise HTTPException(400, "Le nouveau mot de passe doit contenir au moins 6 caractères")
        
        await db.users.update_one({"id": u["id"]}, {"$set": {"password": hash_pw(req.new_password)}})
        return {"message": "Mot de passe modifié avec succès"}

    @router.post("/reset-password")
    async def reset_password(token: str = Body(...), new_password: str = Body(...)):
        user = await db.users.find_one({"reset_token": token})
        if not user:
            raise HTTPException(400, "Token invalide")
        
        expires = user.get("reset_token_expires")
        if expires and datetime.fromisoformat(expires) < datetime.now(timezone.utc):
            raise HTTPException(400, "Token expiré")
        
        if len(new_password) < 6:
            raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caractères")
        
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "password": hash_pw(new_password),
                "reset_token": None,
                "reset_token_expires": None
            }}
        )
        
        return {"message": "Mot de passe réinitialisé avec succès"}

    @router.get("/me")
    async def me(u=Depends(get_current_user)):
        return u

    @router.patch("/profile")
    async def update_profile(req: ProfileUpdateReq, u=Depends(get_current_user)):
        update = {}
        if req.name:
            update["name"] = req.name
        if req.language:
            update["language"] = req.language
        if req.email:
            existing = await db.users.find_one({"email": req.email.lower(), "id": {"$ne": u["id"]}})
            if existing:
                raise HTTPException(400, "Cet email est déjà utilisé")
            update["email"] = req.email.lower()
        
        if update:
            update["updated_at"] = now_iso()
            await db.users.update_one({"id": u["id"]}, {"$set": update})
        
        user = await db.users.find_one({"id": u["id"]}, {"_id": 0, "password": 0})
        return user

    @router.post("/upload-profile-image")
    async def upload_profile_image(file: UploadFile = File(...), u=Depends(get_current_user)):
        if not file.content_type.startswith("image/"):
            raise HTTPException(400, "Le fichier doit être une image")
        
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(400, "L'image ne doit pas dépasser 5 Mo")
        
        ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        
        from utils.storage import upload_file as storage_upload
        storage_path = storage_upload(u['id'], content, file.filename, file.content_type or "image/jpeg", "profiles")
        
        image_url = f"/api/files/{storage_path}"
        await db.users.update_one({"id": u["id"]}, {"$set": {"profile_image": image_url, "profile_image_storage": storage_path}})
        
        return {"message": "Photo de profil mise à jour", "profile_image": image_url}

    # === BIOMETRIC AUTHENTICATION ===
    @router.get("/biometric/status")
    async def get_biometric_status(u=Depends(get_current_user)):
        credentials = await db.webauthn_credentials.find({"user_id": u["id"]}, {"_id": 0}).to_list(10)
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

    @router.post("/biometric/register/options")
    async def get_biometric_registration_options(request: Request, u=Depends(get_current_user)):
        rp_id = get_webauthn_rp_id(request)
        origin = get_webauthn_origin(request)
        
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

    @router.post("/biometric/register/verify")
    async def verify_biometric_registration(req: BiometricRegistrationReq, u=Depends(get_current_user)):
        challenge_doc = await db.webauthn_challenges.find_one({"user_id": u["id"], "type": "registration"})
        if not challenge_doc:
            raise HTTPException(400, "Session d'enregistrement expirée")
        
        if challenge_doc.get("expires_at", "") < now_iso():
            raise HTTPException(400, "Session d'enregistrement expirée")
        
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
            
            await db.webauthn_challenges.delete_one({"user_id": u["id"], "type": "registration"})
            
            return {"message": "Authentification biométrique activée", "success": True}
            
        except Exception as e:
            raise HTTPException(400, f"Échec de l'enregistrement biométrique: {str(e)}")

    @router.delete("/biometric/credential/{credential_id}")
    async def delete_biometric_credential(credential_id: str, u=Depends(get_current_user)):
        result = await db.webauthn_credentials.delete_one({
            "user_id": u["id"],
            "credential_id": {"$regex": f"^{credential_id[:20]}"}
        })
        
        if result.deleted_count == 0:
            raise HTTPException(404, "Credential non trouvé")
        
        return {"message": "Méthode biométrique supprimée"}

    return router
