"""
Monity World - Virtual Cards Routes
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
from utils.helpers import validate_nfc_serial
from utils.fees import get_exchange_rate, calculate_fee, get_transaction_rule, get_international_rule, check_transaction_limits
from utils.admin_helpers import get_admin_country_filter, build_country_query, build_transaction_country_query, check_admin_card_access
from utils.auth import is_admin_role, can_access_admin_routes, requires_admin_kyc
from rbac import (
    check_permission, get_role_info, get_role_level,
    is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role,
    has_permission, require_permission
)
from models.schemas import ManagerRechargeReq, NFCAssociationReq, StandaloneCardReq, VirtualCardReq, VirtualCardUpdateReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=['Virtual Cards'])


def get_virtual_card_price(country_code: str = "CD") -> tuple:
    """Get virtual card price based on country"""
    price_map = {
        "CD": (5.0, "USD"), "CG": (3000, "XAF"), "CM": (3000, "XAF"),
        "CI": (3000, "XAF"), "SN": (3000, "XAF"), "BJ": (3000, "XAF"),
        "GA": (3000, "XAF"), "TD": (3000, "XAF"), "TG": (3000, "XAF"),
        "CF": (3000, "XAF"), "GQ": (3000, "XAF"), "ML": (3000, "XAF"),
        "BF": (3000, "XAF"), "NE": (3000, "XAF"), "RW": (3000, "RWF"),
        "BI": (5000, "BIF"), "KE": (500, "KES"), "TZ": (5000, "TZS"),
        "UG": (10000, "UGX"), "ZA": (50, "ZAR"), "NG": (2000, "NGN"),
        "GH": (30, "GHS"), "FR": (5.0, "EUR"), "BE": (5.0, "EUR"),
        "US": (5.0, "USD"), "GB": (4.0, "GBP"), "CA": (7.0, "CAD"),
    }
    return price_map.get(country_code, (5.0, "USD"))


# === VIRTUAL CARDS (Sub-accounts) with Admin Approval & Barcode ===
@router.get("/virtual-cards")
async def get_virtual_cards(u=Depends(get_current_user)):
    return await db.virtual_cards.find({"user_id": u["id"]}, {"_id": 0}).to_list(50)

@router.get("/virtual-cards/price")
async def get_virtual_card_price_endpoint(u=Depends(get_current_user)):
    """Get virtual card price for user's country"""
    user = await db.users.find_one({"id": u["id"]})
    price, currency = get_virtual_card_price(user.get("country", "CD"))
    free_card_used = user.get("free_card_used", False)
    
    return {
        "price": price,
        "currency": currency,
        "free_card_available": not free_card_used,
        "message": "Première carte gratuite!" if not free_card_used else f"Prix: {price} {currency}"
    }

@router.post("/virtual-cards")
async def create_virtual_card(req: VirtualCardReq, u=Depends(get_current_user)):
    """Create virtual card - first one free, others paid"""
    user = await db.users.find_one({"id": u["id"]})
    free_card_used = user.get("free_card_used", False)
    
    # Check if this is a paid card
    if free_card_used:
        price, price_currency = get_virtual_card_price(user.get("country", "CD"))
        
        # Check user's wallet balance
        wallet = await db.wallets.find_one({"user_id": u["id"], "currency": price_currency})
        if not wallet:
            # Try to find any wallet
            wallet = await db.wallets.find_one({"user_id": u["id"], "is_primary": True})
            if wallet:
                # Convert price to wallet's currency
                from_cur = await db.currencies.find_one({"code": price_currency})
                to_cur = await db.currencies.find_one({"code": wallet["currency"]})
                from_rate = from_cur["rate_to_usd"] if from_cur else 1.0
                to_rate = to_cur["rate_to_usd"] if to_cur else 1.0
                price = (price / from_rate) * to_rate
                price_currency = wallet["currency"]
        
        if not wallet or wallet["balance"] < price:
            raise HTTPException(400, f"Solde insuffisant. Prix de la carte: {price} {price_currency}")
        
        # Deduct payment
        await db.wallets.update_one({"id": wallet["id"]}, {"$inc": {"balance": -price}})
        
        # Record transaction
        await db.transactions.insert_one({
            "id": gen_id(),
            "user_id": u["id"],
            "type": "card_purchase",
            "amount": price,
            "currency": price_currency,
            "description": f"Achat carte virtuelle: {req.name}",
            "status": "completed",
            "created_at": now_iso()
        })
    else:
        # Mark free card as used
        await db.users.update_one({"id": u["id"]}, {"$set": {"free_card_used": True}})
    
    barcode = gen_barcode()
    doc = {
        "id": gen_id(),
        "user_id": u["id"],
        "owner_name": u["name"],
        "name": req.name,
        "barcode": barcode,
        "nfc_code": None,  # Will be set when physical card is created
        "currency": req.currency.upper(),
        "balance": 0.0,
        "limit": req.limit,
        "can_send": req.can_send,
        "can_receive": req.can_receive,
        "auto_recharge": req.auto_recharge,
        "auto_recharge_amount": req.auto_recharge_amount,
        "auto_recharge_frequency": req.auto_recharge_frequency,
        "last_auto_recharge": None,
        "status": "pending",  # pending, approved, stopped, deleted
        "is_locked": False,
        "is_physical": False,
        "is_free": not free_card_used,  # Track if this was the free card
        "approved_by": None,
        "approved_at": None,
        "delete_votes": [],  # List of admin IDs who voted for deletion
        "created_at": now_iso()
    }
    await db.virtual_cards.insert_one(doc)
    
    # Notify admins
    admins = await db.users.find({"role": "admin"}, {"id": 1}).to_list(100)
    for admin in admins:
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": admin["id"],
            "message": f"Nouvelle carte virtuelle '{req.name}' en attente d'approbation",
            "type": "card_approval_request",
            "data": {"card_id": doc["id"]},
            "is_read": False,
            "created_at": now_iso()
        })
    
    doc.pop("_id", None)
    return {"card": doc, "message": "Carte créée gratuitement!" if not free_card_used else "Carte créée. En attente d'approbation."}

@router.patch("/virtual-cards/{card_id}")
async def update_virtual_card(card_id: str, req: VirtualCardUpdateReq, u=Depends(get_current_user)):
    card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card:
        raise HTTPException(404, "Carte virtuelle non trouvée")
    
    update = {}
    if req.name is not None:
        update["name"] = req.name
    if req.is_locked is not None:
        update["is_locked"] = req.is_locked
    if req.can_send is not None:
        update["can_send"] = req.can_send
    if req.can_receive is not None:
        update["can_receive"] = req.can_receive
    if req.auto_recharge is not None:
        update["auto_recharge"] = req.auto_recharge
    if req.auto_recharge_amount is not None:
        update["auto_recharge_amount"] = req.auto_recharge_amount
    if req.auto_recharge_frequency is not None:
        update["auto_recharge_frequency"] = req.auto_recharge_frequency
    
    if update:
        update["updated_at"] = now_iso()
        await db.virtual_cards.update_one({"id": card_id}, {"$set": update})
    
    return {"message": "Carte mise à jour"}

@router.post("/virtual-cards/{card_id}/transfer")
async def transfer_to_virtual_card(card_id: str, amount: float, u=Depends(get_current_user)):
    card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card:
        raise HTTPException(404, "Carte virtuelle non trouvée")
    if card.get("status") != "approved":
        raise HTTPException(400, "Cette carte n'est pas encore approuvée")
    if card.get("is_locked"):
        raise HTTPException(400, "Cette carte est verrouillée")
    
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": card["currency"]})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(400, "Solde insuffisant")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": card["currency"]}, {"$inc": {"balance": -amount}})
    await db.virtual_cards.update_one({"id": card_id}, {"$inc": {"balance": amount}})
    
    return {"message": f"{amount} {card['currency']} transféré vers {card['name']}", "new_balance": card["balance"] + amount}

@router.post("/virtual-cards/{card_id}/withdraw")
async def withdraw_from_virtual_card(card_id: str, amount: float, u=Depends(get_current_user)):
    card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card:
        raise HTTPException(404, "Carte virtuelle non trouvée")
    if card.get("status") != "approved":
        raise HTTPException(400, "Cette carte n'est pas encore approuvée")
    if card.get("is_locked"):
        raise HTTPException(400, "Cette carte est verrouillée")
    if card["balance"] < amount:
        raise HTTPException(400, "Solde insuffisant sur la carte")
    
    await db.virtual_cards.update_one({"id": card_id}, {"$inc": {"balance": -amount}})
    await db.wallets.update_one({"user_id": u["id"], "currency": card["currency"]}, {"$inc": {"balance": amount}})
    
    return {"message": f"{amount} {card['currency']} retiré de {card['name']}", "new_balance": card["balance"] - amount}

# Barcode transactions
@router.get("/virtual-cards/barcode/{barcode}")
async def get_card_by_barcode(barcode: str):
    """Get card info by barcode for transactions"""
    card = await db.virtual_cards.find_one({"barcode": barcode, "status": "approved"}, {"_id": 0, "delete_votes": 0})
    if not card:
        raise HTTPException(404, "Carte non trouvée ou non active")
    return {"card_name": card["name"], "owner_name": card["owner_name"], "currency": card["currency"], "can_receive": card["can_receive"]}

@router.post("/virtual-cards/barcode/send")
async def send_via_barcode(sender_barcode: str, receiver_barcode: str, amount: float, u=Depends(get_current_user)):
    """Send money from one virtual card to another via barcode"""
    sender_card = await db.virtual_cards.find_one({"barcode": sender_barcode, "user_id": u["id"]})
    if not sender_card:
        raise HTTPException(404, "Carte émettrice non trouvée")
    if sender_card.get("status") != "approved":
        raise HTTPException(400, "Carte émettrice non approuvée")
    if not sender_card.get("can_send"):
        raise HTTPException(400, "Cette carte ne peut pas envoyer d'argent")
    if sender_card.get("is_locked"):
        raise HTTPException(400, "Carte émettrice verrouillée")
    if sender_card["balance"] < amount:
        raise HTTPException(400, "Solde insuffisant sur la carte")
    
    receiver_card = await db.virtual_cards.find_one({"barcode": receiver_barcode, "status": "approved"})
    if not receiver_card:
        raise HTTPException(404, "Carte destinataire non trouvée")
    if not receiver_card.get("can_receive"):
        raise HTTPException(400, "Cette carte ne peut pas recevoir d'argent")
    if receiver_card.get("is_locked"):
        raise HTTPException(400, "Carte destinataire verrouillée")
    
    if sender_card["currency"] != receiver_card["currency"]:
        raise HTTPException(400, "Les cartes doivent avoir la même devise")
    
    # Process transfer
    await db.virtual_cards.update_one({"barcode": sender_barcode}, {"$inc": {"balance": -amount}})
    await db.virtual_cards.update_one({"barcode": receiver_barcode}, {"$inc": {"balance": amount}})
    
    # Record transaction
    n = now_iso()
    await db.transactions.insert_one({
        "id": gen_id(),
        "sender_id": u["id"],
        "sender_name": sender_card["name"],
        "sender_phone": sender_barcode,
        "receiver_id": receiver_card["user_id"],
        "receiver_name": receiver_card["name"],
        "receiver_phone": receiver_barcode,
        "amount": amount,
        "fee": 0,
        "currency": sender_card["currency"],
        "type": "card_to_card",
        "status": "completed",
        "description": f"Transfert carte {sender_card['name']} → {receiver_card['name']}",
        "created_at": n,
        "completed_at": n
    })
    
    return {"message": f"{amount} {sender_card['currency']} envoyé", "receiver": receiver_card["name"]}

@router.post("/virtual-cards/barcode/receive")
async def receive_via_barcode(barcode: str, amount: float, currency: str = "USD", u=Depends(get_current_user)):
    """Receive money to a virtual card from user's wallet"""
    card = await db.virtual_cards.find_one({"barcode": barcode, "status": "approved"})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    if not card.get("can_receive"):
        raise HTTPException(400, "Cette carte ne peut pas recevoir d'argent")
    
    wallet = await db.wallets.find_one({"user_id": u["id"], "currency": card["currency"]})
    if not wallet or wallet["balance"] < amount:
        raise HTTPException(400, "Solde insuffisant")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": card["currency"]}, {"$inc": {"balance": -amount}})
    await db.virtual_cards.update_one({"barcode": barcode}, {"$inc": {"balance": amount}})
    
    return {"message": f"{amount} {card['currency']} crédité sur {card['name']}"}

@router.delete("/virtual-cards/{card_id}")
async def request_delete_virtual_card(card_id: str, u=Depends(get_current_user)):
    """User requests deletion - needs 3 admin approvals"""
    card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
    if not card:
        raise HTTPException(404, "Carte virtuelle non trouvée")
    
    if card["balance"] > 0:
        # Transfer remaining balance back to wallet
        await db.wallets.update_one({"user_id": u["id"], "currency": card["currency"]}, {"$inc": {"balance": card["balance"]}})
        await db.virtual_cards.update_one({"id": card_id}, {"$set": {"balance": 0}})
    
    # Mark for deletion (needs admin approval)
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {"status": "pending_deletion", "deletion_requested_at": now_iso()}})
    
    # Notify admins
    admins = await db.users.find({"role": "admin"}, {"id": 1}).to_list(100)
    for admin in admins:
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": admin["id"],
            "message": f"Demande de suppression de carte '{card['name']}'",
            "type": "card_deletion_request",
            "data": {"card_id": card_id},
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {"message": "Demande de suppression envoyée. 3 administrateurs doivent approuver.", "refunded": card["balance"]}


# === ADMIN VIRTUAL CARDS MANAGEMENT ===
@router.get("/admin/virtual-cards")
async def admin_get_virtual_cards(status: str = "", page: int = 1, limit: int = 20, country: str = "", adm=Depends(get_admin)):
    """Get virtual cards filtered by admin's assigned countries"""
    skip = (page - 1) * limit
    
    # Get admin's country restrictions
    admin_countries = get_admin_country_filter(adm)
    
    # Build query - need to filter cards by owner's country
    q = {}
    if status:
        q["status"] = status
    
    # If admin has country restrictions, filter by card owner's country
    if admin_countries or country:
        # Get user IDs for allowed countries
        user_country_q = build_country_query(adm, country, "country")
        if user_country_q.get("__forbidden__"):
            return {"cards": [], "total": 0, "page": page, "access_denied": True}
        
        allowed_user_ids = []
        async for u in db.users.find(user_country_q, {"id": 1, "_id": 0}):
            allowed_user_ids.append(u["id"])
        
        # Include standalone cards (no user_id) for country-specific requests only if admin has access
        if country:
            q["$or"] = [{"user_id": {"$in": allowed_user_ids}}, {"user_id": None, "is_standalone": True}]
        elif admin_countries:
            q["$or"] = [{"user_id": {"$in": allowed_user_ids}}, {"user_id": None, "is_standalone": True}]
    
    total = await db.virtual_cards.count_documents(q)
    cards = await db.virtual_cards.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Add owner country info to each card
    for card in cards:
        if card.get("user_id"):
            owner = await db.users.find_one({"id": card["user_id"]}, {"country": 1, "_id": 0})
            card["owner_country"] = owner.get("country") if owner else None
    
    return {"cards": cards, "total": total, "page": page, "admin_countries": admin_countries if admin_countries else "all"}

@router.patch("/admin/virtual-cards/{card_id}/approve")
async def admin_approve_card(card_id: str, adm=Depends(get_admin)):
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    if card["status"] != "pending":
        raise HTTPException(400, f"Carte déjà {card['status']}")
    
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {
        "status": "approved",
        "approved_by": adm["id"],
        "approved_at": now_iso()
    }})
    
    # Notify owner
    if card.get("user_id"):
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": card["user_id"],
            "message": f"Votre carte '{card['name']}' a été approuvée",
            "type": "card_approved",
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {"message": "Carte approuvée"}

@router.patch("/admin/virtual-cards/{card_id}/stop")
async def admin_stop_card(card_id: str, adm=Depends(get_admin)):
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {"status": "stopped", "stopped_by": adm["id"], "stopped_at": now_iso()}})
    
    # Notify owner
    if card.get("user_id"):
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": card["user_id"],
            "message": f"Votre carte '{card['name']}' a été stoppée par un administrateur",
            "type": "card_stopped",
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {"message": "Carte stoppée"}

@router.patch("/admin/virtual-cards/{card_id}/reactivate")
async def admin_reactivate_card(card_id: str, adm=Depends(get_admin)):
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {"status": "approved"}})
    return {"message": "Carte réactivée"}

@router.post("/admin/virtual-cards/{card_id}/delete-vote")
async def admin_vote_delete_card(card_id: str, vote: str, adm=Depends(get_admin)):
    """Admin votes to delete a card (needs 3 approvals)"""
    if adm.get("role") != "admin":
        raise HTTPException(403, "Seuls les administrateurs peuvent voter")
    
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    if vote == "approve":
        # Add vote
        if adm["id"] in card.get("delete_votes", []):
            raise HTTPException(400, "Vous avez déjà voté")
        
        await db.virtual_cards.update_one({"id": card_id}, {"$push": {"delete_votes": adm["id"]}})
        
        # Check if 3 votes reached
        updated_card = await db.virtual_cards.find_one({"id": card_id})
        if len(updated_card.get("delete_votes", [])) >= 3:
            # Transfer any remaining balance
            if updated_card["balance"] > 0 and updated_card.get("user_id"):
                await db.wallets.update_one(
                    {"user_id": updated_card["user_id"], "currency": updated_card["currency"]},
                    {"$inc": {"balance": updated_card["balance"]}}
                )
            # Delete the card
            await db.virtual_cards.delete_one({"id": card_id})
            return {"message": "Carte supprimée (3 votes atteints)"}
        
        return {"message": f"Vote enregistré ({len(updated_card.get('delete_votes', []))}/3)"}
    else:
        return {"message": "Vote rejeté"}

@router.post("/admin/virtual-cards/{card_id}/make-physical")
async def admin_make_physical_card(card_id: str, adm=Depends(get_admin)):
    """Convert virtual card to physical NFC card"""
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    if card.get("is_physical"):
        raise HTTPException(400, "Cette carte est déjà physique")
    
    nfc_code = gen_nfc_code()
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {
        "is_physical": True,
        "nfc_code": nfc_code,
        "physical_created_by": adm["id"],
        "physical_created_at": now_iso()
    }})
    
    # Notify owner
    if card.get("user_id"):
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": card["user_id"],
            "message": f"Votre carte '{card['name']}' a été convertie en carte physique NFC",
            "type": "card_physical",
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {"message": "Carte physique créée", "nfc_code": nfc_code, "barcode": card["barcode"]}


@router.patch("/admin/virtual-cards/{card_id}/nfc")
async def admin_associate_nfc(card_id: str, req: NFCAssociationReq, adm=Depends(get_admin)):
    """Associate NFC serial number to a virtual card and generate printed card number"""
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    # Validate NFC serial format
    if not validate_nfc_serial(req.nfc_serial_number):
        raise HTTPException(400, "Format du numéro de série NFC invalide. Format attendu: 05:G8:5F:54:22:75:Y5")
    
    # Check if NFC serial is already used
    existing = await db.virtual_cards.find_one({"nfc_serial_number": req.nfc_serial_number.upper()})
    if existing:
        raise HTTPException(400, "Ce numéro de série NFC est déjà associé à une autre carte")
    
    # Generate printed card number (16 digits)
    printed_card_number = gen_printed_card_number()
    
    # Ensure uniqueness
    while await db.virtual_cards.find_one({"printed_card_number": printed_card_number}):
        printed_card_number = gen_printed_card_number()
    
    await db.virtual_cards.update_one({"id": card_id}, {"$set": {
        "nfc_serial_number": req.nfc_serial_number.upper(),
        "printed_card_number": printed_card_number,
        "is_physical": True,
        "nfc_associated_by": adm["id"],
        "nfc_associated_at": now_iso()
    }})
    
    # Notify owner if exists
    if card.get("user_id"):
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": card["user_id"],
            "message": f"Une carte NFC physique a été associée à votre carte '{card['name']}'",
            "type": "card_nfc_associated",
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {
        "message": "NFC associé avec succès",
        "card_id": card_id,
        "nfc_serial_number": req.nfc_serial_number.upper(),
        "printed_card_number": printed_card_number,
        "barcode": card["barcode"]
    }


@router.post("/admin/virtual-cards/standalone")
async def admin_create_standalone_card(req: StandaloneCardReq, adm=Depends(get_admin)):
    """Create a standalone virtual card (without user account)"""
    barcode = gen_barcode()
    nfc_code = gen_nfc_code()
    
    # Validate NFC serial if provided
    nfc_serial = None
    printed_card_number = None
    if req.nfc_serial_number:
        if not validate_nfc_serial(req.nfc_serial_number):
            raise HTTPException(400, "Format du numéro de série NFC invalide")
        existing = await db.virtual_cards.find_one({"nfc_serial_number": req.nfc_serial_number.upper()})
        if existing:
            raise HTTPException(400, "Ce numéro de série NFC est déjà utilisé")
        nfc_serial = req.nfc_serial_number.upper()
        printed_card_number = gen_printed_card_number()
        while await db.virtual_cards.find_one({"printed_card_number": printed_card_number}):
            printed_card_number = gen_printed_card_number()
    
    doc = {
        "id": gen_id(),
        "user_id": None,  # No user associated
        "owner_name": None,
        "name": req.name,
        "barcode": barcode,
        "nfc_code": nfc_code,
        "nfc_serial_number": nfc_serial,
        "printed_card_number": printed_card_number,
        "currency": req.currency.upper(),
        "balance": req.initial_balance,
        "limit": req.limit,
        "can_send": True,
        "can_receive": True,
        "auto_recharge": False,
        "status": "approved",  # Auto-approved for standalone
        "is_locked": False,
        "is_physical": nfc_serial is not None,
        "is_standalone": True,
        "created_by_admin": adm["id"],
        "created_at": now_iso()
    }
    await db.virtual_cards.insert_one(doc)
    doc.pop("_id", None)
    
    return {
        "message": "Carte standalone créée",
        "card": doc,
        "info": "Cette carte peut être rechargée et utilisée sans compte. Le numéro imprimé permet de l'associer lors de la création d'un compte."
    }


@router.get("/admin/virtual-cards/standalone")
async def admin_get_standalone_cards(page: int = 1, limit: int = 20, adm=Depends(get_admin)):
    """Get all standalone cards (without user accounts)"""
    skip = (page - 1) * limit
    q = {"is_standalone": True}
    total = await db.virtual_cards.count_documents(q)
    cards = await db.virtual_cards.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"cards": cards, "total": total, "page": page}


@router.post("/admin/recharge-request")
async def manager_recharge_request(req: ManagerRechargeReq, adm=Depends(get_admin)):
    """Manager requests a recharge for a client (requires zone admin approval)"""
    # Find the target user
    target_user = await db.users.find_one({"phone": req.user_phone})
    if not target_user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check if manager has permission for this country
    if adm.get("assigned_countries") and len(adm["assigned_countries"]) > 0:
        if target_user.get("country") not in adm["assigned_countries"]:
            raise HTTPException(403, f"Vous n'avez pas accès aux utilisateurs de {target_user.get('country')}")
    
    # Check if manager can do recharges
    if adm.get("assigned_transaction_types") and len(adm["assigned_transaction_types"]) > 0:
        if "recharge" not in adm["assigned_transaction_types"]:
            raise HTTPException(403, "Vous n'avez pas la permission de faire des rechargements")
    
    # Create pending recharge transaction
    tx_id = gen_id()
    n = now_iso()
    await db.transactions.insert_one({
        "id": tx_id,
        "sender_id": None,
        "sender_name": f"Gestionnaire: {adm['name']}",
        "sender_phone": adm["phone"],
        "receiver_id": target_user["id"],
        "receiver_name": target_user["name"],
        "receiver_phone": target_user["phone"],
        "amount": req.amount,
        "fee": 0.0,
        "currency": req.currency,
        "type": "manager_recharge",
        "status": "pending",
        "description": req.note or f"Rechargement par gestionnaire ({req.method})",
        "created_at": n,
        "completed_at": None,
        "admin_note": None,
        "requested_by": adm["id"],
        "requires_zone_admin_approval": True
    })
    
    # Notify zone admins
    zone_admins = await db.users.find({
        "role": "admin",
        "$or": [
            {"assigned_countries": {"$size": 0}},  # Super admin (no restrictions)
            {"assigned_countries": target_user.get("country")}
        ]
    }).to_list(100)
    
    for zone_admin in zone_admins:
        if zone_admin["id"] != adm["id"]:
            await db.notifications.insert_one({
                "id": gen_id(),
                "user_id": zone_admin["id"],
                "type": "manager_recharge_request",
                "title": "Demande de rechargement",
                "message": f"{adm['name']} demande un rechargement de {req.amount} {req.currency} pour {target_user['name']}",
                "data": {"transaction_id": tx_id, "amount": req.amount, "currency": req.currency},
                "is_read": False,
                "created_at": n
            })
    
    return {
        "message": "Demande de rechargement envoyée",
        "transaction_id": tx_id,
        "status": "pending",
        "requires_approval": True
    }


@router.get("/admin/virtual-cards/{card_id}")
async def admin_get_card_details(card_id: str, adm=Depends(get_admin)):
    """Get detailed info about a virtual card"""
    card = await db.virtual_cards.find_one({"id": card_id}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Carte non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    # Get owner info if exists
    owner = None
    if card.get("user_id"):
        owner = await db.users.find_one({"id": card["user_id"]}, {"_id": 0, "password": 0, "transaction_pin": 0})
    
    return {**card, "owner": owner}


@router.post("/admin/virtual-cards/scan-nfc")
async def admin_scan_nfc(nfc_code: str, adm=Depends(get_admin)):
    """Scan NFC code to get card info"""
    card = await db.virtual_cards.find_one({"nfc_code": nfc_code}, {"_id": 0})
    if not card:
        raise HTTPException(404, "Carte NFC non trouvée")
    
    # Check admin access
    if not await check_admin_card_access(adm, card, db):
        raise HTTPException(403, "Vous n'avez pas accès à cette carte")
    
    return card


