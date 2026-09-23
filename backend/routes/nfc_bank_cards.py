"""
Monity World - NFC & Bank Cards Routes
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
from utils.helpers import validate_nfc_serial
from utils.admin_helpers import get_admin_country_filter, build_country_query, build_transaction_country_query, check_admin_card_access
from utils.auth import is_admin_role, can_access_admin_routes, requires_admin_kyc
from rbac import (
    check_permission, get_role_info, get_role_level,
    is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role,
    has_permission, require_permission
)
from models.schemas import NFCCardCreateReq, NFCSubscriptionRenewReq, NFCSubscriptionFeeReq, BankCardAddReq, BankCardAdminActionReq

logger = logging.getLogger(__name__)
from utils.activity import log_admin_activity, ACTIVITY_ACTIONS, ACTIVITY_RESOURCES

router = APIRouter(prefix="/api", tags=['NFC & Bank Cards'])

# === NFC CARD VALIDITY & SUBSCRIPTION SYSTEM ===

def generate_card_pin():
    """Generate 4-digit PIN for NFC card"""
    return ''.join(random.choices(string.digits, k=4))


def calculate_card_expiry():
    """Calculate card expiry date (3 years from now)"""
    expiry = datetime.now(timezone.utc) + timedelta(days=3*365)
    return expiry.strftime("%m/%Y")


def calculate_subscription_expiry():
    """Calculate subscription expiry date (1 year from now)"""
    return (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()


def is_card_expired(expiry_date_str: str) -> bool:
    """Check if card is expired (MM/YYYY format)"""
    try:
        month, year = expiry_date_str.split("/")
        expiry = datetime(int(year), int(month), 1, tzinfo=timezone.utc)
        # Card expires at the end of the month
        if int(month) == 12:
            expiry = datetime(int(year) + 1, 1, 1, tzinfo=timezone.utc)
        else:
            expiry = datetime(int(year), int(month) + 1, 1, tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= expiry
    except Exception:
        return False


def is_subscription_expired(expiry_iso: str) -> bool:
    """Check if subscription is expired"""
    try:
        expiry = datetime.fromisoformat(expiry_iso.replace('Z', '+00:00'))
        return datetime.now(timezone.utc) >= expiry
    except Exception:
        return True


@router.post("/admin/nfc-cards/create")
async def admin_create_nfc_card(req: NFCCardCreateReq, adm=Depends(get_admin_with_kyc)):
    """Create NFC card with validity dates and PIN"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut creer des cartes NFC")
    
    # Validate PIN
    if not req.card_pin or len(req.card_pin) != 4 or not req.card_pin.isdigit():
        raise HTTPException(400, "Le PIN doit etre un code a 4 chiffres")
    
    # Validate NFC serial if provided
    nfc_serial = None
    printed_card_number = None
    if req.nfc_serial_number:
        if not validate_nfc_serial(req.nfc_serial_number):
            raise HTTPException(400, "Format du numero de serie NFC invalide")
        existing = await db.virtual_cards.find_one({"nfc_serial_number": req.nfc_serial_number.upper()})
        if existing:
            raise HTTPException(400, "Ce numero de serie NFC est deja utilise")
        nfc_serial = req.nfc_serial_number.upper()
        printed_card_number = gen_printed_card_number()
        while await db.virtual_cards.find_one({"printed_card_number": printed_card_number}):
            printed_card_number = gen_printed_card_number()
    
    # Get subscription fee for this card type
    sub_fee = await db.nfc_subscription_fees.find_one({
        "card_type": req.nfc_card_type,
        "is_active": True
    })
    annual_fee = sub_fee["annual_fee"] if sub_fee else 10.0  # Default $10/year
    fee_currency = sub_fee["currency"] if sub_fee else "USD"
    
    barcode = gen_barcode()
    nfc_code = gen_nfc_code()
    
    doc = {
        "id": gen_id(),
        "user_id": None,
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
        "status": "approved",
        "is_locked": False,
        "is_physical": nfc_serial is not None,
        "is_standalone": True,
        "nfc_card_type": req.nfc_card_type,
        # Validity dates
        "card_pin": req.card_pin,
        "card_expiry_date": calculate_card_expiry(),  # MM/YYYY - 3 years
        "card_expired": False,
        # Subscription
        "subscription_expiry": calculate_subscription_expiry(),  # 1 year
        "subscription_active": True,
        "subscription_fee": annual_fee,
        "subscription_currency": fee_currency,
        "last_subscription_payment": now_iso(),
        # Metadata
        "created_by_admin": adm["id"],
        "created_at": now_iso()
    }
    
    await db.virtual_cards.insert_one(doc)
    await log_admin_activity(adm, "create", "virtual_card", doc["id"], {"action": "nfc_card_create", "type": req.nfc_card_type})
    
    doc.pop("_id", None)
    return {
        "message": "Carte NFC creee avec succes",
        "card": doc,
        "validity": {
            "card_expiry": doc["card_expiry_date"],
            "subscription_expiry": doc["subscription_expiry"][:10],
            "annual_fee": f"{annual_fee} {fee_currency}"
        }
    }


@router.get("/admin/nfc-subscription-fees")
async def get_nfc_subscription_fees(adm=Depends(get_admin)):
    """Get all NFC subscription fees"""
    fees = await db.nfc_subscription_fees.find({}, {"_id": 0}).to_list(50)
    return {"fees": fees}


@router.post("/admin/nfc-subscription-fees")
async def set_nfc_subscription_fee(req: NFCSubscriptionFeeReq, adm=Depends(get_admin_with_kyc)):
    """Set subscription fee for NFC card type"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut definir les frais")
    
    fee_data = {
        "country_code": req.country_code.upper(),
        "card_type": req.card_type,
        "annual_fee": req.annual_fee,
        "currency": req.currency.upper(),
        "is_active": req.is_active,
        "updated_at": now_iso(),
        "updated_by": adm["id"]
    }
    
    await db.nfc_subscription_fees.update_one(
        {"country_code": req.country_code.upper(), "card_type": req.card_type},
        {"$set": fee_data, "$setOnInsert": {"id": gen_id(), "created_at": now_iso()}},
        upsert=True
    )
    
    await log_admin_activity(adm, "update", "settings", details={"action": "nfc_subscription_fee", "card_type": req.card_type, "fee": req.annual_fee})
    return {"message": "Frais d'abonnement mis a jour"}


@router.post("/admin/nfc-cards/{card_id}/renew-subscription")
async def admin_renew_nfc_subscription(card_id: str, adm=Depends(get_admin_with_kyc)):
    """Renew NFC card subscription (1 year)"""
    card = await db.virtual_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvee")
    
    if card.get("card_expired"):
        raise HTTPException(400, "Cette carte est expiree (validite 3 ans depassee). Elle ne peut pas etre renouvelee.")
    
    new_expiry = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    
    await db.virtual_cards.update_one(
        {"id": card_id},
        {"$set": {
            "subscription_expiry": new_expiry,
            "subscription_active": True,
            "last_subscription_payment": now_iso()
        }}
    )
    
    await log_admin_activity(adm, "update", "virtual_card", card_id, {"action": "subscription_renewed"})
    return {"message": "Abonnement renouvele pour 1 an", "new_expiry": new_expiry[:10]}


@router.get("/admin/nfc-cards/expired")
async def get_expired_nfc_cards(adm=Depends(get_admin)):
    """Get all expired or soon-to-expire NFC cards"""
    now = datetime.now(timezone.utc)
    thirty_days = (now + timedelta(days=30)).isoformat()
    
    # Cards with expired subscriptions
    expired_subs = await db.virtual_cards.find({
        "is_standalone": True,
        "$or": [
            {"subscription_active": False},
            {"subscription_expiry": {"$lt": now.isoformat()}}
        ]
    }, {"_id": 0}).to_list(100)
    
    # Cards expiring soon (subscription)
    expiring_soon = await db.virtual_cards.find({
        "is_standalone": True,
        "subscription_active": True,
        "subscription_expiry": {"$gte": now.isoformat(), "$lte": thirty_days}
    }, {"_id": 0}).to_list(100)
    
    # Cards with expired validity (3 years)
    card_expired = await db.virtual_cards.find({
        "is_standalone": True,
        "card_expired": True
    }, {"_id": 0}).to_list(100)
    
    return {
        "expired_subscriptions": expired_subs,
        "expiring_soon": expiring_soon,
        "card_validity_expired": card_expired,
        "counts": {
            "expired_subscriptions": len(expired_subs),
            "expiring_soon": len(expiring_soon),
            "card_validity_expired": len(card_expired)
        }
    }


@router.post("/nfc-cards/verify-pin")
async def verify_nfc_card_pin(card_number: str, pin: str):
    """Verify NFC card PIN for transactions"""
    card = await db.virtual_cards.find_one({
        "$or": [
            {"printed_card_number": card_number},
            {"nfc_serial_number": card_number.upper()},
            {"barcode": card_number}
        ]
    })
    
    if not card:
        raise HTTPException(404, "Carte non trouvee")
    
    # Check card validity (3 years)
    if card.get("card_expired") or is_card_expired(card.get("card_expiry_date", "")):
        await db.virtual_cards.update_one({"id": card["id"]}, {"$set": {"card_expired": True, "status": "suspended"}})
        raise HTTPException(403, "Carte expiree. Validite de 3 ans depassee.")
    
    # Check subscription
    if not card.get("subscription_active") or is_subscription_expired(card.get("subscription_expiry", "")):
        await db.virtual_cards.update_one({"id": card["id"]}, {"$set": {"subscription_active": False}})
        raise HTTPException(403, "Abonnement expire. Veuillez renouveler votre abonnement annuel.")
    
    # Verify PIN
    if card.get("card_pin") != pin:
        raise HTTPException(401, "PIN incorrect")
    
    return {"valid": True, "card_id": card["id"], "balance": card.get("balance", 0), "currency": card.get("currency")}


# === EXTERNAL BANK CARDS (VISA/MASTERCARD) ===

def mask_card_number(card_number: str) -> str:
    """Mask card number: **** **** **** 1234"""
    clean = card_number.replace(" ", "").replace("-", "")
    if len(clean) < 4:
        return "****"
    return f"**** **** **** {clean[-4:]}"


def detect_card_type(card_number: str) -> str:
    """Detect card type from number"""
    clean = card_number.replace(" ", "").replace("-", "")
    if clean.startswith("4"):
        return "visa"
    elif clean.startswith(("51", "52", "53", "54", "55")) or (2221 <= int(clean[:4]) <= 2720):
        return "mastercard"
    return "unknown"


@router.post("/bank-cards")
async def add_bank_card(req: BankCardAddReq, u=Depends(get_current_user)):
    """Add external bank card (VISA/MasterCard)"""
    # Validate card number (basic Luhn check)
    clean_number = req.card_number.replace(" ", "").replace("-", "")
    if len(clean_number) < 13 or len(clean_number) > 19:
        raise HTTPException(400, "Numero de carte invalide")
    
    # Check card type
    detected_type = detect_card_type(clean_number)
    if detected_type == "unknown":
        raise HTTPException(400, "Type de carte non supporte. Seules les cartes VISA et MasterCard sont acceptees.")
    
    # Validate expiry
    now = datetime.now(timezone.utc)
    if req.expiry_year < now.year or (req.expiry_year == now.year and req.expiry_month < now.month):
        raise HTTPException(400, "Carte expiree")
    
    # Check if card already exists for this user
    existing = await db.bank_cards.find_one({
        "user_id": u["id"],
        "last_4_digits": clean_number[-4:]
    })
    if existing:
        raise HTTPException(400, "Cette carte est deja enregistree")
    
    card_doc = {
        "id": gen_id(),
        "user_id": u["id"],
        "card_type": detected_type,
        "last_4_digits": clean_number[-4:],
        "masked_number": mask_card_number(clean_number),
        "holder_name": req.holder_name.upper(),
        "expiry_month": req.expiry_month,
        "expiry_year": req.expiry_year,
        "billing_address": req.billing_address,
        # Status
        "status": "pending",  # pending, approved, rejected
        "is_verified": False,
        "can_deposit": False,  # Recharge compte
        "can_withdraw": False,  # Retrait vers carte
        "verification_note": None,
        "verified_by": None,
        "verified_at": None,
        "created_at": now_iso()
    }
    
    await db.bank_cards.insert_one(card_doc)
    card_doc.pop("_id", None)
    
    # Notify admins
    admins = await db.users.find({"role": {"$in": ["admin", "primary_admin"]}}, {"id": 1}).to_list(10)
    for admin in admins:
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": admin["id"],
            "type": "bank_card_verification",
            "title": "Nouvelle carte bancaire",
            "message": f"{u['name']} a ajoute une carte {detected_type.upper()} (*{clean_number[-4:]})",
            "data": {"card_id": card_doc["id"], "user_id": u["id"]},
            "is_read": False,
            "created_at": now_iso()
        })
    
    return {
        "message": "Carte ajoutee. En attente de verification par l'administrateur.",
        "card": {
            "id": card_doc["id"],
            "type": card_doc["card_type"],
            "masked_number": card_doc["masked_number"],
            "status": card_doc["status"]
        }
    }


@router.get("/bank-cards")
async def get_my_bank_cards(u=Depends(get_current_user)):
    """Get user's bank cards"""
    cards = await db.bank_cards.find({"user_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {"cards": cards}


@router.delete("/bank-cards/{card_id}")
async def delete_bank_card(card_id: str, u=Depends(get_current_user)):
    """Delete a bank card"""
    result = await db.bank_cards.delete_one({"id": card_id, "user_id": u["id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Carte non trouvee")
    return {"message": "Carte supprimee"}


@router.get("/admin/bank-cards")
async def admin_get_bank_cards(
    status: str = None,
    page: int = 1,
    limit: int = 20,
    adm=Depends(get_admin)
):
    """Admin: Get all bank cards"""
    query = {}
    if status:
        query["status"] = status
    
    skip = (page - 1) * limit
    total = await db.bank_cards.count_documents(query)
    cards = await db.bank_cards.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with user info
    for card in cards:
        user = await db.users.find_one({"id": card["user_id"]}, {"name": 1, "phone": 1, "email": 1})
        if user:
            card["user_name"] = user.get("name")
            card["user_phone"] = user.get("phone")
    
    return {"cards": cards, "total": total, "page": page, "pages": -(-total // limit)}


@router.post("/admin/bank-cards/{card_id}/action")
async def admin_bank_card_action(card_id: str, req: BankCardAdminActionReq, adm=Depends(get_admin_with_kyc)):
    """Admin: Approve/Reject bank card or enable/disable withdrawal"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut gerer les cartes bancaires")
    
    card = await db.bank_cards.find_one({"id": card_id})
    if not card:
        raise HTTPException(404, "Carte non trouvee")
    
    update = {"updated_at": now_iso()}
    message = ""
    
    if req.action == "approve":
        update["status"] = "approved"
        update["is_verified"] = True
        update["can_deposit"] = True
        update["verified_by"] = adm["id"]
        update["verified_at"] = now_iso()
        update["verification_note"] = req.note
        message = "Carte approuvee pour les depots"
    
    elif req.action == "reject":
        update["status"] = "rejected"
        update["is_verified"] = False
        update["verification_note"] = req.note
        message = "Carte rejetee"
    
    elif req.action == "enable_withdrawal":
        if card.get("status") != "approved":
            raise HTTPException(400, "La carte doit d'abord etre approuvee")
        update["can_withdraw"] = True
        message = "Retraits actives pour cette carte"
    
    elif req.action == "disable_withdrawal":
        update["can_withdraw"] = False
        message = "Retraits desactives pour cette carte"
    
    else:
        raise HTTPException(400, "Action invalide")
    
    await db.bank_cards.update_one({"id": card_id}, {"$set": update})
    await log_admin_activity(adm, req.action, "bank_card", card_id, {"card_last4": card["last_4_digits"], "note": req.note})
    
    # Notify user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": card["user_id"],
        "type": "bank_card_status",
        "title": f"Carte bancaire {req.action}",
        "message": f"Votre carte *{card['last_4_digits']} a ete {req.action}. {req.note or ''}",
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {"message": message}


# === MOBILE PAYMENT API INTEGRATION ===

@router.get("/admin/mobile-operators")
async def get_mobile_operators(country_code: str = None, adm=Depends(get_admin)):
    """Get configured mobile payment operators"""
