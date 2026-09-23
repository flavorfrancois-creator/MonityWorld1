"""
Monity World - Admin Rules Routes
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
try:
    from config.countries import get_country_config
except ImportError:
    get_country_config = None
from rbac import (
    check_permission, get_role_info, get_role_level,
    is_primary_admin, is_original_primary_admin,
    can_manage_role, can_create_role, can_suspend_role,
    has_permission, require_permission
)
from models.schemas import CountryCurrenciesReq, InternationalRuleReq, TransactionRuleReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=['Admin Rules'])

# === TRANSACTION RULES MANAGEMENT ===
@router.get("/transaction-rules")
async def admin_get_transaction_rules(country: str = "", tx_type: str = "", adm=Depends(get_admin)):
    """Get all transaction rules with optional filters"""
    q = {}
    if country:
        q["country_code"] = country
    if tx_type:
        q["transaction_type"] = tx_type
    
    rules = await db.transaction_rules.find(q, {"_id": 0}).sort([("country_code", 1), ("transaction_type", 1)]).to_list(500)
    return {"rules": rules, "total": len(rules)}


@router.post("/transaction-rules")
async def admin_create_transaction_rule(req: TransactionRuleReq, adm=Depends(get_admin)):
    """Create a new transaction rule"""
    # Check if rule already exists
    existing = await db.transaction_rules.find_one({
        "country_code": req.country_code.upper(),
        "transaction_type": req.transaction_type
    })
    if existing:
        raise HTTPException(400, f"Une règle existe déjà pour {req.country_code}/{req.transaction_type}")
    
    doc = {
        "id": gen_id(),
        "country_code": req.country_code.upper(),
        "transaction_type": req.transaction_type,
        "fee_type": req.fee_type,
        "fee_value": req.fee_value,
        "min_fee": req.min_fee,
        "max_fee": req.max_fee,
        "daily_limit": req.daily_limit,
        "monthly_limit": req.monthly_limit,
        "per_transaction_min": req.per_transaction_min,
        "per_transaction_max": req.per_transaction_max,
        "is_active": req.is_active,
        "created_by": adm["id"],
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.transaction_rules.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Règle créée", "rule": doc}


@router.put("/transaction-rules/{rule_id}")
async def admin_update_transaction_rule(rule_id: str, req: TransactionRuleReq, adm=Depends(get_admin)):
    """Update an existing transaction rule"""
    rule = await db.transaction_rules.find_one({"id": rule_id})
    if not rule:
        raise HTTPException(404, "Règle non trouvée")
    
    await db.transaction_rules.update_one(
        {"id": rule_id},
        {"$set": {
            "fee_type": req.fee_type,
            "fee_value": req.fee_value,
            "min_fee": req.min_fee,
            "max_fee": req.max_fee,
            "daily_limit": req.daily_limit,
            "monthly_limit": req.monthly_limit,
            "per_transaction_min": req.per_transaction_min,
            "per_transaction_max": req.per_transaction_max,
            "is_active": req.is_active,
            "updated_by": adm["id"],
            "updated_at": now_iso()
        }}
    )
    return {"message": "Règle mise à jour"}


@router.delete("/transaction-rules/{rule_id}")
async def admin_delete_transaction_rule(rule_id: str, adm=Depends(get_admin)):
    """Delete a transaction rule"""
    result = await db.transaction_rules.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Règle non trouvée")
    return {"message": "Règle supprimée"}


@router.get("/international-rules")
async def admin_get_international_rules(source: str = "", dest: str = "", adm=Depends(get_admin)):
    """Get all international transaction rules"""
    q = {}
    if source:
        q["source_country"] = source
    if dest:
        q["destination_country"] = dest
    
    rules = await db.international_rules.find(q, {"_id": 0}).sort([("source_country", 1), ("destination_country", 1)]).to_list(500)
    return {"rules": rules, "total": len(rules)}


@router.post("/international-rules")
async def admin_create_international_rule(req: InternationalRuleReq, adm=Depends(get_admin)):
    """Create a new international transaction rule"""
    existing = await db.international_rules.find_one({
        "source_country": req.source_country.upper(),
        "destination_country": req.destination_country.upper()
    })
    if existing:
        raise HTTPException(400, f"Une règle existe déjà pour {req.source_country} → {req.destination_country}")
    
    doc = {
        "id": gen_id(),
        "source_country": req.source_country.upper(),
        "destination_country": req.destination_country.upper(),
        "fee_type": req.fee_type,
        "fee_value": req.fee_value,
        "min_fee": req.min_fee,
        "max_fee": req.max_fee,
        "exchange_rate_margin": req.exchange_rate_margin,
        "daily_limit": req.daily_limit,
        "monthly_limit": req.monthly_limit,
        "per_transaction_min": req.per_transaction_min,
        "per_transaction_max": req.per_transaction_max,
        "is_active": req.is_active,
        "processing_time": req.processing_time,
        "created_by": adm["id"],
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.international_rules.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Règle internationale créée", "rule": doc}


@router.put("/international-rules/{rule_id}")
async def admin_update_international_rule(rule_id: str, req: InternationalRuleReq, adm=Depends(get_admin)):
    """Update an existing international rule"""
    rule = await db.international_rules.find_one({"id": rule_id})
    if not rule:
        raise HTTPException(404, "Règle non trouvée")
    
    await db.international_rules.update_one(
        {"id": rule_id},
        {"$set": {
            "fee_type": req.fee_type,
            "fee_value": req.fee_value,
            "min_fee": req.min_fee,
            "max_fee": req.max_fee,
            "exchange_rate_margin": req.exchange_rate_margin,
            "daily_limit": req.daily_limit,
            "monthly_limit": req.monthly_limit,
            "per_transaction_min": req.per_transaction_min,
            "per_transaction_max": req.per_transaction_max,
            "is_active": req.is_active,
            "processing_time": req.processing_time,
            "updated_by": adm["id"],
            "updated_at": now_iso()
        }}
    )
    return {"message": "Règle internationale mise à jour"}


@router.delete("/international-rules/{rule_id}")
async def admin_delete_international_rule(rule_id: str, adm=Depends(get_admin)):
    """Delete an international rule"""
    result = await db.international_rules.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Règle non trouvée")
    return {"message": "Règle internationale supprimée"}


@router.get("/transaction-fees/preview")
async def preview_transaction_fees(
    amount: float,
    tx_type: str = "transfer",
    receiver_country: Optional[str] = None,
    currency: str = "USD",
    u=Depends(get_current_user)
):
    """Preview transaction fees before executing"""
    sender_country = u.get("country", "CD")
    
    # Determine if international
    is_international = receiver_country and receiver_country != sender_country
    
    if is_international:
        rule = await get_international_rule(sender_country, receiver_country)
        tx_type_used = "international"
    else:
        rule = await get_transaction_rule(sender_country, tx_type)
        tx_type_used = tx_type
    
    # Calculate fee
    fee = calculate_fee(amount, rule)
    total = amount + fee
    
    # Check limits
    limit_check = await check_transaction_limits(u["id"], amount, tx_type_used, rule)
    
    # Calculate exchange rate for international
    exchange_info = None
    if is_international and receiver_country:
        # Get receiver currency (assume default based on country)
        country_currencies = {
            "CD": "CDF", "CM": "XAF", "SN": "XOF", "CI": "XOF", "NG": "NGN",
            "GH": "GHS", "FR": "EUR", "BE": "EUR", "US": "USD", "CN": "CNY"
        }
        to_currency = country_currencies.get(receiver_country, "USD")
        if to_currency != currency:
            margin = rule.get("exchange_rate_margin", 2.0)
            rate = await get_exchange_rate(currency, to_currency, margin)
            received_amount = round(amount * rate, 2)
            exchange_info = {
                "from_currency": currency,
                "to_currency": to_currency,
                "exchange_rate": rate,
                "margin_applied": margin,
                "received_amount": received_amount
            }
    
    return {
        "amount": amount,
        "fee": fee,
        "total": total,
        "currency": currency,
        "fee_details": {
            "type": rule.get("fee_type"),
            "value": rule.get("fee_value"),
            "min_fee": rule.get("min_fee"),
            "max_fee": rule.get("max_fee")
        },
        "is_international": is_international,
        "exchange": exchange_info,
        "limits": {
            "per_transaction_min": rule.get("per_transaction_min"),
            "per_transaction_max": rule.get("per_transaction_max"),
            "daily_limit": rule.get("daily_limit"),
            "daily_spent": limit_check["daily_spent"],
            "daily_remaining": limit_check["daily_remaining"],
            "monthly_limit": rule.get("monthly_limit"),
            "monthly_spent": limit_check["monthly_spent"],
            "monthly_remaining": limit_check["monthly_remaining"]
        },
        "allowed": limit_check["allowed"],
        "errors": limit_check["errors"] if not limit_check["allowed"] else None
    }


# === ADMIN - COUNTRY CURRENCIES MANAGEMENT ===

@router.get("/countries/{country_code}/currencies")
async def get_country_currencies(country_code: str, adm=Depends(get_admin)):
    """Get accepted currencies for a country"""
    country = await db.countries.find_one({"code": country_code.upper()}, {"_id": 0})
    if not country:
        raise HTTPException(404, "Pays non trouvé")
    
    # Get all available currencies
    all_currencies = await db.currencies.find({"is_active": True}, {"_id": 0}).to_list(100)
    
    return {
        "country": country,
        "accepted_currencies": country.get("accepted_currencies", [country.get("default_currency", "USD")]),
        "all_currencies": all_currencies
    }

@router.put("/countries/{country_code}/currencies")
async def update_country_currencies(country_code: str, req: CountryCurrenciesReq, adm=Depends(get_admin)):
    """Update accepted currencies for a country"""
    country = await db.countries.find_one({"code": country_code.upper()})
    if not country:
        raise HTTPException(404, "Pays non trouvé")
    
    if len(req.currencies) == 0:
        raise HTTPException(400, "Au moins une devise doit être sélectionnée")
    
    await db.countries.update_one(
        {"code": country_code.upper()},
        {"$set": {
            "accepted_currencies": req.currencies,
            "currencies_updated_at": now_iso(),
            "currencies_updated_by": adm["id"]
        }}
    )
    
    return {"message": "Devises mises à jour", "currencies": req.currencies}

@router.get("/countries/{country_code}/currencies")
async def get_public_country_currencies(country_code: str):
    """Get accepted currencies for a country (public endpoint for clients)"""
    country = await db.countries.find_one({"code": country_code.upper()}, {"_id": 0})
    if not country:
        return {"currencies": ["USD", "EUR"]}
    
    currencies = country.get("accepted_currencies", [country.get("default_currency", "USD")])
    
    currency_details = await db.currencies.find(
        {"code": {"$in": currencies}, "is_active": True}, 
        {"_id": 0}
    ).to_list(50)
    
    return {
        "country_code": country_code.upper(),
        "currencies": currencies,
        "currency_details": currency_details
    }


