"""
Monity World - Mobile Compatibility Routes
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
from models.schemas import GroupJoinBodyReq, TransferReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=['Mobile Compatibility'])

# === MOBILE APP COMPATIBILITY ALIASES ===
# These endpoints provide URL aliases for the mobile application

# --- Transaction Aliases ---
@router.get("/transactions/history")
async def transactions_history_alias(page: int = 1, limit: int = 20, u=Depends(get_current_user)):
    """Alias for /wallet/transactions - Mobile app compatibility"""
    skip = (page - 1) * limit
    q = {"$or": [{"sender_id": u["id"]}, {"receiver_id": u["id"]}]}
    total = await db.transactions.count_documents(q)
    txs = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"transactions": txs, "total": total, "page": page, "pages": -(-total // limit)}


@router.post("/transactions/transfer")
async def transactions_transfer_alias(req: TransferReq, u=Depends(get_current_user)):
    """Alias for /wallet/transfer - Mobile app compatibility"""
    if req.amount <= 0: raise HTTPException(400, "Montant invalide")
    
    # Block non-client roles
    if u.get("role") in NON_CLIENT_ROLES:
        raise HTTPException(403, "Les comptes administrateurs ne peuvent pas effectuer de transferts")
    
    sw = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
    if not sw: raise HTTPException(400, f"Portefeuille {req.currency} non trouvé")
    
    receiver = None
    if req.receiver_phone:
        receiver = await db.users.find_one({"phone": req.receiver_phone})
    elif req.receiver_account:
        receiver = await db.users.find_one({"account_number": req.receiver_account})
    if not receiver: raise HTTPException(404, "Destinataire non trouvé")
    if receiver["id"] == u["id"]: raise HTTPException(400, "Auto-transfert interdit")
    if receiver.get("role") in NON_CLIENT_ROLES: raise HTTPException(404, "Destinataire non trouvé")
    
    sender_country = u.get("country", "CD")
    receiver_country = receiver.get("country", "CD")
    is_international = sender_country != receiver_country
    target_currency = req.target_currency or req.currency
    is_conversion = req.currency != target_currency
    
    if is_international:
        rule = await get_international_rule(sender_country, receiver_country)
        tx_type = "international"
    else:
        rule = await get_transaction_rule(sender_country, "transfer")
        tx_type = "transfer"
    
    limit_check = await check_transaction_limits(u["id"], req.amount, tx_type, rule)
    if not limit_check["allowed"]:
        raise HTTPException(400, "; ".join(limit_check["errors"]))
    
    base_fee = calculate_fee(req.amount, rule)
    conversion_fee = 0.0
    conversion_fee_percent = 2.0
    exchange_rate = 1.0
    received_amount = req.amount
    
    if is_conversion:
        conversion_fee = round(req.amount * (conversion_fee_percent / 100), 2)
        margin = rule.get("exchange_rate_margin", 2.0) if is_international else conversion_fee_percent
        exchange_rate = await get_exchange_rate(req.currency, target_currency, margin)
        received_amount = round((req.amount - conversion_fee) * exchange_rate, 2)
    
    total = req.amount + base_fee
    total_fees = base_fee + conversion_fee
    
    if sw["balance"] < total: 
        raise HTTPException(400, f"Solde insuffisant. Disponible: {sw['balance']} {req.currency}, Requis: {total}")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": req.currency}, {"$inc": {"balance": -total}})
    n = now_iso()
    
    rw = await db.wallets.find_one({"user_id": receiver["id"], "currency": target_currency})
    if not rw:
        await db.wallets.insert_one({
            "id": gen_id(), "user_id": receiver["id"], "currency": target_currency,
            "balance": received_amount, "is_primary": False, "created_at": n
        })
    else:
        await db.wallets.update_one({"user_id": receiver["id"], "currency": target_currency}, {"$inc": {"balance": received_amount}})
    
    tx_id = gen_id()
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": u["id"], "sender_name": u["name"], "sender_phone": u["phone"],
        "sender_country": sender_country, "receiver_id": receiver["id"], "receiver_name": receiver["name"],
        "receiver_phone": receiver["phone"], "receiver_country": receiver_country,
        "amount": req.amount, "fee": total_fees, "currency": req.currency,
        "target_currency": target_currency, "exchange_rate": exchange_rate,
        "received_amount": received_amount, "type": tx_type, "status": "completed",
        "description": req.description or f"Transfert vers {receiver['name']}",
        "created_at": n, "completed_at": n
    })
    
    return {
        "message": f"{received_amount} {target_currency} envoyé à {receiver['name']}",
        "transaction_id": tx_id, "fee": total_fees, "exchange_rate": exchange_rate if is_conversion else None,
        "received_amount": received_amount
    }


@router.post("/transactions/recharge")
async def transactions_recharge_alias(amount: float = Body(...), currency: str = Body("USD"), method: str = Body("mobile_money"), u=Depends(get_current_user)):
    """Alias for /wallet/recharge - Mobile app compatibility"""
    if amount <= 0: raise HTTPException(400, "Montant invalide")
    
    country = u.get("country", "CD")
    rule = await get_transaction_rule(country, "recharge")
    limit_check = await check_transaction_limits(u["id"], amount, "recharge", rule)
    if not limit_check["allowed"]:
        raise HTTPException(400, "; ".join(limit_check["errors"]))
    
    fee = calculate_fee(amount, rule)
    net_amount = amount - fee
    n = now_iso()
    tx_id = gen_id()
    
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": None, "sender_name": "Système",
        "receiver_id": u["id"], "receiver_name": u["name"], "receiver_phone": u["phone"],
        "receiver_country": country, "amount": amount, "fee": fee, "currency": currency,
        "type": "recharge", "status": "pending", "method": method,
        "description": f"Rechargement via {method}", "created_at": n
    })
    
    return {"message": "Rechargement en attente", "transaction_id": tx_id, "fee": fee, "status": "pending"}


@router.post("/transactions/withdraw")
async def transactions_withdraw_alias(
    amount: float = Body(...), currency: str = Body("USD"),
    method: str = Body("mobile_money"), destination: str = Body(...),
    u=Depends(get_current_user)
):
    """Alias for /wallet/withdraw - Mobile app compatibility"""
    if amount <= 0: raise HTTPException(400, "Montant invalide")
    w = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
    if not w: raise HTTPException(400, f"Portefeuille {currency} non trouvé")
    
    country = u.get("country", "CD")
    rule = await get_transaction_rule(country, "withdrawal")
    limit_check = await check_transaction_limits(u["id"], amount, "withdrawal", rule)
    if not limit_check["allowed"]:
        raise HTTPException(400, "; ".join(limit_check["errors"]))
    
    fee = calculate_fee(amount, rule)
    total = amount + fee
    
    if w["balance"] < total:
        raise HTTPException(400, f"Solde insuffisant. Disponible: {w['balance']}, Requis: {total}")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": currency}, {"$inc": {"balance": -total}})
    n = now_iso()
    tx_id = gen_id()
    
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": u["id"], "sender_name": u["name"], "sender_phone": u["phone"],
        "sender_country": country, "receiver_id": None, "receiver_name": "Retrait",
        "receiver_phone": destination, "amount": amount, "fee": fee, "currency": currency,
        "type": "withdrawal", "status": "pending", "method": method,
        "description": f"Retrait vers {destination}", "created_at": n
    })
    
    return {"message": "Retrait en attente de validation", "transaction_id": tx_id, "fee": fee, "status": "pending"}


# --- Cards Aliases ---
@router.get("/cards/nfc/{nfc_serial}")
async def get_card_by_nfc_serial(nfc_serial: str):
    """Get card info by NFC serial number - Mobile app compatibility"""
    card = await db.virtual_cards.find_one(
        {"nfc_serial_number": nfc_serial.upper(), "status": "approved"},
        {"_id": 0, "delete_votes": 0, "card_pin": 0}
    )
    if not card:
        raise HTTPException(404, "Carte NFC non trouvée ou non active")
    
    owner = await db.users.find_one({"id": card.get("user_id")}, {"_id": 0, "name": 1, "phone": 1})
    return {
        "card_id": card["id"],
        "card_name": card["name"],
        "owner_name": card.get("owner_name") or (owner["name"] if owner else "Inconnu"),
        "currency": card["currency"],
        "can_receive": card.get("can_receive", True),
        "can_send": card.get("can_send", True),
        "is_locked": card.get("is_locked", False),
        "balance": card.get("balance", 0)
    }


@router.get("/cards/barcode/{barcode}")
async def get_card_by_barcode_alias(barcode: str):
    """Alias for /virtual-cards/barcode/{barcode} - Mobile app compatibility"""
    card = await db.virtual_cards.find_one({"barcode": barcode, "status": "approved"}, {"_id": 0, "delete_votes": 0})
    if not card:
        raise HTTPException(404, "Carte non trouvée ou non active")
    return {
        "card_id": card["id"],
        "card_name": card["name"],
        "owner_name": card.get("owner_name", ""),
        "currency": card["currency"],
        "can_receive": card.get("can_receive", True)
    }


# --- Virtual Cards Recharge ---
@router.post("/virtual-cards/{card_id}/recharge")
async def recharge_virtual_card(card_id: str, amount: float = Body(..., embed=True), u=Depends(get_current_user)):
    """Recharge a virtual card from user's wallet - Mobile app compatibility"""
    card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    if card.get("status") != "approved":
        raise HTTPException(400, "Carte non approuvée")
    if card.get("is_locked"):
        raise HTTPException(400, "Carte verrouillée")
    
    currency = card["currency"]
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(400, f"Solde insuffisant dans le portefeuille {currency}")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": currency}, {"$inc": {"balance": -amount}})
    new_balance = card.get("balance", 0) + amount
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {"balance": new_balance}})
    
    n = now_iso()
    await db.transactions.insert_one({
        "id": gen_id(), "sender_id": u["id"], "sender_name": u["name"],
        "receiver_id": u["id"], "receiver_name": card["name"],
        "amount": amount, "fee": 0, "currency": currency,
        "type": "card_recharge", "status": "completed",
        "description": f"Rechargement carte {card['name']}",
        "created_at": n, "completed_at": n
    })
    
    return {"message": f"Carte rechargée de {amount} {currency}", "new_balance": new_balance}


# --- Savings Aliases ---
@router.post("/savings/{sid}/deposit")
async def savings_deposit_alias(sid: str, amount: float = Body(..., embed=True), u=Depends(get_current_user)):
    """Alias for /savings/{sid}/contribute - Mobile app compatibility"""
    s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
    if not s:
        raise HTTPException(404, "Épargne non trouvée")
    if s.get("status") != "active":
        raise HTTPException(400, "Cette épargne n'est plus active")
    
    if amount <= 0:
        raise HTTPException(400, "Montant invalide")
    
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": s["currency"]})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(400, "Solde insuffisant")
    
    await db.wallets.update_one(
        {"user_id": u["id"], "currency": s["currency"]},
        {"$inc": {"balance": -amount}}
    )
    
    new_total = s.get("total_contributed", s.get("amount", 0)) + amount
    await db.savings.update_one(
        {"id": sid},
        {
            "$inc": {"total_contributed": amount, "amount": amount},
            "$set": {"last_contribution": now_iso()}
        }
    )
    
    return {
        "message": f"Dépôt de {amount} {s['currency']} effectué",
        "new_total": new_total,
        "remaining": max(0, s.get("target_amount", 0) - new_total) if s.get("target_amount") else None
    }


@router.post("/savings/{sid}/withdraw")
async def savings_withdraw_alias(sid: str, amount: float = Body(None, embed=True), u=Depends(get_current_user)):
    """Withdraw from savings - Mobile app compatibility"""
    s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
    if not s:
        raise HTTPException(404, "Épargne non trouvée")
    if s.get("status") == "completed":
        raise HTTPException(400, "Épargne déjà retirée")
    
    if s.get("locked_until"):
        ld = datetime.fromisoformat(s["locked_until"])
        if ld.tzinfo is None:
            ld = ld.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) < ld:
            raise HTTPException(400, f"Épargne verrouillée jusqu'au {s['locked_until'][:10]}")
    
    withdraw_amount = amount if amount else s.get("amount", 0)
    if withdraw_amount <= 0:
        raise HTTPException(400, "Montant invalide")
    if withdraw_amount > s.get("amount", 0):
        raise HTTPException(400, "Montant supérieur au solde de l'épargne")
    
    cd = datetime.fromisoformat(s["created_at"])
    if cd.tzinfo is None:
        cd = cd.replace(tzinfo=timezone.utc)
    days = (datetime.now(timezone.utc) - cd).days
    interest = round(withdraw_amount * s.get("interest_rate", 0) * (days / 365), 2)
    total = withdraw_amount + interest
    
    await db.wallets.update_one(
        {"user_id": u["id"], "currency": s["currency"]},
        {"$inc": {"balance": total}}
    )
    
    new_savings_amount = s.get("amount", 0) - withdraw_amount
    if new_savings_amount <= 0:
        await db.savings.update_one({"id": sid}, {"$set": {"status": "completed", "amount": 0}})
    else:
        await db.savings.update_one({"id": sid}, {"$inc": {"amount": -withdraw_amount}})
    
    return {
        "message": "Retrait effectué avec succès",
        "amount": withdraw_amount,
        "interest": interest,
        "total": total,
        "remaining_savings": new_savings_amount if new_savings_amount > 0 else 0
    }


# --- Groups Aliases ---
@router.post("/groups/join")
async def groups_join_by_body(req: GroupJoinBodyReq, u=Depends(get_current_user)):
    """Join group by invite code in body - Mobile app compatibility"""
    group = await db.groups.find_one({"invite_code": req.invite_code})
    if not group:
        raise HTTPException(404, "Code d'invitation invalide")
    if u["id"] in group.get("members", []):
        raise HTTPException(400, "Vous êtes déjà membre")
    if len(group.get("members", [])) >= group.get("max_members", 10):
        raise HTTPException(400, "Groupe complet")
    
    await db.groups.update_one({"id": group["id"]}, {"$push": {"members": u["id"]}})
    
    await db.group_messages.insert_one({
        "id": gen_id(),
        "group_id": group["id"],
        "sender_id": "system",
        "sender_name": "Système",
        "content": f"{u['name']} a rejoint le groupe",
        "type": "join",
        "created_at": now_iso()
    })
    
    return {"message": f"Vous avez rejoint le groupe {group['name']}", "group_id": group["id"]}


