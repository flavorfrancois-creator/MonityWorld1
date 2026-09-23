"""
Monity World - Integration Routes
================================
API endpoints for SMS OTP, Mobile Money, and PIN management.
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import os
import logging
import random
import string
import uuid
import bcrypt

# Import from main server (we'll use dependency injection)
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


# ===========================================
# MODELS
# ===========================================

class SendOTPRequest(BaseModel):
    phone: str
    purpose: str = "verification"  # verification, transaction, login


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


class SetPINRequest(BaseModel):
    pin: str  # 4-6 digits


class VerifyPINRequest(BaseModel):
    pin: str


class ChangePINRequest(BaseModel):
    current_pin: str
    new_pin: str


class MobileMoneyRechargeRequest(BaseModel):
    amount: float
    currency: str = "USD"
    phone: str
    provider: str = "mtn_momo"  # mtn_momo, orange_money, airtel_money


class MobileMoneyWithdrawRequest(BaseModel):
    amount: float
    currency: str = "USD"
    phone: str
    provider: str = "mtn_momo"
    pin: str


class CheckTransactionStatusRequest(BaseModel):
    transaction_id: str
    provider: str


# ===========================================
# HELPERS
# ===========================================

def gen_otp(length: int = 6) -> str:
    """Generate a random OTP"""
    return ''.join(random.choices(string.digits, k=length))


def hash_pin(pin: str) -> str:
    """Hash a PIN"""
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    """Verify a PIN against its hash"""
    return bcrypt.checkpw(pin.encode(), hashed.encode())


def now_iso() -> str:
    """Get current UTC timestamp in ISO format"""
    return datetime.now(timezone.utc).isoformat()


# ===========================================
# INTEGRATION SERVICE SETUP
# ===========================================

# Lazy import to avoid circular imports
_integration_service = None

def get_integration_service():
    """Get or create integration service instance"""
    global _integration_service
    if _integration_service is None:
        try:
            from integrations import integration_service
            _integration_service = integration_service
        except ImportError:
            logger.warning("Integration service not available, using mock mode")
            _integration_service = None
    return _integration_service


# ===========================================
# OTP ENDPOINTS
# ===========================================

async def send_otp_endpoint(req: SendOTPRequest, db, background_tasks: BackgroundTasks):
    """Send OTP via SMS"""
    # Check if user exists
    user = await db.users.find_one({"phone": req.phone})
    
    # Generate OTP
    otp_code = gen_otp()
    otp_expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Store OTP in database
    await db.otp_codes.update_one(
        {"phone": req.phone, "purpose": req.purpose},
        {
            "$set": {
                "code": otp_code,
                "expires_at": otp_expires.isoformat(),
                "attempts": 0,
                "created_at": now_iso()
            }
        },
        upsert=True
    )
    
    # Get integration service
    integration = get_integration_service()
    
    # Determine country from user or phone
    country_code = "CD"
    if user:
        country_code = user.get("country", "CD")
    
    # Check if SMS is enabled
    enable_sms = os.environ.get("ENABLE_SMS_OTP", "false").lower() == "true"
    
    if enable_sms and integration:
        # Send real SMS
        result = await integration.send_otp(req.phone, otp_code, country_code)
        if not result.success:
            logger.warning(f"SMS send failed: {result.error}")
            # Fall back to returning OTP in development
            if os.environ.get("ENVIRONMENT", "development") == "development":
                return {
                    "success": True,
                    "message": "OTP généré (mode développement)",
                    "otp": otp_code,  # Only in development!
                    "expires_in_minutes": 10,
                    "sms_status": "failed",
                    "sms_error": result.error
                }
            raise HTTPException(500, f"Échec d'envoi SMS: {result.error}")
        
        return {
            "success": True,
            "message": f"Code OTP envoyé à {req.phone}",
            "expires_in_minutes": 10,
            "sms_status": "sent",
            "provider": result.provider
        }
    else:
        # Development mode - return OTP directly
        logger.info(f"OTP for {req.phone}: {otp_code}")
        return {
            "success": True,
            "message": "OTP généré (SMS désactivé)",
            "otp": otp_code,  # Only in development!
            "expires_in_minutes": 10,
            "note": "Activez ENABLE_SMS_OTP=true pour envoyer de vrais SMS"
        }


async def verify_otp_endpoint(req: VerifyOTPRequest, db):
    """Verify OTP code"""
    otp_record = await db.otp_codes.find_one({"phone": req.phone})
    
    if not otp_record:
        raise HTTPException(400, "Aucun OTP trouvé pour ce numéro")
    
    # Check expiry
    expires_at = datetime.fromisoformat(otp_record["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "OTP expiré. Demandez un nouveau code.")
    
    # Check attempts
    if otp_record.get("attempts", 0) >= 5:
        raise HTTPException(429, "Trop de tentatives. Demandez un nouveau code.")
    
    # Verify code
    if otp_record["code"] != req.otp:
        await db.otp_codes.update_one(
            {"phone": req.phone},
            {"$inc": {"attempts": 1}}
        )
        raise HTTPException(400, "Code OTP incorrect")
    
    # Mark as verified and delete
    await db.otp_codes.delete_one({"phone": req.phone})
    
    return {
        "success": True,
        "message": "OTP vérifié avec succès",
        "verified_at": now_iso()
    }


# ===========================================
# PIN MANAGEMENT ENDPOINTS
# ===========================================

async def set_pin_endpoint(req: SetPINRequest, user: dict, db):
    """Set or create transaction PIN"""
    # Validate PIN format
    if not req.pin.isdigit() or len(req.pin) < 4 or len(req.pin) > 6:
        raise HTTPException(400, "Le PIN doit contenir 4 à 6 chiffres")
    
    # Check if PIN already exists
    if user.get("transaction_pin"):
        raise HTTPException(400, "PIN déjà défini. Utilisez /change-pin pour le modifier.")
    
    # Hash and store PIN
    hashed_pin = hash_pin(req.pin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "transaction_pin": hashed_pin,
            "pin_set_at": now_iso(),
            "pin_failed_attempts": 0
        }}
    )
    
    return {
        "success": True,
        "message": "PIN de transaction défini avec succès"
    }


async def verify_pin_endpoint(req: VerifyPINRequest, user: dict, db):
    """Verify transaction PIN"""
    stored_pin = user.get("transaction_pin")
    
    if not stored_pin:
        raise HTTPException(400, "Aucun PIN défini. Créez un PIN d'abord.")
    
    # Check lockout
    failed_attempts = user.get("pin_failed_attempts", 0)
    last_attempt = user.get("pin_last_failed_at")
    
    if failed_attempts >= 5 and last_attempt:
        lockout_until = datetime.fromisoformat(last_attempt.replace('Z', '+00:00')) + timedelta(minutes=30)
        if datetime.now(timezone.utc) < lockout_until:
            remaining = (lockout_until - datetime.now(timezone.utc)).seconds // 60
            raise HTTPException(429, f"Compte verrouillé. Réessayez dans {remaining} minutes.")
    
    # Verify PIN
    if not verify_pin(req.pin, stored_pin):
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {"pin_failed_attempts": 1},
                "$set": {"pin_last_failed_at": now_iso()}
            }
        )
        remaining = 5 - failed_attempts - 1
        if remaining <= 0:
            raise HTTPException(429, "PIN incorrect. Compte verrouillé pendant 30 minutes.")
        raise HTTPException(400, f"PIN incorrect. {remaining} tentative(s) restante(s).")
    
    # Reset failed attempts on success
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"pin_failed_attempts": 0, "pin_last_failed_at": None}}
    )
    
    return {
        "success": True,
        "message": "PIN vérifié",
        "verified_at": now_iso()
    }


async def change_pin_endpoint(req: ChangePINRequest, user: dict, db):
    """Change transaction PIN"""
    stored_pin = user.get("transaction_pin")
    
    if not stored_pin:
        raise HTTPException(400, "Aucun PIN défini. Utilisez /set-pin d'abord.")
    
    # Verify current PIN
    if not verify_pin(req.current_pin, stored_pin):
        raise HTTPException(400, "PIN actuel incorrect")
    
    # Validate new PIN
    if not req.new_pin.isdigit() or len(req.new_pin) < 4 or len(req.new_pin) > 6:
        raise HTTPException(400, "Le nouveau PIN doit contenir 4 à 6 chiffres")
    
    if req.current_pin == req.new_pin:
        raise HTTPException(400, "Le nouveau PIN doit être différent")
    
    # Update PIN
    hashed_pin = hash_pin(req.new_pin)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "transaction_pin": hashed_pin,
            "pin_changed_at": now_iso()
        }}
    )
    
    return {
        "success": True,
        "message": "PIN modifié avec succès"
    }


async def reset_pin_endpoint(phone: str, user: dict, db, background_tasks: BackgroundTasks):
    """Request PIN reset via OTP"""
    # Send OTP for PIN reset
    otp_code = gen_otp()
    otp_expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    await db.otp_codes.update_one(
        {"phone": user["phone"], "purpose": "pin_reset"},
        {
            "$set": {
                "code": otp_code,
                "expires_at": otp_expires.isoformat(),
                "attempts": 0,
                "created_at": now_iso()
            }
        },
        upsert=True
    )
    
    # Get integration service
    integration = get_integration_service()
    enable_sms = os.environ.get("ENABLE_SMS_OTP", "false").lower() == "true"
    
    if enable_sms and integration:
        result = await integration.send_otp(user["phone"], otp_code, user.get("country", "CD"))
        if result.success:
            return {
                "success": True,
                "message": f"Code de réinitialisation envoyé à {user['phone']}"
            }
    
    # Development mode
    return {
        "success": True,
        "message": "Code de réinitialisation généré",
        "otp": otp_code,  # Only in dev!
        "note": "Mode développement - SMS désactivé"
    }


# ===========================================
# MOBILE MONEY ENDPOINTS
# ===========================================

async def mobile_money_recharge_endpoint(req: MobileMoneyRechargeRequest, user: dict, db):
    """Initiate mobile money recharge (collection)"""
    integration = get_integration_service()
    
    if not integration:
        raise HTTPException(503, "Service Mobile Money non disponible")
    
    # Generate reference
    reference = f"RECH-{user['id'][:8]}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # Get user's country
    country_code = user.get("country", "CD")
    
    # Check if provider is available for country
    from integrations import get_available_providers_for_country, MobileMoneyProvider
    providers = get_available_providers_for_country(country_code)
    
    if req.provider not in providers.get("mobile_money", []):
        available = ", ".join(providers.get("mobile_money", []))
        raise HTTPException(
            400, 
            f"Provider {req.provider} non disponible dans votre pays. Disponibles: {available}"
        )
    
    # Request payment
    result = await integration.request_mobile_money_payment(
        phone=req.phone,
        amount=req.amount,
        currency=req.currency,
        reference=reference,
        description=f"Rechargement Monity World - {user['name']}",
        country_code=country_code,
        preferred_provider=MobileMoneyProvider(req.provider)
    )
    
    if not result.success:
        raise HTTPException(400, f"Erreur Mobile Money: {result.error}")
    
    # Store pending transaction
    await db.mobile_money_transactions.insert_one({
        "id": result.transaction_id,
        "user_id": user["id"],
        "type": "recharge",
        "amount": req.amount,
        "currency": req.currency,
        "phone": req.phone,
        "provider": req.provider,
        "reference": reference,
        "status": "pending",
        "created_at": now_iso()
    })
    
    return {
        "success": True,
        "message": "Demande de paiement envoyée. Confirmez sur votre téléphone.",
        "transaction_id": result.transaction_id,
        "reference": reference,
        "provider": req.provider,
        "amount": req.amount,
        "currency": req.currency
    }


async def mobile_money_withdraw_endpoint(req: MobileMoneyWithdrawRequest, user: dict, db):
    """Initiate mobile money withdrawal (disbursement)"""
    # Verify PIN first
    stored_pin = user.get("transaction_pin")
    if not stored_pin:
        raise HTTPException(400, "Définissez un PIN de transaction d'abord")
    
    if not verify_pin(req.pin, stored_pin):
        raise HTTPException(400, "PIN incorrect")
    
    # Check wallet balance
    wallet = await db.wallets.find_one({"user_id": user["id"], "currency": req.currency})
    if not wallet or wallet["balance"] < req.amount:
        raise HTTPException(400, "Solde insuffisant")
    
    integration = get_integration_service()
    
    if not integration:
        raise HTTPException(503, "Service Mobile Money non disponible")
    
    # Generate reference
    reference = f"WITH-{user['id'][:8]}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    country_code = user.get("country", "CD")
    
    # Deduct from wallet (will be refunded if transfer fails)
    await db.wallets.update_one(
        {"user_id": user["id"], "currency": req.currency},
        {"$inc": {"balance": -req.amount}}
    )
    
    # Send money
    from integrations import MobileMoneyProvider
    result = await integration.send_mobile_money(
        phone=req.phone,
        amount=req.amount,
        currency=req.currency,
        reference=reference,
        description=f"Retrait Monity World - {user['name']}",
        country_code=country_code,
        preferred_provider=MobileMoneyProvider(req.provider)
    )
    
    if not result.success:
        # Refund wallet
        await db.wallets.update_one(
            {"user_id": user["id"], "currency": req.currency},
            {"$inc": {"balance": req.amount}}
        )
        raise HTTPException(400, f"Erreur Mobile Money: {result.error}")
    
    # Store transaction
    await db.mobile_money_transactions.insert_one({
        "id": result.transaction_id,
        "user_id": user["id"],
        "type": "withdrawal",
        "amount": req.amount,
        "currency": req.currency,
        "phone": req.phone,
        "provider": req.provider,
        "reference": reference,
        "status": "pending",
        "created_at": now_iso()
    })
    
    return {
        "success": True,
        "message": "Transfert initié. Vous recevrez l'argent sous peu.",
        "transaction_id": result.transaction_id,
        "reference": reference,
        "provider": req.provider,
        "amount": req.amount,
        "currency": req.currency
    }


async def check_momo_status_endpoint(req: CheckTransactionStatusRequest, user: dict, db):
    """Check mobile money transaction status"""
    # Get stored transaction
    tx = await db.mobile_money_transactions.find_one({
        "id": req.transaction_id,
        "user_id": user["id"]
    })
    
    if not tx:
        raise HTTPException(404, "Transaction non trouvée")
    
    integration = get_integration_service()
    
    if not integration:
        return {
            "transaction_id": req.transaction_id,
            "status": tx.get("status", "pending"),
            "message": "Service de vérification non disponible"
        }
    
    # Check status with provider
    from integrations import MobileMoneyProvider
    provider = integration.get_momo_provider(MobileMoneyProvider(req.provider))
    
    if provider:
        result = await provider.check_transaction_status(req.transaction_id)
        
        if result.success:
            new_status = result.status.value
            
            # Update stored transaction
            await db.mobile_money_transactions.update_one(
                {"id": req.transaction_id},
                {"$set": {"status": new_status, "updated_at": now_iso()}}
            )
            
            # If successful recharge, credit wallet
            if new_status == "successful" and tx["type"] == "recharge" and tx.get("status") != "successful":
                wallet = await db.wallets.find_one({"user_id": user["id"], "currency": tx["currency"]})
                if wallet:
                    await db.wallets.update_one(
                        {"user_id": user["id"], "currency": tx["currency"]},
                        {"$inc": {"balance": tx["amount"]}}
                    )
                else:
                    await db.wallets.insert_one({
                        "id": str(uuid.uuid4()),
                        "user_id": user["id"],
                        "currency": tx["currency"],
                        "balance": tx["amount"],
                        "is_primary": False,
                        "created_at": now_iso()
                    })
            
            # If failed withdrawal, refund
            if new_status == "failed" and tx["type"] == "withdrawal" and tx.get("status") != "failed":
                await db.wallets.update_one(
                    {"user_id": user["id"], "currency": tx["currency"]},
                    {"$inc": {"balance": tx["amount"]}}
                )
            
            return {
                "transaction_id": req.transaction_id,
                "status": new_status,
                "provider": req.provider,
                "amount": tx.get("amount"),
                "currency": tx.get("currency")
            }
    
    return {
        "transaction_id": req.transaction_id,
        "status": tx.get("status", "pending"),
        "message": "Impossible de vérifier le statut"
    }


# ===========================================
# COUNTRY/PROVIDER INFO ENDPOINTS
# ===========================================

async def get_supported_countries_endpoint():
    """Get list of supported countries and their providers"""
    integration = get_integration_service()
    
    if integration:
        return {
            "countries": integration.get_supported_countries()
        }
    
    # Fallback list
    from integrations import COUNTRY_INTEGRATIONS
    return {
        "countries": [
            {
                "code": code,
                "name": config.name,
                "dial_code": config.dial_code,
                "currency": config.currency,
                "sms_providers": [p.value for p in config.sms_providers],
                "mobile_money_providers": [p.value for p in config.mobile_money_providers]
            }
            for code, config in COUNTRY_INTEGRATIONS.items()
        ]
    }


async def get_providers_for_country_endpoint(country_code: str):
    """Get available providers for a specific country"""
    from integrations import get_available_providers_for_country, get_country_config
    
    config = get_country_config(country_code)
    if not config:
        raise HTTPException(404, f"Pays {country_code} non supporté")
    
    providers = get_available_providers_for_country(country_code)
    
    return {
        "country_code": country_code,
        "country_name": config.name,
        "currency": config.currency,
        "dial_code": config.dial_code,
        "sms_providers": providers.get("sms", []),
        "mobile_money_providers": providers.get("mobile_money", [])
    }
