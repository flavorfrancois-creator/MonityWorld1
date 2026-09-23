"""
Monity World - Partner Routes
Extracted from server.py during refactoring
"""
import os
import logging
import random
import string
import secrets
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional, List
from fastapi import APIRouter, Body, HTTPException, Depends, Query, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt, JWTError
from database import (
    db, get_current_user, get_admin, get_admin_with_kyc,
    gen_id, now_iso, hash_pw, verify_pw, create_token, gen_otp,
    gen_account, gen_ref, gen_barcode, gen_nfc_code, gen_printed_card_number,
    gen_reset_token, NON_CLIENT_ROLES, security, JWT_SECRET, JWT_ALGORITHM
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
from models.schemas import LoginReq, NFCCardLimitsReq, PartnerClientRechargeReq, PartnerClientWithdrawReq, PartnerCreateReq, PartnerNFCRechargeReq, PartnerNFCWithdrawReq, PartnerRatesReq, PartnerTopupReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=['Partner'])

# === PARTNER SYSTEM ===
# Models







# NFC Standalone Card Types
NFC_CARD_TYPES = {
    "basic": {
        "name": "Basic",
        "name_fr": "Basique",
        "description": "Carte NFC basique avec limites standard",
        "color": "#6B7280"  # Gray
    },
    "standard": {
        "name": "Standard", 
        "name_fr": "Standard",
        "description": "Carte NFC standard avec limites moyennes",
        "color": "#3B82F6"  # Blue
    },
    "premium": {
        "name": "Premium",
        "name_fr": "Premium", 
        "description": "Carte NFC premium avec limites élevées",
        "color": "#F59E0B"  # Gold
    }
}



# Helper to get current partner
async def get_partner(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        partner = await db.partners.find_one({"id": payload["sub"], "status": "approved"}, {"_id": 0})
        if not partner:
            raise HTTPException(401, "Partenaire non trouvé ou non approuvé")
        return partner
    except JWTError:
        raise HTTPException(401, "Token invalide")


# Helper to get manager
async def get_manager(user=Depends(get_current_user)):
    if user.get("role") not in ["admin", "manager"]:
        raise HTTPException(403, "Accès réservé aux gestionnaires")
    return user


# Get partner rates for a country and transaction type
async def get_partner_rates(country_code: str, tx_type: str = "client_recharge") -> dict:
    """Get partner rates for a country and transaction type"""
    rates = await db.partner_rates.find_one({"country_code": country_code.upper()})
    if not rates:
        rates = await db.partner_rates.find_one({"country_code": "ALL"})
    
    # Default rates by transaction type
    default_rates = {
        "client_recharge": {"partner_commission": 2.0, "client_fee": 1.0},
        "client_withdraw": {"partner_commission": 2.0, "client_fee": 1.5},
        "nfc_recharge": {"partner_commission": 1.5, "client_fee": 0.5},
        "nfc_withdraw": {"partner_commission": 1.5, "client_fee": 0.5}
    }
    
    if not rates:
        return default_rates.get(tx_type, default_rates["client_recharge"])
    
    # Get rates for specific transaction type
    commission_key = f"{tx_type}_partner_commission"
    fee_key = f"{tx_type}_client_fee"
    
    return {
        "partner_commission": rates.get(commission_key, default_rates[tx_type]["partner_commission"]),
        "client_fee": rates.get(fee_key, default_rates[tx_type]["client_fee"])
    }


# Get NFC card limits for a country/currency/type
async def get_nfc_card_limits(country_code: str, currency: str, card_type: str) -> dict:
    """Get NFC card limits for a specific card type, country and currency"""
    limits = await db.nfc_card_limits.find_one({
        "country_code": country_code.upper(),
        "currency": currency.upper(),
        "card_type": card_type
    })
    
    if not limits:
        # Check for default limits (ALL country)
        limits = await db.nfc_card_limits.find_one({
            "country_code": "ALL",
            "currency": currency.upper(),
            "card_type": card_type
        })
    
    if not limits:
        # Return default limits based on card type
        default_limits = {
            "basic": {
                "daily_limit": 100,
                "weekly_limit": 500,
                "monthly_limit": 1500,
                "max_balance": 500,
                "min_recharge": 1,
                "max_recharge": 100
            },
            "standard": {
                "daily_limit": 500,
                "weekly_limit": 2000,
                "monthly_limit": 5000,
                "max_balance": 2000,
                "min_recharge": 1,
                "max_recharge": 500
            },
            "premium": {
                "daily_limit": 2000,
                "weekly_limit": 10000,
                "monthly_limit": 30000,
                "max_balance": 10000,
                "min_recharge": 1,
                "max_recharge": 2000
            }
        }
        return default_limits.get(card_type, default_limits["basic"])
    
    return {
        "daily_limit": limits["daily_limit"],
        "weekly_limit": limits["weekly_limit"],
        "monthly_limit": limits["monthly_limit"],
        "max_balance": limits["max_balance"],
        "min_recharge": limits.get("min_recharge", 1),
        "max_recharge": limits["max_recharge"]
    }


# === PARTNER AUTH ===
@router.post("/partner/login")
async def partner_login(req: LoginReq):
    """Partner login endpoint"""
    partner = await db.partners.find_one({"phone": req.phone})
    if not partner:
        raise HTTPException(401, "Partenaire non trouvé")
    if not verify_pw(req.password, partner["password"]):
        raise HTTPException(401, "Mot de passe incorrect")
    if partner["status"] != "approved":
        raise HTTPException(403, f"Compte en attente d'approbation (statut: {partner['status']})")
    
    token = jwt.encode({
        "sub": partner["id"], 
        "role": "partner", 
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    return {
        "token": token,
        "partner": {
            "id": partner["id"],
            "name": partner["name"],
            "business_name": partner["business_name"],
            "phone": partner["phone"],
            "country": partner["country"],
            "balance": partner.get("balance", 0),
            "currency": partner.get("currency", "USD")
        }
    }


@router.get("/partner/me")
async def get_partner_profile(partner=Depends(get_partner)):
    """Get current partner profile"""
    # Get recent transactions
    recent_txns = await db.partner_transactions.find(
        {"partner_id": partner["id"]}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    for tx in recent_txns:
        tx.pop("_id", None)
    
    return {
        "partner": {
            "id": partner["id"],
            "name": partner["name"],
            "business_name": partner["business_name"],
            "phone": partner["phone"],
            "email": partner.get("email"),
            "country": partner["country"],
            "balance": partner.get("balance", 0),
            "currency": partner.get("currency", "USD"),
            "commission_rate": partner.get("commission_rate", 2.0),
            "total_transactions": partner.get("total_transactions", 0),
            "total_commission": partner.get("total_commission", 0),
            "created_at": partner.get("created_at"),
            "approved_at": partner.get("approved_at")
        },
        "recent_transactions": recent_txns
    }


@router.get("/partner/balance")
async def get_partner_balance(partner=Depends(get_partner)):
    """Get partner balance"""
    return {
        "balance": partner.get("balance", 0),
        "currency": partner.get("currency", "USD"),
        "commission_earned": partner.get("total_commission", 0)
    }


# === PARTNER OPERATIONS ===
@router.post("/partner/client/recharge")
async def partner_recharge_client(req: PartnerClientRechargeReq, partner=Depends(get_partner)):
    """Partner recharges a client's account"""
    # Find client
    q = {}
    if req.client_phone:
        q["phone"] = req.client_phone
    elif req.client_account:
        q["account_number"] = req.client_account
    else:
        raise HTTPException(400, "Numéro de téléphone ou de compte requis")
    
    client = await db.users.find_one(q)
    if not client:
        raise HTTPException(404, "Client non trouvé")
    
    # Check partner balance
    if partner.get("balance", 0) < req.amount:
        raise HTTPException(400, f"Solde insuffisant. Votre solde: {partner.get('balance', 0)} {partner.get('currency', 'USD')}")
    
    # Get rates for client recharge
    rates = await get_partner_rates(partner["country"], "client_recharge")
    commission = round(req.amount * (rates["partner_commission"] / 100), 2)
    client_fee = round(req.amount * (rates["client_fee"] / 100), 2)
    client_receives = req.amount - client_fee
    
    n = now_iso()
    tx_id = gen_id()
    
    # Deduct from partner
    await db.partners.update_one(
        {"id": partner["id"]},
        {
            "$inc": {
                "balance": -req.amount,
                "total_transactions": 1,
                "total_commission": commission
            }
        }
    )
    
    # Credit client wallet
    wallet = await db.wallets.find_one({"user_id": client["id"], "currency": req.currency, "is_primary": True})
    if wallet:
        await db.wallets.update_one({"id": wallet["id"]}, {"$inc": {"balance": client_receives}})
    else:
        await db.wallets.insert_one({
            "id": gen_id(), "user_id": client["id"], "currency": req.currency,
            "balance": client_receives, "is_primary": True, "created_at": n
        })
    
    # Record transaction
    await db.partner_transactions.insert_one({
        "id": tx_id,
        "partner_id": partner["id"],
        "partner_name": partner["business_name"],
        "type": "client_recharge",
        "client_id": client["id"],
        "client_name": client["name"],
        "client_phone": client["phone"],
        "amount": req.amount,
        "client_receives": client_receives,
        "client_fee": client_fee,
        "commission": commission,
        "currency": req.currency,
        "status": "completed",
        "created_at": n
    })
    
    # Notify client
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": client["id"],
        "type": "partner_recharge",
        "title": "Recharge effectuée",
        "message": f"Votre compte a été rechargé de {client_receives} {req.currency} par {partner['business_name']}",
        "is_read": False,
        "created_at": n
    })
    
    return {
        "message": "Recharge effectuée avec succès",
        "transaction_id": tx_id,
        "client_name": client["name"],
        "amount": req.amount,
        "client_fee": client_fee,
        "client_receives": client_receives,
        "commission_earned": commission,
        "new_balance": partner.get("balance", 0) - req.amount
    }


@router.post("/partner/client/withdraw")
async def partner_withdraw_client(req: PartnerClientWithdrawReq, partner=Depends(get_partner)):
    """Partner processes a client withdrawal"""
    # Find client
    q = {}
    if req.client_phone:
        q["phone"] = req.client_phone
    elif req.client_account:
        q["account_number"] = req.client_account
    else:
        raise HTTPException(400, "Numéro de téléphone ou de compte requis")
    
    client = await db.users.find_one(q)
    if not client:
        raise HTTPException(404, "Client non trouvé")
    
    # Check client balance
    wallet = await db.wallets.find_one({"user_id": client["id"], "currency": req.currency, "is_primary": True})
    if not wallet or wallet.get("balance", 0) < req.amount:
        raise HTTPException(400, "Solde client insuffisant")
    
    # Get rates for client withdrawal
    rates = await get_partner_rates(partner["country"], "client_withdraw")
    commission = round(req.amount * (rates["partner_commission"] / 100), 2)
    client_fee = round(req.amount * (rates["client_fee"] / 100), 2)
    client_pays = req.amount + client_fee
    partner_receives = req.amount
    
    if wallet.get("balance", 0) < client_pays:
        raise HTTPException(400, f"Solde client insuffisant. Montant requis avec frais: {client_pays} {req.currency}")
    
    n = now_iso()
    tx_id = gen_id()
    
    # Deduct from client
    await db.wallets.update_one({"id": wallet["id"]}, {"$inc": {"balance": -client_pays}})
    
    # Credit partner
    await db.partners.update_one(
        {"id": partner["id"]},
        {
            "$inc": {
                "balance": partner_receives,
                "total_transactions": 1,
                "total_commission": commission
            }
        }
    )
    
    # Record transaction
    await db.partner_transactions.insert_one({
        "id": tx_id,
        "partner_id": partner["id"],
        "partner_name": partner["business_name"],
        "type": "client_withdraw",
        "client_id": client["id"],
        "client_name": client["name"],
        "client_phone": client["phone"],
        "amount": req.amount,
        "client_fee": client_fee,
        "client_pays": client_pays,
        "commission": commission,
        "currency": req.currency,
        "status": "completed",
        "created_at": n
    })
    
    # Notify client
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": client["id"],
        "type": "partner_withdraw",
        "title": "Retrait effectué",
        "message": f"Retrait de {req.amount} {req.currency} effectué chez {partner['business_name']}. Frais: {client_fee} {req.currency}",
        "is_read": False,
        "created_at": n
    })
    
    return {
        "message": "Retrait effectué avec succès",
        "transaction_id": tx_id,
        "client_name": client["name"],
        "amount": req.amount,
        "client_fee": client_fee,
        "commission_earned": commission,
        "new_balance": partner.get("balance", 0) + partner_receives
    }


# === PARTNER NFC STANDALONE CARDS ===
@router.post("/partner/nfc/recharge")
async def partner_recharge_nfc(req: PartnerNFCRechargeReq, partner=Depends(get_partner)):
    """Partner recharges a standalone NFC card (not linked to account)"""
    # Find NFC card
    q = {}
    if req.nfc_serial:
        q["nfc_serial"] = req.nfc_serial.upper()
    elif req.card_number:
        q["printed_card_number"] = req.card_number.replace("-", "").replace(" ", "")
    else:
        raise HTTPException(400, "Numéro NFC ou numéro de carte requis")
    
    card = await db.virtual_cards.find_one(q)
    if not card:
        raise HTTPException(404, "Carte NFC non trouvée")
    
    # Check if standalone (no user_id or user_id is null)
    if card.get("user_id"):
        raise HTTPException(400, "Cette carte est liée à un compte. Le client doit effectuer la recharge via son compte.")
    
    # Check if card is active
    if card.get("status") != "active":
        raise HTTPException(400, f"Carte non active (statut: {card.get('status')})")
    
    # Get card type and check limits
    card_type = card.get("nfc_card_type", "basic")
    card_limits = await get_nfc_card_limits(partner["country"], req.currency, card_type)
    
    # Validate against limits
    if req.amount < card_limits["min_recharge"]:
        raise HTTPException(400, f"Montant minimum: {card_limits['min_recharge']} {req.currency}")
    if req.amount > card_limits["max_recharge"]:
        raise HTTPException(400, f"Montant maximum par recharge: {card_limits['max_recharge']} {req.currency}")
    
    new_balance = card.get("balance", 0) + req.amount
    if new_balance > card_limits["max_balance"]:
        raise HTTPException(400, f"Solde maximum de la carte: {card_limits['max_balance']} {req.currency}. Solde actuel: {card.get('balance', 0)}")
    
    # Check partner balance
    if partner.get("balance", 0) < req.amount:
        raise HTTPException(400, f"Solde insuffisant. Votre solde: {partner.get('balance', 0)} {partner.get('currency', 'USD')}")
    
    # Get rates for NFC recharge
    rates = await get_partner_rates(partner["country"], "nfc_recharge")
    commission = round(req.amount * (rates["partner_commission"] / 100), 2)
    
    n = now_iso()
    tx_id = gen_id()
    
    # Deduct from partner
    await db.partners.update_one(
        {"id": partner["id"]},
        {
            "$inc": {
                "balance": -req.amount,
                "total_transactions": 1,
                "total_commission": commission
            }
        }
    )
    
    # Credit NFC card
    await db.virtual_cards.update_one(
        {"id": card["id"]},
        {"$inc": {"balance": req.amount}}
    )
    
    # Record transaction
    await db.partner_transactions.insert_one({
        "id": tx_id,
        "partner_id": partner["id"],
        "partner_name": partner["business_name"],
        "type": "nfc_recharge",
        "card_id": card["id"],
        "card_name": card.get("name", "Carte NFC"),
        "nfc_serial": card.get("nfc_serial"),
        "amount": req.amount,
        "commission": commission,
        "currency": req.currency,
        "status": "completed",
        "created_at": n
    })
    
    return {
        "message": "Carte NFC rechargée avec succès",
        "transaction_id": tx_id,
        "card_name": card.get("name", "Carte NFC"),
        "amount": req.amount,
        "commission_earned": commission,
        "card_new_balance": card.get("balance", 0) + req.amount,
        "partner_new_balance": partner.get("balance", 0) - req.amount
    }


@router.post("/partner/nfc/withdraw")
async def partner_withdraw_nfc(req: PartnerNFCWithdrawReq, partner=Depends(get_partner)):
    """Partner withdraws from a standalone NFC card"""
    # Find NFC card
    q = {}
    if req.nfc_serial:
        q["nfc_serial"] = req.nfc_serial.upper()
    elif req.card_number:
        q["printed_card_number"] = req.card_number.replace("-", "").replace(" ", "")
    else:
        raise HTTPException(400, "Numéro NFC ou numéro de carte requis")
    
    card = await db.virtual_cards.find_one(q)
    if not card:
        raise HTTPException(404, "Carte NFC non trouvée")
    
    # Check if standalone
    if card.get("user_id"):
        raise HTTPException(400, "Cette carte est liée à un compte. Le client doit effectuer le retrait via son compte.")
    
    # Check if card is active
    if card.get("status") != "active":
        raise HTTPException(400, f"Carte non active (statut: {card.get('status')})")
    
    # Check card balance
    if card.get("balance", 0) < req.amount:
        raise HTTPException(400, f"Solde carte insuffisant. Solde: {card.get('balance', 0)} {card.get('currency', 'USD')}")
    
    # Get rates for NFC withdrawal
    rates = await get_partner_rates(partner["country"], "nfc_withdraw")
    commission = round(req.amount * (rates["partner_commission"] / 100), 2)
    
    n = now_iso()
    tx_id = gen_id()
    
    # Deduct from card
    await db.virtual_cards.update_one(
        {"id": card["id"]},
        {"$inc": {"balance": -req.amount}}
    )
    
    # Credit partner
    await db.partners.update_one(
        {"id": partner["id"]},
        {
            "$inc": {
                "balance": req.amount,
                "total_transactions": 1,
                "total_commission": commission
            }
        }
    )
    
    # Record transaction
    await db.partner_transactions.insert_one({
        "id": tx_id,
        "partner_id": partner["id"],
        "partner_name": partner["business_name"],
        "type": "nfc_withdraw",
        "card_id": card["id"],
        "card_name": card.get("name", "Carte NFC"),
        "nfc_serial": card.get("nfc_serial"),
        "amount": req.amount,
        "commission": commission,
        "currency": req.currency,
        "status": "completed",
        "created_at": n
    })
    
    return {
        "message": "Retrait carte NFC effectué",
        "transaction_id": tx_id,
        "card_name": card.get("name", "Carte NFC"),
        "amount": req.amount,
        "commission_earned": commission,
        "card_new_balance": card.get("balance", 0) - req.amount,
        "partner_new_balance": partner.get("balance", 0) + req.amount
    }


@router.get("/partner/transactions")
async def get_partner_transactions(
    page: int = 1, 
    limit: int = 20,
    tx_type: str = None,
    partner=Depends(get_partner)
):
    """Get partner transaction history"""
    skip = (page - 1) * limit
    q = {"partner_id": partner["id"]}
    if tx_type:
        q["type"] = tx_type
    
    total = await db.partner_transactions.count_documents(q)
    txns = await db.partner_transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "transactions": txns,
        "total": total,
        "page": page,
        "pages": -(-total // limit)
    }


# === MANAGER - PARTNER MANAGEMENT ===
@router.post("/manager/partners")
async def create_partner(req: PartnerCreateReq, manager=Depends(get_manager)):
    """Manager creates a new partner account (pending approval)"""
    # Check if phone already exists
    existing = await db.partners.find_one({"phone": req.phone})
    if existing:
        raise HTTPException(400, "Un partenaire avec ce numéro existe déjà")
    
    # Check manager's country access
    admin_countries = get_admin_country_filter(manager)
    if admin_countries and req.country.upper() not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce pays")
    
    n = now_iso()
    partner_id = gen_id()
    temp_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
    
    partner = {
        "id": partner_id,
        "name": req.name,
        "phone": req.phone,
        "email": req.email,
        "password": hash_pw(temp_password),
        "business_name": req.business_name,
        "business_address": req.business_address,
        "country": req.country.upper(),
        "currency": "USD",
        "balance": 0,
        "commission_rate": req.commission_rate,
        "total_transactions": 0,
        "total_commission": 0,
        "status": "pending",  # pending, approved, suspended
        "created_by": manager["id"],
        "created_by_name": manager["name"],
        "notes": req.notes,
        "created_at": n
    }
    
    await db.partners.insert_one(partner)
    
    return {
        "message": "Partenaire créé avec succès. En attente d'approbation.",
        "partner_id": partner_id,
        "temporary_password": temp_password,
        "phone": req.phone,
        "status": "pending"
    }


@router.get("/manager/partners")
async def list_partners(
    page: int = 1,
    limit: int = 20,
    status: str = None,
    country: str = None,
    manager=Depends(get_manager)
):
    """List partners (filtered by manager's country access)"""
    skip = (page - 1) * limit
    q = build_country_query(manager, country)
    
    if q.get("__forbidden__"):
        return {"partners": [], "total": 0, "page": page}
    
    if status:
        q["status"] = status
    
    total = await db.partners.count_documents(q)
    partners = await db.partners.find(q, {"_id": 0, "password": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "partners": partners,
        "total": total,
        "page": page,
        "pages": -(-total // limit)
    }


@router.post("/manager/partners/{partner_id}/topup")
async def topup_partner(partner_id: str, req: PartnerTopupReq, manager=Depends(get_manager)):
    """Manager tops up a partner's account"""
    partner = await db.partners.find_one({"id": partner_id})
    if not partner:
        raise HTTPException(404, "Partenaire non trouvé")
    
    # Check manager's country access
    admin_countries = get_admin_country_filter(manager)
    if admin_countries and partner["country"] not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce partenaire")
    
    if partner["status"] != "approved":
        raise HTTPException(400, "Le partenaire doit être approuvé pour recevoir des fonds")
    
    n = now_iso()
    tx_id = gen_id()
    
    # Credit partner
    await db.partners.update_one(
        {"id": partner_id},
        {"$inc": {"balance": req.amount}}
    )
    
    # Record transaction
    await db.partner_transactions.insert_one({
        "id": tx_id,
        "partner_id": partner_id,
        "partner_name": partner["business_name"],
        "type": "topup",
        "amount": req.amount,
        "currency": req.currency,
        "payment_method": req.payment_method,
        "reference": req.reference,
        "manager_id": manager["id"],
        "manager_name": manager["name"],
        "status": "completed",
        "created_at": n
    })
    
    return {
        "message": "Rechargement effectué avec succès",
        "transaction_id": tx_id,
        "partner_name": partner["business_name"],
        "amount": req.amount,
        "new_balance": partner.get("balance", 0) + req.amount
    }


# === ADMIN - PARTNER APPROVAL & RATES ===
@router.get("/admin/partners")
async def admin_list_partners(
    page: int = 1,
    limit: int = 20,
    status: str = None,
    country: str = None,
    adm=Depends(get_admin)
):
    """Admin lists all partners"""
    skip = (page - 1) * limit
    q = build_country_query(adm, country)
    
    if q.get("__forbidden__"):
        return {"partners": [], "total": 0, "page": page}
    
    if status:
        q["status"] = status
    
    total = await db.partners.count_documents(q)
    partners = await db.partners.find(q, {"_id": 0, "password": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "partners": partners,
        "total": total,
        "page": page,
        "pages": -(-total // limit)
    }


@router.get("/admin/partners/pending")
async def admin_pending_partners(adm=Depends(get_admin)):
    """Get partners pending approval"""
    q = build_country_query(adm, "")
    if q.get("__forbidden__"):
        return {"partners": [], "total": 0}
    
    q["status"] = "pending"
    partners = await db.partners.find(q, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(50)
    
    return {
        "partners": partners,
        "total": len(partners)
    }


@router.patch("/admin/partners/{partner_id}/approve")
async def admin_approve_partner(partner_id: str, adm=Depends(get_admin)):
    """Admin approves a partner"""
    partner = await db.partners.find_one({"id": partner_id})
    if not partner:
        raise HTTPException(404, "Partenaire non trouvé")
    
    # Check admin's country access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and partner["country"] not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce partenaire")
    
    n = now_iso()
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {
            "status": "approved",
            "approved_by": adm["id"],
            "approved_by_name": adm["name"],
            "approved_at": n
        }}
    )
    
    return {"message": "Partenaire approuvé", "partner_id": partner_id}


@router.patch("/admin/partners/{partner_id}/suspend")
async def admin_suspend_partner(partner_id: str, reason: str = "", adm=Depends(get_admin)):
    """Admin suspends a partner"""
    partner = await db.partners.find_one({"id": partner_id})
    if not partner:
        raise HTTPException(404, "Partenaire non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and partner["country"] not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce partenaire")
    
    n = now_iso()
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {
            "status": "suspended",
            "suspended_by": adm["id"],
            "suspended_reason": reason,
            "suspended_at": n
        }}
    )
    
    return {"message": "Partenaire suspendu", "partner_id": partner_id}


@router.patch("/admin/partners/{partner_id}/reactivate")
async def admin_reactivate_partner(partner_id: str, adm=Depends(get_admin)):
    """Admin reactivates a suspended partner"""
    partner = await db.partners.find_one({"id": partner_id})
    if not partner:
        raise HTTPException(404, "Partenaire non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and partner["country"] not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce partenaire")
    
    n = now_iso()
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {
            "status": "approved",
            "reactivated_by": adm["id"],
            "reactivated_at": n
        }}
    )
    
    return {"message": "Partenaire réactivé", "partner_id": partner_id}


# === PARTNER RATES BY COUNTRY AND TRANSACTION TYPE ===
TRANSACTION_TYPES = ["client_recharge", "client_withdraw", "nfc_recharge", "nfc_withdraw"]

@router.get("/admin/partner-rates")
async def get_all_partner_rates(adm=Depends(get_admin)):
    """Get partner rates for all countries"""
    rates = await db.partner_rates.find({}, {"_id": 0}).to_list(200)
    return {
        "rates": rates,
        "transaction_types": TRANSACTION_TYPES,
        "transaction_type_labels": {
            "client_recharge": "Recharge client",
            "client_withdraw": "Retrait client",
            "nfc_recharge": "Recharge NFC",
            "nfc_withdraw": "Retrait NFC"
        }
    }


@router.get("/admin/partner-rates/{country_code}")
async def get_country_partner_rates(country_code: str, adm=Depends(get_admin)):
    """Get partner rates for a specific country"""
    rates = await db.partner_rates.find_one({"country_code": country_code.upper()}, {"_id": 0})
    if not rates:
        rates = {
            "country_code": country_code.upper(),
            # Client recharge rates
            "client_recharge_partner_commission": 2.0,
            "client_recharge_client_fee": 1.0,
            # Client withdraw rates
            "client_withdraw_partner_commission": 2.0,
            "client_withdraw_client_fee": 1.5,
            # NFC recharge rates
            "nfc_recharge_partner_commission": 1.5,
            "nfc_recharge_client_fee": 0.5,
            # NFC withdraw rates
            "nfc_withdraw_partner_commission": 1.5,
            "nfc_withdraw_client_fee": 0.5
        }
    return rates


@router.put("/admin/partner-rates/{country_code}")
async def set_country_partner_rates(country_code: str, req: PartnerRatesReq, adm=Depends(get_admin)):
    """Set partner rates for a country by transaction type"""
    # Check admin's country access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and country_code.upper() not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce pays")
    
    n = now_iso()
    rates = {
        "country_code": country_code.upper(),
        # Client recharge rates
        "client_recharge_partner_commission": req.client_recharge_partner_commission,
        "client_recharge_client_fee": req.client_recharge_client_fee,
        # Client withdraw rates  
        "client_withdraw_partner_commission": req.client_withdraw_partner_commission,
        "client_withdraw_client_fee": req.client_withdraw_client_fee,
        # NFC recharge rates
        "nfc_recharge_partner_commission": req.nfc_recharge_partner_commission,
        "nfc_recharge_client_fee": req.nfc_recharge_client_fee,
        # NFC withdraw rates
        "nfc_withdraw_partner_commission": req.nfc_withdraw_partner_commission,
        "nfc_withdraw_client_fee": req.nfc_withdraw_client_fee,
        "updated_by": adm["id"],
        "updated_at": n
    }
    
    await db.partner_rates.update_one(
        {"country_code": country_code.upper()},
        {"$set": rates},
        upsert=True
    )
    
    return {"message": "Taux mis à jour", "rates": rates}


# === NFC STANDALONE CARD LIMITS ===
@router.get("/admin/nfc-card-types")
async def get_nfc_card_types(adm=Depends(get_admin)):
    """Get all NFC card types"""
    return {"card_types": NFC_CARD_TYPES}


@router.get("/admin/nfc-card-limits")
async def get_all_nfc_card_limits(adm=Depends(get_admin)):
    """Get all NFC card limits configurations"""
    limits = await db.nfc_card_limits.find({}, {"_id": 0}).to_list(500)
    return {
        "limits": limits,
        "card_types": NFC_CARD_TYPES
    }


@router.get("/admin/nfc-card-limits/{country_code}")
async def get_country_nfc_card_limits(country_code: str, currency: str = "USD", adm=Depends(get_admin)):
    """Get NFC card limits for a country"""
    limits = await db.nfc_card_limits.find({
        "country_code": country_code.upper(),
        "currency": currency.upper()
    }, {"_id": 0}).to_list(10)
    
    # If no limits found, return defaults
    if not limits:
        limits = [
            {
                "country_code": country_code.upper(),
                "currency": currency.upper(),
                "card_type": "basic",
                "daily_limit": 100,
                "weekly_limit": 500,
                "monthly_limit": 1500,
                "max_balance": 500,
                "min_recharge": 1,
                "max_recharge": 100
            },
            {
                "country_code": country_code.upper(),
                "currency": currency.upper(),
                "card_type": "standard",
                "daily_limit": 500,
                "weekly_limit": 2000,
                "monthly_limit": 5000,
                "max_balance": 2000,
                "min_recharge": 1,
                "max_recharge": 500
            },
            {
                "country_code": country_code.upper(),
                "currency": currency.upper(),
                "card_type": "premium",
                "daily_limit": 2000,
                "weekly_limit": 10000,
                "monthly_limit": 30000,
                "max_balance": 10000,
                "min_recharge": 1,
                "max_recharge": 2000
            }
        ]
    
    return {
        "country_code": country_code.upper(),
        "currency": currency.upper(),
        "limits": limits,
        "card_types": NFC_CARD_TYPES
    }


@router.put("/admin/nfc-card-limits/{country_code}")
async def set_nfc_card_limits(country_code: str, req: NFCCardLimitsReq, adm=Depends(get_admin)):
    """Set NFC card limits for a country/currency/card type"""
    # Check admin's country access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and country_code.upper() not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce pays")
    
    if req.card_type not in NFC_CARD_TYPES:
        raise HTTPException(400, f"Type de carte invalide. Types valides: {list(NFC_CARD_TYPES.keys())}")
    
    n = now_iso()
    limits = {
        "country_code": country_code.upper(),
        "currency": req.currency.upper(),
        "card_type": req.card_type,
        "daily_limit": req.daily_limit,
        "weekly_limit": req.weekly_limit,
        "monthly_limit": req.monthly_limit,
        "max_balance": req.max_balance,
        "min_recharge": req.min_recharge,
        "max_recharge": req.max_recharge,
        "updated_by": adm["id"],
        "updated_at": n
    }
    
    await db.nfc_card_limits.update_one(
        {
            "country_code": country_code.upper(),
            "currency": req.currency.upper(),
            "card_type": req.card_type
        },
        {"$set": limits},
        upsert=True
    )
    
    return {"message": "Limites mises à jour", "limits": limits}


@router.get("/admin/partners/{partner_id}/transactions")
async def admin_partner_transactions(
    partner_id: str,
    page: int = 1,
    limit: int = 20,
    adm=Depends(get_admin)
):
    """Get transactions for a specific partner"""
    partner = await db.partners.find_one({"id": partner_id})
    if not partner:
        raise HTTPException(404, "Partenaire non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and partner["country"] not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à ce partenaire")
    
    skip = (page - 1) * limit
    q = {"partner_id": partner_id}
    
    total = await db.partner_transactions.count_documents(q)
    txns = await db.partner_transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "partner": {
            "id": partner["id"],
            "name": partner["name"],
            "business_name": partner["business_name"]
        },
        "transactions": txns,
        "total": total,
        "page": page,
        "pages": -(-total // limit)
    }


