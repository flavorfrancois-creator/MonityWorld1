"""
Monity World - Transaction Fee and Limit Utilities
Functions for calculating transaction fees and checking limits
"""
from datetime import datetime, timezone, timedelta


async def get_transaction_rule(db, country_code: str, tx_type: str):
    """Get transaction rule for a country and transaction type"""
    # First try country-specific rule
    rule = await db.transaction_rules.find_one({
        "country_code": country_code,
        "transaction_type": tx_type,
        "is_active": True
    })
    # Fall back to global rule
    if not rule:
        rule = await db.transaction_rules.find_one({
            "country_code": "ALL",
            "transaction_type": tx_type,
            "is_active": True
        })
    # Default rule if none found
    if not rule:
        rule = {
            "fee_type": "percentage",
            "fee_value": 1.0 if tx_type == "transfer" else 1.5,
            "min_fee": 0.0,
            "max_fee": None,
            "daily_limit": 10000,
            "monthly_limit": 100000,
            "per_transaction_min": 1,
            "per_transaction_max": 5000
        }
    return rule


async def get_international_rule(db, source_country: str, dest_country: str):
    """Get international transaction rule between two countries"""
    # First try specific corridor
    rule = await db.international_rules.find_one({
        "source_country": source_country,
        "destination_country": dest_country,
        "is_active": True
    })
    # Try reverse corridor
    if not rule:
        rule = await db.international_rules.find_one({
            "source_country": dest_country,
            "destination_country": source_country,
            "is_active": True
        })
    # Fall back to global international rule
    if not rule:
        rule = await db.international_rules.find_one({
            "source_country": "ALL",
            "destination_country": "ALL",
            "is_active": True
        })
    # Default international rule
    if not rule:
        rule = {
            "fee_type": "percentage",
            "fee_value": 2.5,
            "min_fee": 1.0,
            "max_fee": None,
            "exchange_rate_margin": 2.0,
            "daily_limit": 5000,
            "monthly_limit": 50000,
            "per_transaction_min": 10,
            "per_transaction_max": 2000,
            "processing_time": "instant"
        }
    return rule


def calculate_fee(amount: float, rule: dict) -> float:
    """Calculate transaction fee based on rule"""
    if rule["fee_type"] == "percentage":
        fee = round(amount * (rule["fee_value"] / 100), 2)
    else:  # fixed
        fee = rule["fee_value"]
    
    # Apply min/max fee
    if fee < rule.get("min_fee", 0):
        fee = rule["min_fee"]
    if rule.get("max_fee") and fee > rule["max_fee"]:
        fee = rule["max_fee"]
    
    return round(fee, 2)


async def check_transaction_limits(db, user_id: str, amount: float, tx_type: str, rule: dict) -> dict:
    """Check if transaction is within limits"""
    errors = []
    
    # Check per-transaction limits
    if amount < rule.get("per_transaction_min", 0):
        errors.append(f"Montant minimum: {rule['per_transaction_min']}")
    if amount > rule.get("per_transaction_max", float('inf')):
        errors.append(f"Montant maximum: {rule['per_transaction_max']}")
    
    # Check daily limit
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    daily_total = await db.transactions.aggregate([
        {
            "$match": {
                "sender_id": user_id,
                "type": tx_type,
                "status": {"$in": ["completed", "pending"]},
                "created_at": {"$gte": today_start.isoformat()}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    daily_spent = daily_total[0]["total"] if daily_total else 0
    
    if daily_spent + amount > rule.get("daily_limit", float('inf')):
        errors.append(f"Limite journalière atteinte: {rule['daily_limit']} (utilisé: {daily_spent})")
    
    # Check monthly limit
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_total = await db.transactions.aggregate([
        {
            "$match": {
                "sender_id": user_id,
                "type": tx_type,
                "status": {"$in": ["completed", "pending"]},
                "created_at": {"$gte": month_start.isoformat()}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    monthly_spent = monthly_total[0]["total"] if monthly_total else 0
    
    if monthly_spent + amount > rule.get("monthly_limit", float('inf')):
        errors.append(f"Limite mensuelle atteinte: {rule['monthly_limit']} (utilisé: {monthly_spent})")
    
    return {
        "allowed": len(errors) == 0,
        "errors": errors,
        "daily_spent": daily_spent,
        "daily_remaining": max(0, rule.get("daily_limit", 0) - daily_spent),
        "monthly_spent": monthly_spent,
        "monthly_remaining": max(0, rule.get("monthly_limit", 0) - monthly_spent)
    }


async def get_exchange_rate(db, from_currency: str, to_currency: str, margin: float = 0) -> float:
    """Get exchange rate between two currencies with optional margin"""
    from fastapi import HTTPException
    
    if from_currency == to_currency:
        return 1.0
    
    from_cur = await db.currencies.find_one({"code": from_currency})
    to_cur = await db.currencies.find_one({"code": to_currency})
    
    if not from_cur or not to_cur:
        raise HTTPException(400, f"Devise non supportée: {from_currency} ou {to_currency}")
    
    # Calculate rate through USD
    rate = to_cur["rate_to_usd"] / from_cur["rate_to_usd"]
    
    # Apply margin (unfavorable to user)
    if margin > 0:
        rate = rate * (1 - margin / 100)  # Reduce amount received
    
    return round(rate, 6)
