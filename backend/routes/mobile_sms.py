"""
Monity World - Mobile Payments & SMS Routes
Extracted from server.py during refactoring
"""
import os
import logging
import random
import string
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, Request
from fastapi.responses import JSONResponse
from database import (
    db, get_current_user, get_admin, get_admin_with_kyc,
    gen_id, now_iso, hash_pw, verify_pw, create_token, gen_otp,
    gen_account, gen_ref, gen_barcode, gen_nfc_code, gen_printed_card_number,
    gen_reset_token, NON_CLIENT_ROLES
)
from utils.fees import get_exchange_rate, calculate_fee, get_transaction_rule, get_international_rule, check_transaction_limits
from utils.admin_helpers import get_admin_country_filter, build_country_query, build_transaction_country_query, check_admin_card_access
from utils.auth import is_admin_role, can_access_admin_routes, requires_admin_kyc
from rbac import (
    check_permission, get_role_info, get_role_level,
    is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role,
    has_permission, require_permission
)
from models.schemas import MobilePaymentOperatorReq, MobilePaymentDepositReq, MobilePaymentWithdrawReq, SmsApiConfigReq, SmsTestReq, SmtpConfigReq, SmtpTestReq

logger = logging.getLogger(__name__)
from utils.activity import log_admin_activity, ACTIVITY_ACTIONS, ACTIVITY_RESOURCES

router = APIRouter(prefix="/api", tags=['Mobile Payments & SMS'])


@router.get("/admin/mobile-operators")
async def get_mobile_operators(country_code: str = None, adm=Depends(get_admin)):
    """Get configured mobile payment operators"""
    query = {}
    if country_code:
        query["country_code"] = country_code.upper()
    
    operators = await db.mobile_payment_operators.find(query, {"_id": 0, "api_secret": 0}).sort([("country_code", 1), ("operator_name", 1)]).to_list(100)
    return {"operators": operators}


@router.post("/admin/mobile-operators")
async def create_mobile_operator(req: MobilePaymentOperatorReq, adm=Depends(get_admin_with_kyc)):
    """Create/Update mobile payment operator"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut configurer les operateurs")
    
    operator_data = {
        "country_code": req.country_code.upper(),
        "operator_name": req.operator_name,
        "operator_code": req.operator_code.upper(),
        "api_base_url": req.api_base_url,
        "api_key": req.api_key,
        "api_secret": req.api_secret,
        "webhook_url": req.webhook_url,
        "deposit_endpoint": req.deposit_endpoint,
        "withdrawal_endpoint": req.withdrawal_endpoint,
        "balance_endpoint": req.balance_endpoint,
        "is_active": req.is_active,
        "min_amount": req.min_amount,
        "max_amount": req.max_amount,
        "fee_percentage": req.fee_percentage,
        "fee_fixed": req.fee_fixed,
        "updated_at": now_iso(),
        "updated_by": adm["id"]
    }
    
    result = await db.mobile_payment_operators.update_one(
        {"operator_code": req.operator_code.upper()},
        {"$set": operator_data, "$setOnInsert": {"id": gen_id(), "created_at": now_iso()}},
        upsert=True
    )
    
    await log_admin_activity(adm, "create" if result.upserted_id else "update", "settings", 
                             details={"action": "mobile_operator", "operator": req.operator_code})
    
    return {"message": f"Operateur {req.operator_name} configure"}


@router.delete("/admin/mobile-operators/{operator_code}")
async def delete_mobile_operator(operator_code: str, adm=Depends(get_admin_with_kyc)):
    """Delete mobile payment operator"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut supprimer les operateurs")
    
    result = await db.mobile_payment_operators.delete_one({"operator_code": operator_code.upper()})
    if result.deleted_count == 0:
        raise HTTPException(404, "Operateur non trouve")
    
    await log_admin_activity(adm, "delete", "settings", details={"action": "mobile_operator_delete", "operator": operator_code})
    return {"message": "Operateur supprime"}


@router.get("/mobile-operators")
async def get_user_mobile_operators(u=Depends(get_current_user)):
    """Get available mobile operators for user's country"""
    user = await db.users.find_one({"id": u["id"]})
    country = user.get("country", "CD")
    
    operators = await db.mobile_payment_operators.find(
        {"country_code": country, "is_active": True},
        {"_id": 0, "api_key": 0, "api_secret": 0}
    ).to_list(20)
    
    return {"operators": operators, "country": country}


@router.post("/mobile-payment/deposit")
async def mobile_payment_deposit(req: MobilePaymentDepositReq, u=Depends(get_current_user)):
    """Initiate deposit via mobile money"""
    operator = await db.mobile_payment_operators.find_one({
        "operator_code": req.operator_code.upper(),
        "is_active": True
    })
    
    if not operator:
        raise HTTPException(404, "Operateur non disponible")
    
    # Validate amount
    if req.amount < operator.get("min_amount", 1):
        raise HTTPException(400, f"Montant minimum: {operator['min_amount']} {req.currency}")
    if req.amount > operator.get("max_amount", 10000):
        raise HTTPException(400, f"Montant maximum: {operator['max_amount']} {req.currency}")
    
    # Calculate fee
    fee = round(req.amount * (operator.get("fee_percentage", 0) / 100) + operator.get("fee_fixed", 0), 2)
    
    # Create pending transaction
    tx_id = gen_id()
    await db.transactions.insert_one({
        "id": tx_id,
        "user_id": u["id"],
        "type": "mobile_deposit",
        "amount": req.amount,
        "fee": fee,
        "currency": req.currency,
        "operator_code": req.operator_code.upper(),
        "operator_name": operator["operator_name"],
        "phone_number": req.phone_number,
        "status": "pending",
        "created_at": now_iso()
    })
    
    # Here you would call the actual operator API
    # For now, we create a pending transaction that admin can approve
    
    return {
        "message": "Demande de depot initiee",
        "transaction_id": tx_id,
        "amount": req.amount,
        "fee": fee,
        "total": req.amount + fee,
        "operator": operator["operator_name"],
        "status": "pending",
        "instructions": f"Suivez les instructions de {operator['operator_name']} pour completer le paiement."
    }


@router.post("/mobile-payment/withdraw")
async def mobile_payment_withdraw(req: MobilePaymentWithdrawReq, u=Depends(get_current_user)):
    """Initiate withdrawal to mobile money"""
    operator = await db.mobile_payment_operators.find_one({
        "operator_code": req.operator_code.upper(),
        "is_active": True
    })
    
    if not operator:
        raise HTTPException(404, "Operateur non disponible")
    
    # Check balance
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
    if not wallet or wallet["balance"] < req.amount:
        raise HTTPException(400, "Solde insuffisant")
    
    # Calculate fee
    fee = round(req.amount * (operator.get("fee_percentage", 0) / 100) + operator.get("fee_fixed", 0), 2)
    total = req.amount + fee
    
    if wallet["balance"] < total:
        raise HTTPException(400, f"Solde insuffisant. Total requis: {total} {req.currency} (frais: {fee})")
    
    # Deduct from wallet
    await db.wallets.update_one({"id": wallet["id"]}, {"$inc": {"balance": -total}})
    
    # Create transaction
    tx_id = gen_id()
    await db.transactions.insert_one({
        "id": tx_id,
        "user_id": u["id"],
        "type": "mobile_withdraw",
        "amount": req.amount,
        "fee": fee,
        "currency": req.currency,
        "operator_code": req.operator_code.upper(),
        "operator_name": operator["operator_name"],
        "phone_number": req.phone_number,
        "status": "pending",
        "created_at": now_iso()
    })
    
    return {
        "message": "Demande de retrait initiee",
        "transaction_id": tx_id,
        "amount": req.amount,
        "fee": fee,
        "total": total,
        "operator": operator["operator_name"],
        "status": "pending"
    }


# === SMS API MANAGEMENT ===

@router.get("/admin/sms-providers")
async def get_sms_providers(adm=Depends(get_admin)):
    """Get all configured SMS API providers"""
    providers = await db.sms_providers.find({}, {"_id": 0, "api_secret": 0, "auth_token": 0}).sort([("priority", 1), ("provider_name", 1)]).to_list(50)
    return {"providers": providers}


@router.post("/admin/sms-providers")
async def create_sms_provider(req: SmsApiConfigReq, adm=Depends(get_admin_with_kyc)):
    """Create or update SMS API provider configuration"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut configurer les fournisseurs SMS")
    
    provider_data = {
        "provider_name": req.provider_name,
        "provider_code": req.provider_code.upper(),
        "service_type": req.service_type,
        "api_base_url": req.api_base_url,
        "api_key": req.api_key,
        "api_secret": req.api_secret,
        "sender_id": req.sender_id,
        "auth_token": req.auth_token,
        "account_sid": req.account_sid,
        "countries": [c.upper() for c in req.countries],
        "is_active": req.is_active,
        "is_default": req.is_default,
        "priority": req.priority,
        "cost_per_sms": req.cost_per_sms,
        "currency": req.currency,
        "updated_at": now_iso(),
        "updated_by": adm["id"]
    }
    
    # If setting as default, unset other defaults of same service_type
    if req.is_default:
        await db.sms_providers.update_many(
            {"service_type": req.service_type, "provider_code": {"$ne": req.provider_code.upper()}},
            {"$set": {"is_default": False}}
        )
    
    result = await db.sms_providers.update_one(
        {"provider_code": req.provider_code.upper()},
        {"$set": provider_data, "$setOnInsert": {"id": gen_id(), "created_at": now_iso()}},
        upsert=True
    )
    
    await log_admin_activity(adm, "create" if result.upserted_id else "update", "settings",
                             details={"action": "sms_provider", "provider": req.provider_code})
    
    return {"message": f"Fournisseur SMS {req.provider_name} configure"}


@router.delete("/admin/sms-providers/{provider_code}")
async def delete_sms_provider(provider_code: str, adm=Depends(get_admin_with_kyc)):
    """Delete SMS API provider"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut supprimer les fournisseurs SMS")
    
    result = await db.sms_providers.delete_one({"provider_code": provider_code.upper()})
    if result.deleted_count == 0:
        raise HTTPException(404, "Fournisseur non trouve")
    
    await log_admin_activity(adm, "delete", "settings", details={"action": "sms_provider_delete", "provider": provider_code})
    return {"message": "Fournisseur SMS supprime"}


@router.post("/admin/sms-providers/{provider_code}/test")
async def test_sms_provider(provider_code: str, req: SmsTestReq, adm=Depends(get_admin_with_kyc)):
    """Test SMS provider by sending a test message"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut tester les fournisseurs SMS")
    
    provider = await db.sms_providers.find_one({"provider_code": provider_code.upper()})
    if not provider:
        raise HTTPException(404, "Fournisseur non trouve")
    
    # For internal (WhatsApp), use the WhatsApp service
    if provider.get("service_type") == "internal":
        # Route to WhatsApp
        return {"success": True, "message": "Utiliser le test WhatsApp pour le service interne", "via": "whatsapp"}
    
    # For external APIs, we would call the actual provider
    # This is a placeholder - actual implementation depends on provider
    result = {
        "success": True,
        "message": f"Test SMS envoye via {provider['provider_name']} (simule)",
        "provider": provider["provider_name"],
        "phone": req.phone_number,
        "note": "Integration reelle requiert implementation specifique au fournisseur"
    }
    
    # Log the test
    await db.sms_logs.insert_one({
        "id": gen_id(),
        "provider_code": provider_code.upper(),
        "phone": req.phone_number[:6] + "***",
        "message_preview": req.message[:50] + "..." if len(req.message) > 50 else req.message,
        "status": "test",
        "created_at": now_iso(),
        "created_by": adm["id"]
    })
    
    return result


@router.get("/admin/sms-providers/stats")
async def get_sms_stats(adm=Depends(get_admin)):
    """Get SMS usage statistics"""
    total = await db.sms_logs.count_documents({})
    by_status = await db.sms_logs.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(10)
    by_provider = await db.sms_logs.aggregate([
        {"$group": {"_id": "$provider_code", "count": {"$sum": 1}}}
    ]).to_list(20)
    
    return {
        "total": total,
        "by_status": {s["_id"]: s["count"] for s in by_status},
        "by_provider": {p["_id"]: p["count"] for p in by_provider}
    }


@router.get("/admin/sms-providers/available")
async def get_available_sms_providers(adm=Depends(get_admin)):
    """Get list of available SMS provider templates"""
    return {
        "internal_providers": [
            {
                "code": "WHATSAPP_INTERNAL",
                "name": "WhatsApp (Service Interne)",
                "description": "Utilise le service WhatsApp configure",
                "service_type": "internal",
                "requires": ["session_whatsapp"]
            }
        ],
        "external_providers": [
            {
                "code": "TWILIO",
                "name": "Twilio",
                "description": "Service SMS mondial fiable",
                "service_type": "external",
                "requires": ["account_sid", "auth_token", "sender_id"],
                "api_base_url": "https://api.twilio.com/2010-04-01"
            },
            {
                "code": "NEXMO",
                "name": "Vonage (Nexmo)",
                "description": "API SMS internationale",
                "service_type": "external",
                "requires": ["api_key", "api_secret", "sender_id"],
                "api_base_url": "https://rest.nexmo.com"
            },
            {
                "code": "INFOBIP",
                "name": "Infobip",
                "description": "Plateforme de communication omnicanal",
                "service_type": "external",
                "requires": ["api_key", "api_base_url", "sender_id"],
                "api_base_url": "https://api.infobip.com"
            },
            {
                "code": "ORANGE_SMS",
                "name": "Orange SMS API",
                "description": "API SMS Orange pour l'Afrique",
                "service_type": "external",
                "requires": ["api_key", "api_secret", "sender_id"],
                "api_base_url": "https://api.orange.com/smsmessaging"
            },
            {
                "code": "AFRICASTALKING",
                "name": "Africa's Talking",
                "description": "SMS API specialise Afrique",
                "service_type": "external",
                "requires": ["api_key", "sender_id"],
                "api_base_url": "https://api.africastalking.com"
            },
            {
                "code": "CUSTOM",
                "name": "API Personnalisee",
                "description": "Configurez votre propre API SMS",
                "service_type": "external",
                "requires": ["api_base_url", "api_key"]
            }
        ]
    }


# === SMTP EMAIL CONNECTIONS MANAGEMENT ===
# Multiple SMTP servers can be configured, each assigned to one or more
# countries/states, or flagged "for all states" as a fallback connection.
# When an OTP or password-reset email is sent, the country-specific
# connection is tried first, falling back to the "all states" one if the
# country connection is unavailable/unconfigured.

@router.get("/admin/smtp-configs")
async def get_smtp_configs(adm=Depends(get_admin)):
    """Get all configured SMTP connections"""
    configs = await db.smtp_configs.find({}, {"_id": 0, "password": 0}).sort([("priority", 1), ("provider_name", 1)]).to_list(50)
    return {"configs": configs}


@router.post("/admin/smtp-configs")
async def create_smtp_config(req: SmtpConfigReq, adm=Depends(get_admin_with_kyc)):
    """Create or update an SMTP connection configuration"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut configurer les connexions SMTP")
    
    provider_code = req.provider_code.upper()
    existing = await db.smtp_configs.find_one({"provider_code": provider_code})
    
    config_data = {
        "provider_name": req.provider_name,
        "provider_code": provider_code,
        "host": req.host,
        "port": req.port,
        "username": req.username,
        "from_email": req.from_email,
        "from_name": req.from_name,
        "use_tls": req.use_tls,
        # "Pour tous les etats" clears the country list so this connection
        # is used as the universal fallback when other connections fail.
        "countries": [] if req.is_all_states else [c.upper() for c in req.countries],
        "is_all_states": req.is_all_states,
        "is_active": req.is_active,
        "is_default": req.is_default,
        "priority": req.priority,
        "updated_at": now_iso(),
        "updated_by": adm["id"]
    }
    # Keep the existing password if a blank one was submitted (edit mode)
    if req.password:
        config_data["password"] = req.password
    elif not existing:
        raise HTTPException(400, "Le mot de passe est requis pour une nouvelle connexion")
    
    if req.is_default:
        await db.smtp_configs.update_many(
            {"provider_code": {"$ne": provider_code}},
            {"$set": {"is_default": False}}
        )
    
    result = await db.smtp_configs.update_one(
        {"provider_code": provider_code},
        {"$set": config_data, "$setOnInsert": {"id": gen_id(), "created_at": now_iso()}},
        upsert=True
    )
    
    await log_admin_activity(adm, "create" if result.upserted_id else "update", "settings",
                             details={"action": "smtp_config", "provider": provider_code})
    
    return {"message": f"Connexion SMTP {req.provider_name} configuree"}


@router.delete("/admin/smtp-configs/{provider_code}")
async def delete_smtp_config(provider_code: str, adm=Depends(get_admin_with_kyc)):
    """Delete an SMTP connection"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut supprimer les connexions SMTP")
    
    result = await db.smtp_configs.delete_one({"provider_code": provider_code.upper()})
    if result.deleted_count == 0:
        raise HTTPException(404, "Connexion non trouvee")
    
    await log_admin_activity(adm, "delete", "settings", details={"action": "smtp_config_delete", "provider": provider_code})
    return {"message": "Connexion SMTP supprimee"}


@router.post("/admin/smtp-configs/{provider_code}/test")
async def test_smtp_config(provider_code: str, req: SmtpTestReq, adm=Depends(get_admin_with_kyc)):
    """Send a real test email through a specific SMTP connection"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut tester les connexions SMTP")
    
    config = await db.smtp_configs.find_one({"provider_code": provider_code.upper()})
    if not config:
        raise HTTPException(404, "Connexion non trouvee")
    
    from utils.email import _send_via_config
    subject = "Monity World - Test de connexion SMTP"
    body = req.message or "Ceci est un message de test de votre connexion SMTP Monity World."
    try:
        _send_via_config(config, req.to_email, subject, body)
    except Exception as e:
        await db.smtp_configs.update_one({"provider_code": provider_code.upper()}, {"$set": {"last_status": "failed", "last_error": str(e), "last_used_at": now_iso()}})
        raise HTTPException(400, f"Echec de l'envoi: {e}")
    
    await db.smtp_configs.update_one({"provider_code": provider_code.upper()}, {"$set": {"last_status": "success", "last_used_at": now_iso()}})
    return {"message": f"Email de test envoye a {req.to_email} via {config['provider_name']}"}


