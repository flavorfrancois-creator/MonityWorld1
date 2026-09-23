"""
Monity World - Countries & Services Routes
Extracted from server.py during refactoring
"""
import os
import logging
import random
import string
import secrets
import base64
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
from models.schemas import CountryReq, CountryServicesUpdateReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=['Countries & Services'])

# === COUNTRIES ===
@router.get("/countries/db")
async def get_countries_from_db():
    return await db.countries.find({"is_active": True}, {"_id": 0}).to_list(200)

@router.get("/countries/all")
async def admin_get_all_countries(adm=Depends(get_admin)):
    return await db.countries.find({}, {"_id": 0}).to_list(200)

@router.get("/admin/countries")
async def admin_get_countries(adm=Depends(get_admin)):
    """Get all countries for admin dashboard"""
    countries = await db.countries.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"countries": countries}


@router.post("/admin/countries")
async def create_country(req: CountryReq, adm=Depends(get_admin)):
    existing = await db.countries.find_one({"code": req.code.upper()})
    if existing:
        raise HTTPException(400, "Ce pays existe déjà")
    doc = {
        "id": gen_id(),
        "code": req.code.upper(),
        "name": req.name,
        "dial_code": req.dial_code,
        "currency_code": req.currency_code.upper(),
        "flag": req.flag,
        "is_active": req.is_active,
        "created_at": now_iso()
    }
    await db.countries.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.patch("/admin/countries/{code}")
async def update_country(code: str, is_active: bool, adm=Depends(get_admin)):
    result = await db.countries.update_one(
        {"code": code.upper()},
        {"$set": {"is_active": is_active, "updated_at": now_iso()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Pays non trouvé")
    return {"message": f"Pays {'activé' if is_active else 'désactivé'}"}


# === COUNTRY SERVICE CONFIGURATION ===
    # National services
    send_national: Optional[bool] = None
    receive_national: Optional[bool] = None
    deposit: Optional[bool] = None
    withdrawal: Optional[bool] = None
    savings: Optional[bool] = None
    contribution: Optional[bool] = None  # Cotisation/Tontine
    currency_conversion: Optional[bool] = None
    
    # International services
    send_international: Optional[bool] = None
    receive_international: Optional[bool] = None
    withdrawal_international: Optional[bool] = None
    contribution_international: Optional[bool] = None
    
    # Cards
    virtual_cards: Optional[bool] = None


# Default services configuration
DEFAULT_COUNTRY_SERVICES = {
    "send_national": True,
    "receive_national": True,
    "deposit": True,
    "withdrawal": True,
    "savings": True,
    "contribution": True,
    "currency_conversion": True,
    "send_international": True,
    "receive_international": True,
    "withdrawal_international": True,
    "contribution_international": True,
    "virtual_cards": True,
}

SERVICE_LABELS = {
    "send_national": "Envoi national",
    "receive_national": "Réception nationale",
    "deposit": "Dépôt",
    "withdrawal": "Retrait",
    "savings": "Épargne",
    "contribution": "Cotisation/Tontine",
    "currency_conversion": "Conversion de devise",
    "send_international": "Envoi international",
    "receive_international": "Réception internationale",
    "withdrawal_international": "Retrait international",
    "contribution_international": "Cotisation internationale",
    "virtual_cards": "Cartes virtuelles",
}


@router.get("/admin/countries/{code}/services")
async def get_country_services(code: str, adm=Depends(get_admin)):
    """Get services configuration for a country"""
    country = await db.countries.find_one({"code": code.upper()}, {"_id": 0})
    if not country:
        raise HTTPException(404, "Pays non trouvé")
    
    # Get services or use defaults
    services = country.get("services", DEFAULT_COUNTRY_SERVICES.copy())
    
    return {
        "country": {
            "code": country["code"],
            "name": country["name"],
            "flag": country.get("flag", ""),
            "is_active": country.get("is_active", True)
        },
        "services": services,
        "service_labels": SERVICE_LABELS,
        "updated_at": country.get("services_updated_at")
    }


@router.patch("/admin/countries/{code}/services")
async def update_country_services(code: str, req: CountryServicesUpdateReq, adm=Depends(get_admin)):
    """Update services configuration for a country"""
    country = await db.countries.find_one({"code": code.upper()})
    if not country:
        raise HTTPException(404, "Pays non trouvé")
    
    # Get current services or defaults
    current_services = country.get("services", DEFAULT_COUNTRY_SERVICES.copy())
    
    # Build update dict with only provided fields
    updates = {}
    req_dict = req.model_dump(exclude_none=True)
    for key, value in req_dict.items():
        if value is not None:
            updates[f"services.{key}"] = value
            current_services[key] = value
    
    if updates:
        updates["services_updated_at"] = now_iso()
        updates["services_updated_by"] = adm["id"]
        await db.countries.update_one(
            {"code": code.upper()},
            {"$set": updates}
        )
    
    # Create log entry
    await db.service_config_logs.insert_one({
        "id": gen_id(),
        "country_code": code.upper(),
        "changes": req_dict,
        "admin_id": adm["id"],
        "admin_name": adm["name"],
        "created_at": now_iso()
    })
    
    return {
        "message": "Configuration des services mise à jour",
        "country_code": code.upper(),
        "services": current_services
    }


@router.patch("/admin/countries/{code}/services/bulk")
async def bulk_update_country_services(code: str, enable_all: bool = None, disable_all: bool = None, 
                                       national_only: bool = None, international_only: bool = None,
                                       adm=Depends(get_admin)):
    """Bulk enable/disable services for a country"""
    country = await db.countries.find_one({"code": code.upper()})
    if not country:
        raise HTTPException(404, "Pays non trouvé")
    
    services = country.get("services", DEFAULT_COUNTRY_SERVICES.copy())
    
    if enable_all:
        services = {k: True for k in DEFAULT_COUNTRY_SERVICES.keys()}
        message = "Tous les services activés"
    elif disable_all:
        services = {k: False for k in DEFAULT_COUNTRY_SERVICES.keys()}
        message = "Tous les services désactivés"
    elif national_only is not None:
        national_services = ["send_national", "receive_national", "deposit", "withdrawal", 
                           "savings", "contribution", "currency_conversion"]
        for svc in national_services:
            services[svc] = national_only
        message = f"Services nationaux {'activés' if national_only else 'désactivés'}"
    elif international_only is not None:
        intl_services = ["send_international", "receive_international", 
                        "withdrawal_international", "contribution_international"]
        for svc in intl_services:
            services[svc] = international_only
        message = f"Services internationaux {'activés' if international_only else 'désactivés'}"
    else:
        raise HTTPException(400, "Spécifiez une action: enable_all, disable_all, national_only, ou international_only")
    
    await db.countries.update_one(
        {"code": code.upper()},
        {"$set": {
            "services": services,
            "services_updated_at": now_iso(),
            "services_updated_by": adm["id"]
        }}
    )
    
    return {"message": message, "services": services}


@router.get("/admin/services/overview")
async def get_services_overview(adm=Depends(get_admin)):
    """Get overview of all countries' services status"""
    countries = await db.countries.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    
    # Dial codes mapping for common countries
    DIAL_CODES = {
        "CD": "+243", "CG": "+242", "CM": "+237", "SN": "+221", "CI": "+225",
        "ML": "+223", "BF": "+226", "NE": "+227", "TG": "+228", "BJ": "+229",
        "GA": "+241", "TD": "+235", "CF": "+236", "GQ": "+240", "NG": "+234",
        "GH": "+233", "KE": "+254", "TZ": "+255", "UG": "+256", "RW": "+250",
        "BI": "+257", "ZA": "+27", "MA": "+212", "DZ": "+213", "TN": "+216",
        "EG": "+20", "LY": "+218", "SD": "+249", "ET": "+251", "SO": "+252",
        "MG": "+261", "MU": "+230", "ZW": "+263", "ZM": "+260", "AO": "+244",
        "MZ": "+258", "BW": "+267", "NA": "+264", "MW": "+265", "LS": "+266",
        "SZ": "+268", "SC": "+248", "KM": "+269", "DJ": "+253", "ER": "+291",
        "SS": "+211", "GN": "+224", "GM": "+220", "GW": "+245", "LR": "+231",
        "SL": "+232", "CV": "+238", "ST": "+239", "MR": "+222",
        # Europe
        "FR": "+33", "DE": "+49", "GB": "+44", "IT": "+39", "ES": "+34",
        "PT": "+351", "BE": "+32", "NL": "+31", "CH": "+41", "AT": "+43",
        "PL": "+48", "CZ": "+420", "SK": "+421", "HU": "+36", "RO": "+40",
        "BG": "+359", "GR": "+30", "HR": "+385", "SI": "+386", "RS": "+381",
        "BA": "+387", "ME": "+382", "MK": "+389", "AL": "+355", "XK": "+383",
        "UA": "+380", "BY": "+375", "MD": "+373", "LT": "+370", "LV": "+371",
        "EE": "+372", "FI": "+358", "SE": "+46", "NO": "+47", "DK": "+45",
        "IE": "+353", "IS": "+354", "LU": "+352", "MC": "+377", "AD": "+376",
        "SM": "+378", "VA": "+379", "MT": "+356", "CY": "+357", "LI": "+423",
        # Others
        "US": "+1", "CA": "+1", "MX": "+52", "BR": "+55", "AR": "+54",
        "CL": "+56", "CO": "+57", "PE": "+51", "VE": "+58", "EC": "+593",
        "IN": "+91", "CN": "+86", "JP": "+81", "KR": "+82", "AU": "+61",
        "NZ": "+64", "RU": "+7", "TR": "+90", "SA": "+966", "AE": "+971",
    }
    
    overview = []
    for country in countries:
        services = country.get("services", DEFAULT_COUNTRY_SERVICES.copy())
        active_count = sum(1 for v in services.values() if v)
        total_count = len(services)
        
        overview.append({
            "code": country["code"],
            "name": country["name"],
            "flag": country.get("flag", ""),
            "dial_code": country.get("dial_code") or DIAL_CODES.get(country["code"], "+1"),
            "is_active": country.get("is_active", True),
            "active_services": active_count,
            "total_services": total_count,
            "services": services,
            "updated_at": country.get("services_updated_at")
        })
    
    return {
        "countries": overview,
        "total_countries": len(overview),
        "service_labels": SERVICE_LABELS
    }


async def check_service_enabled(country_code: str, service_name: str) -> bool:
    """Check if a service is enabled for a country"""
    country = await db.countries.find_one({"code": country_code.upper()})
    if not country:
        return True  # Default to enabled if country not found
    
    if not country.get("is_active", True):
        return False  # Country itself is disabled
    
    services = country.get("services", DEFAULT_COUNTRY_SERVICES)
    return services.get(service_name, True)



@router.get("/qr/generate")
async def generate_qr_data(u=Depends(get_current_user)):
    """Generate QR code data for receiving payments"""
    qr_data = {
        "type": "monity_payment",
        "user_id": u["id"],
        "phone": u["phone"],
        "account": u["account_number"],
        "name": u["name"],
        "timestamp": now_iso()
    }
    import json
    encoded = base64.b64encode(json.dumps(qr_data).encode()).decode()
    return {"qr_data": encoded, "display_data": qr_data}

@router.post("/qr/pay")
async def pay_via_qr(qr_data: str, amount: float, currency: str = "USD", u=Depends(get_current_user)):
    """Process payment from scanned QR code"""
    import json
    try:
        decoded = json.loads(base64.b64decode(qr_data).decode())
    except Exception:
        raise HTTPException(400, "QR code invalide")
    
    if decoded.get("type") != "monity_payment":
        raise HTTPException(400, "Type de QR code non supporté")
    
    receiver = await db.users.find_one({"id": decoded.get("user_id")})
    if not receiver:
        raise HTTPException(404, "Destinataire non trouvé")
    if receiver["id"] == u["id"]:
        raise HTTPException(400, "Auto-transfert interdit")
    
    # Use existing transfer logic
    sw = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
    if not sw:
        raise HTTPException(400, f"Portefeuille {currency} non trouvé")
    
    fee = round(amount * 0.01, 2)
    total = amount + fee
    if sw["balance"] < total:
        raise HTTPException(400, f"Solde insuffisant. Disponible: {sw['balance']} {currency}")
    
    await db.wallets.update_one({"user_id": u["id"], "currency": currency}, {"$inc": {"balance": -total}})
    
    tx_status = "completed" if amount < 200 else "pending"
    tx_id = gen_id()
    n = now_iso()
    
    await db.transactions.insert_one({
        "id": tx_id, "sender_id": u["id"], "sender_name": u["name"], "sender_phone": u["phone"],
        "receiver_id": receiver["id"], "receiver_name": receiver["name"], "receiver_phone": receiver["phone"],
        "amount": amount, "fee": fee, "currency": currency, "type": "qr_transfer",
        "status": tx_status, "description": "Paiement QR Code",
        "created_at": n, "completed_at": n if tx_status == "completed" else None
    })
    
    if tx_status == "completed":
        rw = await db.wallets.find_one({"user_id": receiver["id"], "currency": currency})
        if rw:
            await db.wallets.update_one({"user_id": receiver["id"], "currency": currency}, {"$inc": {"balance": amount}})
        else:
            await db.wallets.insert_one({"id": gen_id(), "user_id": receiver["id"], "currency": currency, "balance": amount, "is_primary": False, "created_at": n})
    
    return {"message": "Paiement effectué", "transaction_id": tx_id, "receiver": receiver["name"], "amount": amount, "fee": fee}


