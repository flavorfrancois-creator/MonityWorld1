"""
Monity World - Payments Routes
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
from models.schemas import PaymentLinkReq, PaymentLinkPayReq, EcommerceLinkCreateReq, EcommerceLinkPayReq, EcommerceLinkSendReq, ApiKeyCreateReq, ApiKeyUpdateReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=['Payments'])

# === PAYMENT LINKS ===
@router.get("/payment-links")
async def get_payment_links(u=Depends(get_current_user)):
    return await db.payment_links.find({"user_id": u["id"]}, {"_id": 0, "password_hash": 0}).to_list(50)

@router.post("/payment-links")
async def create_payment_link(req: PaymentLinkReq, u=Depends(get_current_user)):
    link_code = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=req.expires_hours)).isoformat()
    
    doc = {
        "id": gen_id(),
        "user_id": u["id"],
        "creator_name": u["name"],
        "link_code": link_code,
        "amount": req.amount,
        "currency": req.currency.upper(),
        "description": req.description,
        "password_hash": hash_pw(req.password),
        "status": "active",
        "expires_at": expires_at,
        "paid_by": None,
        "paid_at": None,
        "created_at": now_iso()
    }
    await db.payment_links.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return {"link": doc, "payment_url": f"/pay/{link_code}"}

@router.get("/payment-links/public/{link_code}")
async def get_payment_link_public(link_code: str):
    link = await db.payment_links.find_one({"link_code": link_code}, {"_id": 0, "password_hash": 0})
    if not link:
        raise HTTPException(404, "Lien de paiement non trouvé")
    if link["status"] != "active":
        raise HTTPException(400, f"Ce lien est {link['status']}")
    if datetime.fromisoformat(link["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
        raise HTTPException(400, "Ce lien a expiré")
    return link

@router.post("/payment-links/{link_code}/pay")
async def pay_payment_link(link_code: str, req: PaymentLinkPayReq, u=Depends(get_current_user)):
    link = await db.payment_links.find_one({"link_code": link_code})
    if not link:
        raise HTTPException(404, "Lien de paiement non trouvé")
    if link["status"] != "active":
        raise HTTPException(400, f"Ce lien est {link['status']}")
    if datetime.fromisoformat(link["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
        raise HTTPException(400, "Ce lien a expiré")
    if not verify_pw(req.password, link["password_hash"]):
        raise HTTPException(401, "Mot de passe incorrect")
    if link["user_id"] == u["id"]:
        raise HTTPException(400, "Vous ne pouvez pas payer votre propre lien")
    
    # Process payment
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": link["currency"]})
    if not wallet or wallet["balance"] < link["amount"]:
        raise HTTPException(400, "Solde insuffisant")
    
    fee = round(link["amount"] * 0.01, 2)
    total = link["amount"] + fee
    
    if wallet["balance"] < total:
        raise HTTPException(400, "Solde insuffisant (frais inclus)")
    
    n = now_iso()
    
    # Deduct from payer
    await db.wallets.update_one({"user_id": u["id"], "currency": link["currency"]}, {"$inc": {"balance": -total}})
    
    # Credit receiver
    receiver_wallet = await db.wallets.find_one({"user_id": link["user_id"], "currency": link["currency"]})
    if receiver_wallet:
        await db.wallets.update_one({"user_id": link["user_id"], "currency": link["currency"]}, {"$inc": {"balance": link["amount"]}})
    else:
        await db.wallets.insert_one({"id": gen_id(), "user_id": link["user_id"], "currency": link["currency"], "balance": link["amount"], "is_primary": False, "created_at": n})
    
    # Update link status
    await db.payment_links.update_one({"link_code": link_code}, {"$set": {"status": "paid", "paid_by": u["id"], "paid_at": n}})
    
    # Create transaction record
    tx_id = gen_id()
    receiver = await db.users.find_one({"id": link["user_id"]})
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": u["id"], "sender_name": u["name"], "sender_phone": u["phone"],
        "receiver_id": link["user_id"], "receiver_name": receiver["name"] if receiver else link["creator_name"],
        "receiver_phone": receiver["phone"] if receiver else None,
        "amount": link["amount"], "fee": fee, "currency": link["currency"], "type": "payment_link",
        "status": "completed", "description": link["description"],
        "created_at": n, "completed_at": n
    })
    
    return {"message": "Paiement effectué", "transaction_id": tx_id, "amount": link["amount"], "fee": fee}

@router.delete("/payment-links/{link_id}")
async def delete_payment_link(link_id: str, u=Depends(get_current_user)):
    link = await db.payment_links.find_one({"id": link_id, "user_id": u["id"]})
    if not link:
        raise HTTPException(404, "Lien non trouvé")
    await db.payment_links.delete_one({"id": link_id})
    return {"message": "Lien supprimé"}


# === E-COMMERCE PAYMENT LINKS (ADVANCED) ===
def gen_ecommerce_link_code():
    """Generate a unique e-commerce link code"""
    return 'ECM' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))


@router.get("/ecommerce-links")
async def get_ecommerce_links(u=Depends(get_current_user)):
    """Get all e-commerce payment links created by the user"""
    links = await db.ecommerce_links.find(
        {"user_id": u["id"]}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"links": links}


@router.post("/ecommerce-links")
async def create_ecommerce_link(req: EcommerceLinkCreateReq, u=Depends(get_current_user)):
    """Create an e-commerce payment link for receiving or sending money"""
    if req.link_type not in ["receive", "send"]:
        raise HTTPException(400, "Type de lien invalide. Utilisez 'receive' ou 'send'")
    
    # For temporary links, amount is required
    if not req.is_permanent and (req.fixed_amount is None or req.fixed_amount <= 0):
        raise HTTPException(400, "Le montant est requis pour les liens temporaires")
    
    # For permanent links, amount must be null or 0
    if req.is_permanent and req.fixed_amount and req.fixed_amount > 0:
        raise HTTPException(400, "Les liens permanents ne doivent pas avoir de montant fixe")
    
    link_code = gen_ecommerce_link_code()
    n = now_iso()
    
    # Permanent links don't expire, temporary links expire in 24 hours
    expires_at = None
    if not req.is_permanent:
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    
    doc = {
        "id": gen_id(),
        "user_id": u["id"],
        "creator_name": u["name"],
        "creator_phone": u["phone"],
        "link_code": link_code,
        "link_type": req.link_type,  # "receive" or "send"
        "is_permanent": req.is_permanent,
        "fixed_amount": req.fixed_amount if not req.is_permanent else None,
        "currency": req.currency.upper(),
        "description": req.description,
        "status": "active",
        "expires_at": expires_at,
        "total_transactions": 0,
        "total_volume": 0.0,
        "created_at": n
    }
    
    await db.ecommerce_links.insert_one(doc)
    doc.pop("_id", None)
    
    # Generate the full URL path
    link_path = f"/ecommerce/{link_code}"
    
    return {
        "message": "Lien e-commerce créé avec succès",
        "link": doc,
        "link_url": link_path,
        "instructions": {
            "temporary": "Ce lien expire dans 24 heures. Le site e-commerce doit fournir le numéro de téléphone de l'expéditeur.",
            "permanent": "Ce lien n'expire pas. Le site doit fournir le montant et le numéro de téléphone."
        } if not req.is_permanent else {
            "permanent": "Ce lien n'expire pas. Le site doit fournir le montant et le numéro de téléphone à chaque transaction."
        }
    }


@router.get("/ecommerce-links/public/{link_code}")
async def get_ecommerce_link_public(link_code: str):
    """Get public info about an e-commerce link (for external sites)"""
    link = await db.ecommerce_links.find_one({"link_code": link_code}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Lien e-commerce non trouvé")
    
    if link["status"] != "active":
        raise HTTPException(400, f"Ce lien est {link['status']}")
    
    # Check expiration for temporary links
    if link["expires_at"]:
        if datetime.fromisoformat(link["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
            raise HTTPException(400, "Ce lien a expiré")
    
    return {
        "link_code": link["link_code"],
        "link_type": link["link_type"],
        "is_permanent": link["is_permanent"],
        "fixed_amount": link["fixed_amount"],
        "currency": link["currency"],
        "description": link["description"],
        "creator_name": link["creator_name"],
        "requires_sender_phone": True,  # Always required
        "requires_amount": link["is_permanent"],  # Only for permanent links
        "requires_receiver_phone": link["link_type"] == "send"  # Only for send links
    }


@router.post("/ecommerce-links/{link_code}/request-code")
async def request_validation_code(link_code: str, sender_phone: str):
    """Request a validation code for an e-commerce payment (sent to sender's Monity account)"""
    link = await db.ecommerce_links.find_one({"link_code": link_code})
    if not link:
        raise HTTPException(404, "Lien e-commerce non trouvé")
    
    if link["status"] != "active":
        raise HTTPException(400, f"Ce lien est {link['status']}")
    
    # Check expiration
    if link["expires_at"]:
        if datetime.fromisoformat(link["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
            raise HTTPException(400, "Ce lien a expiré")
    
    # Find the sender's account
    sender = await db.users.find_one({"phone": sender_phone})
    if not sender:
        raise HTTPException(404, "Ce numéro de téléphone n'est pas enregistré sur Monity. L'utilisateur doit d'abord créer un compte.")
    
    # Generate validation code
    validation_code = gen_otp()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    
    # Store the validation code
    await db.ecommerce_validations.insert_one({
        "id": gen_id(),
        "link_code": link_code,
        "user_id": sender["id"],
        "user_phone": sender_phone,
        "code": validation_code,
        "expires_at": expires_at,
        "used": False,
        "created_at": now_iso()
    })
    
    # Send notification to user's Monity account
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": sender["id"],
        "message": f"Code de validation pour paiement e-commerce: {validation_code} (valide 10 min)",
        "type": "ecommerce_validation",
        "data": {
            "link_code": link_code,
            "validation_code": validation_code,
            "description": link["description"],
            "amount": link["fixed_amount"],
            "currency": link["currency"]
        },
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {
        "message": "Code de validation envoyé dans le compte Monity de l'utilisateur",
        "expires_in_minutes": 10,
        "user_phone": sender_phone[:6] + "****"  # Masked phone
    }


@router.post("/ecommerce-links/{link_code}/receive")
async def pay_via_ecommerce_link(link_code: str, req: EcommerceLinkPayReq):
    """Process payment via e-commerce link (sender pays to link creator)"""
    link = await db.ecommerce_links.find_one({"link_code": link_code})
    if not link:
        raise HTTPException(404, "Lien e-commerce non trouvé")
    
    if link["status"] != "active":
        raise HTTPException(400, f"Ce lien est {link['status']}")
    
    if link["link_type"] != "receive":
        raise HTTPException(400, "Ce lien n'est pas un lien de réception")
    
    # Check expiration
    if link["expires_at"]:
        if datetime.fromisoformat(link["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
            raise HTTPException(400, "Ce lien a expiré")
    
    # Find sender account
    sender = await db.users.find_one({"phone": req.sender_phone})
    if not sender:
        raise HTTPException(404, "Compte expéditeur non trouvé")
    
    # Validate the code
    validation = await db.ecommerce_validations.find_one({
        "link_code": link_code,
        "user_phone": req.sender_phone,
        "code": req.validation_code,
        "used": False
    })
    
    if not validation:
        raise HTTPException(401, "Code de validation invalide ou expiré")
    
    if datetime.fromisoformat(validation["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
        raise HTTPException(401, "Code de validation expiré")
    
    # Determine amount
    if link["is_permanent"]:
        if not req.amount or req.amount <= 0:
            raise HTTPException(400, "Le montant est requis pour les liens permanents")
        amount = req.amount
    else:
        amount = link["fixed_amount"]
    
    # Check sender balance
    wallet = await db.wallets.find_one({"user_id": sender["id"], "currency": link["currency"]})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(400, f"Solde insuffisant. Disponible: {wallet['balance'] if wallet else 0} {link['currency']}")
    
    # Calculate fee (1% for e-commerce)
    fee = round(amount * 0.01, 2)
    total = amount + fee
    
    if wallet["balance"] < total:
        raise HTTPException(400, "Solde insuffisant (frais inclus)")
    
    n = now_iso()
    
    # Mark validation as used
    await db.ecommerce_validations.update_one({"id": validation["id"]}, {"$set": {"used": True, "used_at": n}})
    
    # Deduct from sender
    await db.wallets.update_one({"user_id": sender["id"], "currency": link["currency"]}, {"$inc": {"balance": -total}})
    
    # Credit link creator
    receiver_wallet = await db.wallets.find_one({"user_id": link["user_id"], "currency": link["currency"]})
    if receiver_wallet:
        await db.wallets.update_one({"user_id": link["user_id"], "currency": link["currency"]}, {"$inc": {"balance": amount}})
    else:
        await db.wallets.insert_one({
            "id": gen_id(), "user_id": link["user_id"], "currency": link["currency"],
            "balance": amount, "is_primary": False, "created_at": n
        })
    
    # Update link stats
    await db.ecommerce_links.update_one(
        {"link_code": link_code},
        {"$inc": {"total_transactions": 1, "total_volume": amount}}
    )
    
    # Create transaction record
    tx_id = gen_id()
    receiver = await db.users.find_one({"id": link["user_id"]})
    
    await db.transactions.insert_one({
        "id": tx_id,
        "sender_id": sender["id"],
        "sender_name": sender["name"],
        "sender_phone": sender["phone"],
        "sender_country": sender.get("country", "CD"),
        "receiver_id": link["user_id"],
        "receiver_name": receiver["name"] if receiver else link["creator_name"],
        "receiver_phone": receiver["phone"] if receiver else link["creator_phone"],
        "receiver_country": receiver.get("country", "CD") if receiver else "CD",
        "amount": amount,
        "fee": fee,
        "currency": link["currency"],
        "type": "ecommerce_receive",
        "status": "completed",
        "description": f"Paiement e-commerce: {link['description']}",
        "ecommerce_link_code": link_code,
        "created_at": n,
        "completed_at": n
    })
    
    # Notify both parties
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": sender["id"],
        "message": f"Paiement e-commerce de {amount} {link['currency']} effectué vers {link['creator_name']}",
        "type": "ecommerce_payment_sent",
        "is_read": False,
        "created_at": n
    })
    
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": link["user_id"],
        "message": f"Paiement e-commerce de {amount} {link['currency']} reçu de {sender['name']}",
        "type": "ecommerce_payment_received",
        "is_read": False,
        "created_at": n
    })
    
    return {
        "message": "Paiement effectué avec succès",
        "transaction_id": tx_id,
        "amount": amount,
        "fee": fee,
        "total_debited": total,
        "currency": link["currency"],
        "receiver_name": link["creator_name"]
    }


@router.post("/ecommerce-links/{link_code}/send")
async def send_via_ecommerce_link(link_code: str, req: EcommerceLinkSendReq):
    """Process sending via e-commerce link (link creator sends to a beneficiary)"""
    link = await db.ecommerce_links.find_one({"link_code": link_code})
    if not link:
        raise HTTPException(404, "Lien e-commerce non trouvé")
    
    if link["status"] != "active":
        raise HTTPException(400, f"Ce lien est {link['status']}")
    
    if link["link_type"] != "send":
        raise HTTPException(400, "Ce lien n'est pas un lien d'envoi")
    
    # Check expiration
    if link["expires_at"]:
        if datetime.fromisoformat(link["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
            raise HTTPException(400, "Ce lien a expiré")
    
    # Find sender (link creator)
    sender = await db.users.find_one({"id": link["user_id"]})
    if not sender:
        raise HTTPException(500, "Compte créateur du lien non trouvé")
    
    # Find receiver
    receiver = await db.users.find_one({"phone": req.receiver_phone})
    if not receiver:
        raise HTTPException(404, "Ce numéro de bénéficiaire n'est pas enregistré sur Monity")
    
    # Validate the code (code is sent to the link creator, i.e., the sender)
    validation = await db.ecommerce_validations.find_one({
        "link_code": link_code,
        "user_phone": sender["phone"],
        "code": req.validation_code,
        "used": False
    })
    
    if not validation:
        raise HTTPException(401, "Code de validation invalide ou expiré")
    
    if datetime.fromisoformat(validation["expires_at"].replace('Z', '+00:00')) < datetime.now(timezone.utc):
        raise HTTPException(401, "Code de validation expiré")
    
    # Determine amount
    if link["is_permanent"]:
        if not req.amount or req.amount <= 0:
            raise HTTPException(400, "Le montant est requis pour les liens permanents")
        amount = req.amount
    else:
        amount = link["fixed_amount"]
    
    # Check sender balance
    wallet = await db.wallets.find_one({"user_id": sender["id"], "currency": link["currency"]})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(400, f"Solde insuffisant. Disponible: {wallet['balance'] if wallet else 0} {link['currency']}")
    
    # Calculate fee
    fee = round(amount * 0.01, 2)
    total = amount + fee
    
    if wallet["balance"] < total:
        raise HTTPException(400, "Solde insuffisant (frais inclus)")
    
    n = now_iso()
    
    # Mark validation as used
    await db.ecommerce_validations.update_one({"id": validation["id"]}, {"$set": {"used": True, "used_at": n}})
    
    # Deduct from sender
    await db.wallets.update_one({"user_id": sender["id"], "currency": link["currency"]}, {"$inc": {"balance": -total}})
    
    # Credit receiver
    receiver_wallet = await db.wallets.find_one({"user_id": receiver["id"], "currency": link["currency"]})
    if receiver_wallet:
        await db.wallets.update_one({"user_id": receiver["id"], "currency": link["currency"]}, {"$inc": {"balance": amount}})
    else:
        await db.wallets.insert_one({
            "id": gen_id(), "user_id": receiver["id"], "currency": link["currency"],
            "balance": amount, "is_primary": False, "created_at": n
        })
    
    # Update link stats
    await db.ecommerce_links.update_one(
        {"link_code": link_code},
        {"$inc": {"total_transactions": 1, "total_volume": amount}}
    )
    
    # Create transaction record
    tx_id = gen_id()
    
    await db.transactions.insert_one({
        "id": tx_id,
        "sender_id": sender["id"],
        "sender_name": sender["name"],
        "sender_phone": sender["phone"],
        "sender_country": sender.get("country", "CD"),
        "receiver_id": receiver["id"],
        "receiver_name": receiver["name"],
        "receiver_phone": receiver["phone"],
        "receiver_country": receiver.get("country", "CD"),
        "amount": amount,
        "fee": fee,
        "currency": link["currency"],
        "type": "ecommerce_send",
        "status": "completed",
        "description": f"Envoi e-commerce: {link['description']}",
        "ecommerce_link_code": link_code,
        "created_at": n,
        "completed_at": n
    })
    
    # Notify both parties
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": sender["id"],
        "message": f"Envoi e-commerce de {amount} {link['currency']} effectué vers {receiver['name']}",
        "type": "ecommerce_send_completed",
        "is_read": False,
        "created_at": n
    })
    
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": receiver["id"],
        "message": f"Vous avez reçu {amount} {link['currency']} de {sender['name']} via lien e-commerce",
        "type": "ecommerce_received",
        "is_read": False,
        "created_at": n
    })
    
    return {
        "message": "Envoi effectué avec succès",
        "transaction_id": tx_id,
        "amount": amount,
        "fee": fee,
        "total_debited": total,
        "currency": link["currency"],
        "receiver_name": receiver["name"]
    }


@router.delete("/ecommerce-links/{link_id}")
async def delete_ecommerce_link(link_id: str, u=Depends(get_current_user)):
    """Delete an e-commerce payment link"""
    link = await db.ecommerce_links.find_one({"id": link_id, "user_id": u["id"]})
    if not link:
        raise HTTPException(404, "Lien non trouvé")
    await db.ecommerce_links.delete_one({"id": link_id})
    return {"message": "Lien e-commerce supprimé"}


@router.patch("/ecommerce-links/{link_id}/deactivate")
async def deactivate_ecommerce_link(link_id: str, u=Depends(get_current_user)):
    """Deactivate an e-commerce payment link"""
    link = await db.ecommerce_links.find_one({"id": link_id, "user_id": u["id"]})
    if not link:
        raise HTTPException(404, "Lien non trouvé")
    await db.ecommerce_links.update_one({"id": link_id}, {"$set": {"status": "deactivated"}})
    return {"message": "Lien e-commerce désactivé"}


@router.patch("/ecommerce-links/{link_id}/reactivate")
async def reactivate_ecommerce_link(link_id: str, u=Depends(get_current_user)):
    """Reactivate an e-commerce payment link"""
    link = await db.ecommerce_links.find_one({"id": link_id, "user_id": u["id"]})
    if not link:
        raise HTTPException(404, "Lien non trouvé")
    await db.ecommerce_links.update_one({"id": link_id}, {"$set": {"status": "active"}})
    return {"message": "Lien e-commerce réactivé"}


@router.get("/ecommerce-links/{link_id}/transactions")
async def get_ecommerce_link_transactions(link_id: str, page: int = 1, limit: int = 20, u=Depends(get_current_user)):
    """Get transactions for a specific e-commerce link"""
    link = await db.ecommerce_links.find_one({"id": link_id, "user_id": u["id"]})
    if not link:
        raise HTTPException(404, "Lien non trouvé")
    
    skip = (page - 1) * limit
    total = await db.transactions.count_documents({"ecommerce_link_code": link["link_code"]})
    transactions = await db.transactions.find(
        {"ecommerce_link_code": link["link_code"]},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {"transactions": transactions, "total": total, "page": page}


# === E-COMMERCE API KEYS ===

def generate_api_key():
    """Generate a unique API key"""
    return f"mk_live_{secrets.token_hex(24)}"


def generate_api_secret():
    """Generate API secret"""
    return f"sk_live_{secrets.token_hex(32)}"


@router.get("/api-keys")
async def get_user_api_keys(u=Depends(get_current_user)):
    """Get user's API keys"""
    keys = await db.api_keys.find(
        {"user_id": u["id"]}, 
        {"_id": 0, "api_secret": 0}  # Don't return secret in list
    ).sort("created_at", -1).to_list(20)
    return {"api_keys": keys}


@router.post("/api-keys")
async def create_api_key(req: ApiKeyCreateReq, u=Depends(get_current_user)):
    """Create a new API key for e-commerce integration"""
    # Check limit (max 5 keys per user)
    existing_count = await db.api_keys.count_documents({"user_id": u["id"]})
    if existing_count >= 5:
        raise HTTPException(400, "Limite de 5 clés API atteinte")
    
    api_key = generate_api_key()
    api_secret = generate_api_secret()
    
    doc = {
        "id": gen_id(),
        "user_id": u["id"],
        "name": req.name,
        "api_key": api_key,
        "api_secret": api_secret,  # Stored hashed in production
        "website_url": req.website_url,
        "allowed_ips": req.allowed_ips,
        "permissions": req.permissions,
        "daily_limit": req.daily_limit,
        "webhook_url": req.webhook_url,
        "is_active": True,
        "total_transactions": 0,
        "total_volume": 0.0,
        "last_used": None,
        "created_at": now_iso()
    }
    
    await db.api_keys.insert_one(doc)
    
    # Return the secret only once at creation
    return {
        "message": "Cle API creee avec succes",
        "api_key": {
            "id": doc["id"],
            "name": doc["name"],
            "api_key": api_key,
            "api_secret": api_secret,  # Only shown once!
            "permissions": doc["permissions"],
            "created_at": doc["created_at"]
        },
        "warning": "IMPORTANT: Sauvegardez votre cle secrete (api_secret) maintenant. Elle ne sera plus affichee."
    }


@router.get("/api-keys/{key_id}")
async def get_api_key_details(key_id: str, u=Depends(get_current_user)):
    """Get API key details (without secret)"""
    key = await db.api_keys.find_one({"id": key_id, "user_id": u["id"]}, {"_id": 0, "api_secret": 0})
    if not key:
        raise HTTPException(404, "Cle API non trouvee")
    return key


@router.patch("/api-keys/{key_id}")
async def update_api_key(key_id: str, req: ApiKeyUpdateReq, u=Depends(get_current_user)):
    """Update API key settings"""
    key = await db.api_keys.find_one({"id": key_id, "user_id": u["id"]})
    if not key:
        raise HTTPException(404, "Cle API non trouvee")
    
    update = {"updated_at": now_iso()}
    if req.name is not None:
        update["name"] = req.name
    if req.website_url is not None:
        update["website_url"] = req.website_url
    if req.allowed_ips is not None:
        update["allowed_ips"] = req.allowed_ips
    if req.permissions is not None:
        update["permissions"] = req.permissions
    if req.daily_limit is not None:
        update["daily_limit"] = req.daily_limit
    if req.webhook_url is not None:
        update["webhook_url"] = req.webhook_url
    if req.is_active is not None:
        update["is_active"] = req.is_active
    
    await db.api_keys.update_one({"id": key_id}, {"$set": update})
    return {"message": "Cle API mise a jour"}


@router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: str, u=Depends(get_current_user)):
    """Delete an API key"""
    result = await db.api_keys.delete_one({"id": key_id, "user_id": u["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Cle API non trouvee")
    return {"message": "Cle API supprimee"}


@router.post("/api-keys/{key_id}/regenerate-secret")
async def regenerate_api_secret(key_id: str, u=Depends(get_current_user)):
    """Regenerate API secret (invalidates the old one)"""
    key = await db.api_keys.find_one({"id": key_id, "user_id": u["id"]})
    if not key:
        raise HTTPException(404, "Cle API non trouvee")
    
    new_secret = generate_api_secret()
    await db.api_keys.update_one(
        {"id": key_id},
        {"$set": {"api_secret": new_secret, "updated_at": now_iso()}}
    )
    
    return {
        "message": "Nouvelle cle secrete generee",
        "api_secret": new_secret,
        "warning": "IMPORTANT: Sauvegardez votre nouvelle cle secrete maintenant. Elle ne sera plus affichee."
    }


@router.get("/api-keys/{key_id}/stats")
async def get_api_key_stats(key_id: str, u=Depends(get_current_user)):
    """Get usage statistics for an API key"""
    key = await db.api_keys.find_one({"id": key_id, "user_id": u["id"]})
    if not key:
        raise HTTPException(404, "Cle API non trouvee")
    
    # Get transaction stats
    transactions = await db.transactions.find(
        {"api_key_id": key_id}
    ).to_list(1000)
    
    total_received = sum(t.get("amount", 0) for t in transactions if t.get("type") == "api_payment" and t.get("status") == "completed")
    total_count = len([t for t in transactions if t.get("status") == "completed"])
    
    # Daily stats (last 7 days)
    from datetime import timedelta
    daily_stats = []
    for i in range(7):
        day = datetime.now(timezone.utc) - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        day_txs = [t for t in transactions if t.get("created_at", "").startswith(day_str)]
        daily_stats.append({
            "date": day_str,
            "count": len(day_txs),
            "volume": sum(t.get("amount", 0) for t in day_txs if t.get("status") == "completed")
        })
    
    return {
        "api_key_id": key_id,
        "total_transactions": total_count,
        "total_volume": round(total_received, 2),
        "daily_stats": list(reversed(daily_stats)),
        "last_used": key.get("last_used")
    }


# Public API endpoint for external integrations
@router.post("/public/api/v1/payments/create")
async def create_payment_via_api(
    amount: float,
    currency: str = "USD",
    description: str = "",
    reference: str = None,
    callback_url: str = None,
    api_key: str = None,
    api_secret: str = None
):
    """
    Public API endpoint for creating payments from external websites.
    Requires valid API key and secret.
    """
    if not api_key or not api_secret:
        raise HTTPException(401, "API key et secret requis")
    
    # Validate API key
    key_doc = await db.api_keys.find_one({"api_key": api_key, "is_active": True})
    if not key_doc:
        raise HTTPException(401, "Cle API invalide ou desactivee")
    
    if key_doc.get("api_secret") != api_secret:
        raise HTTPException(401, "Secret API invalide")
    
    # Check permissions
    if "payments.receive" not in key_doc.get("permissions", []):
        raise HTTPException(403, "Permission payments.receive requise")
    
    # Check daily limit
    if key_doc.get("daily_limit"):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        today_volume = await db.transactions.aggregate([
            {"$match": {"api_key_id": key_doc["id"], "created_at": {"$regex": f"^{today}"}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        current_volume = today_volume[0]["total"] if today_volume else 0
        if current_volume + amount > key_doc["daily_limit"]:
            raise HTTPException(400, f"Limite journaliere atteinte ({key_doc['daily_limit']} {currency})")
    
    # Create payment request
    payment_id = gen_id()
    payment_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
    
    payment_doc = {
        "id": payment_id,
        "payment_code": payment_code,
        "api_key_id": key_doc["id"],
        "user_id": key_doc["user_id"],
        "amount": amount,
        "currency": currency.upper(),
        "description": description,
        "reference": reference,
        "callback_url": callback_url or key_doc.get("webhook_url"),
        "status": "pending",
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    }
    
    await db.api_payments.insert_one(payment_doc)
    
    # Update last used
    await db.api_keys.update_one({"id": key_doc["id"]}, {"$set": {"last_used": now_iso()}})
    
    # Generate payment URL
    # This URL should be your frontend payment page
    payment_url = f"/api-payment/{payment_code}"
    
    return {
        "success": True,
        "payment": {
            "id": payment_id,
            "payment_code": payment_code,
            "amount": amount,
            "currency": currency.upper(),
            "status": "pending",
            "payment_url": payment_url,
            "expires_at": payment_doc["expires_at"]
        }
    }


@router.get("/public/api/v1/payments/{payment_code}/status")
async def get_payment_status_api(payment_code: str, api_key: str = None):
    """Get payment status via API"""
    payment = await db.api_payments.find_one({"payment_code": payment_code}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Paiement non trouve")
    
    return {
        "payment_code": payment_code,
        "amount": payment.get("amount"),
        "currency": payment.get("currency"),
        "status": payment.get("status"),
        "reference": payment.get("reference"),
        "paid_at": payment.get("paid_at"),
        "created_at": payment.get("created_at")
    }


