"""
Monity World - Admin Analytics Routes
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
    has_permission, require_permission, get_accessible_countries
)
from models.schemas import AccountingExportReq, ActivityRetentionReq, AdminActivityLogReq

logger = logging.getLogger(__name__)
from utils.activity import log_admin_activity, ACTIVITY_ACTIONS, ACTIVITY_RESOURCES

router = APIRouter(prefix="/api/admin", tags=['Admin Analytics'])

# === ADMIN - ANALYTICS & STATISTICS ===

@router.get("/analytics/transactions")
async def get_transaction_analytics(
    period: str = "monthly",
    year: int = None,
    adm=Depends(get_admin)
):
    """Get transaction analytics with time period filtering"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    
    if period == "yearly":
        start_date = datetime(year - 4, 1, 1, tzinfo=timezone.utc)
    elif period == "semester":
        start_date = datetime(year, 1, 1, tzinfo=timezone.utc)
    elif period == "quarterly":
        start_date = datetime(year, 1, 1, tzinfo=timezone.utc)
    elif period == "biweekly":
        start_date = now - timedelta(weeks=16)
    elif period == "weekly":
        start_date = now - timedelta(weeks=12)
    else:
        start_date = datetime(year, 1, 1, tzinfo=timezone.utc)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date.isoformat()}}},
        {"$addFields": {
            "parsed_date": {"$dateFromString": {"dateString": "$created_at", "onError": now}}
        }},
        {"$group": {
            "_id": {
                "type": "$type",
                "year": {"$year": "$parsed_date"},
                "month": {"$month": "$parsed_date"} if period in ["monthly", "quarterly", "semester"] else None,
                "week": {"$isoWeek": "$parsed_date"} if period in ["weekly", "biweekly"] else None
            },
            "count": {"$sum": 1},
            "total_amount": {"$sum": "$amount"},
            "total_fees": {"$sum": {"$ifNull": ["$fee", 0]}}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.week": 1}}
    ]
    
    results = await db.transactions.aggregate(pipeline).to_list(500)
    
    tx_types = ["recharge", "withdrawal", "transfer", "deposit", "send_international", "receive_international"]
    analytics = {t: {"data": [], "total_count": 0, "total_amount": 0, "total_fees": 0} for t in tx_types}
    
    for r in results:
        tx_type = r["_id"].get("type", "other")
        if tx_type in analytics:
            period_key = f"{r['_id']['year']}"
            if r["_id"].get("month"):
                if period == "semester":
                    sem = 1 if r["_id"]["month"] <= 6 else 2
                    period_key = f"{r['_id']['year']}-S{sem}"
                elif period == "quarterly":
                    q = (r["_id"]["month"] - 1) // 3 + 1
                    period_key = f"{r['_id']['year']}-Q{q}"
                else:
                    period_key = f"{r['_id']['year']}-{str(r['_id']['month']).zfill(2)}"
            elif r["_id"].get("week"):
                period_key = f"{r['_id']['year']}-W{r['_id']['week']}"
            
            analytics[tx_type]["data"].append({
                "period": period_key,
                "count": r["count"],
                "amount": r["total_amount"],
                "fees": r["total_fees"]
            })
            analytics[tx_type]["total_count"] += r["count"]
            analytics[tx_type]["total_amount"] += r["total_amount"]
            analytics[tx_type]["total_fees"] += r["total_fees"]
    
    total_users = await db.users.count_documents({"role": "client"})
    total_partners = await db.partners.count_documents({"status": "approved"})
    total_volume = sum(a["total_amount"] for a in analytics.values())
    total_fees_collected = sum(a["total_fees"] for a in analytics.values())
    
    return {
        "period_type": period,
        "year": year,
        "analytics": analytics,
        "summary": {
            "total_volume": total_volume,
            "total_fees": total_fees_collected,
            "total_transactions": sum(a["total_count"] for a in analytics.values()),
            "total_users": total_users,
            "total_partners": total_partners
        },
        "labels": {
            "recharge": "Recharges",
            "withdrawal": "Retraits",
            "transfer": "Transferts",
            "deposit": "Dépôts",
            "send_international": "Envois internationaux",
            "receive_international": "Réceptions internationales"
        }
    }

@router.get("/analytics/partners")
async def get_partner_analytics(
    group_by: str = "country",
    period: str = "monthly",
    year: int = None,
    adm=Depends(get_admin)
):
    """Get partner activity analytics"""
    now = datetime.now(timezone.utc)
    year = year or now.year
    start_date = datetime(year, 1, 1, tzinfo=timezone.utc)
    
    partners = await db.partners.find({"status": "approved"}, {"_id": 0}).to_list(1000)
    partner_map = {p["id"]: p for p in partners}
    
    ZONES = {
        "Afrique Centrale": ["CD", "CG", "CF", "CM", "GA", "TD", "GQ"],
        "Afrique de l'Ouest": ["SN", "CI", "ML", "BF", "NE", "TG", "BJ", "GH", "NG", "GN", "GM", "GW", "LR", "SL"],
        "Afrique de l'Est": ["KE", "TZ", "UG", "RW", "BI", "ET", "SO", "DJ", "ER", "SS"],
        "Afrique du Nord": ["MA", "DZ", "TN", "EG", "LY", "SD", "MR"],
        "Afrique Australe": ["ZA", "ZW", "ZM", "AO", "MZ", "BW", "NA", "MW", "LS", "SZ"],
        "Europe": ["FR", "DE", "GB", "IT", "ES", "PT", "BE", "NL", "CH", "AT", "PL"],
        "Autres": []
    }
    
    def get_zone(country_code):
        for zone, countries in ZONES.items():
            if country_code in countries:
                return zone
        return "Autres"
    
    pipeline = [
        {"$match": {
            "created_at": {"$gte": start_date.isoformat()},
            "partner_id": {"$exists": True, "$ne": None}
        }},
        {"$group": {
            "_id": {
                "partner_id": "$partner_id",
                "type": "$type"
            },
            "count": {"$sum": 1},
            "total_amount": {"$sum": "$amount"},
            "total_commission": {"$sum": {"$ifNull": ["$partner_commission", 0]}}
        }}
    ]
    
    results = await db.transactions.aggregate(pipeline).to_list(5000)
    
    analytics = {}
    for r in results:
        partner_id = r["_id"]["partner_id"]
        partner = partner_map.get(partner_id, {})
        country = partner.get("country", "XX")
        zone = get_zone(country)
        tx_type = r["_id"].get("type", "other")
        
        if group_by == "zone":
            key = zone
        elif group_by == "transaction_type":
            key = tx_type
        else:
            key = country
        
        if key not in analytics:
            analytics[key] = {"transactions": 0, "volume": 0, "commission": 0, "partners": set()}
        
        analytics[key]["transactions"] += r["count"]
        analytics[key]["volume"] += r["total_amount"]
        analytics[key]["commission"] += r["total_commission"]
        analytics[key]["partners"].add(partner_id)
    
    formatted = []
    for key, data in analytics.items():
        formatted.append({
            "name": key,
            "transactions": data["transactions"],
            "volume": round(data["volume"], 2),
            "commission": round(data["commission"], 2),
            "partner_count": len(data["partners"])
        })
    
    formatted.sort(key=lambda x: x["volume"], reverse=True)
    
    top_partners_pipeline = [
        {"$match": {
            "created_at": {"$gte": start_date.isoformat()},
            "partner_id": {"$exists": True, "$ne": None}
        }},
        {"$group": {
            "_id": "$partner_id",
            "transactions": {"$sum": 1},
            "volume": {"$sum": "$amount"},
            "commission": {"$sum": {"$ifNull": ["$partner_commission", 0]}}
        }},
        {"$sort": {"volume": -1}},
        {"$limit": 10}
    ]
    
    top_partners = await db.transactions.aggregate(top_partners_pipeline).to_list(10)
    
    for tp in top_partners:
        partner = partner_map.get(tp["_id"], {})
        tp["name"] = partner.get("business_name", "Inconnu")
        tp["country"] = partner.get("country", "XX")
        tp["volume"] = round(tp["volume"], 2)
        tp["commission"] = round(tp["commission"], 2)
    
    return {
        "group_by": group_by,
        "period": period,
        "year": year,
        "data": formatted,
        "top_partners": top_partners,
        "total_partners": len(partners)
    }

@router.get("/analytics/overview")
async def get_analytics_overview(adm=Depends(get_admin)):
    """Get quick overview stats for dashboard"""
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    
    today_tx = await db.transactions.count_documents({"created_at": {"$gte": today_start.isoformat()}})
    today_volume_pipeline = [
        {"$match": {"created_at": {"$gte": today_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    today_volume_result = await db.transactions.aggregate(today_volume_pipeline).to_list(1)
    today_volume = today_volume_result[0]["total"] if today_volume_result else 0
    
    week_tx = await db.transactions.count_documents({"created_at": {"$gte": week_start.isoformat()}})
    month_tx = await db.transactions.count_documents({"created_at": {"$gte": month_start.isoformat()}})
    
    month_volume_pipeline = [
        {"$match": {"created_at": {"$gte": month_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    month_volume_result = await db.transactions.aggregate(month_volume_pipeline).to_list(1)
    month_volume = month_volume_result[0]["total"] if month_volume_result else 0
    
    month_fees_pipeline = [
        {"$match": {"created_at": {"$gte": month_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$fee", 0]}}}}
    ]
    month_fees_result = await db.transactions.aggregate(month_fees_pipeline).to_list(1)
    month_fees = month_fees_result[0]["total"] if month_fees_result else 0
    
    new_users = await db.users.count_documents({
        "created_at": {"$gte": month_start.isoformat()},
        "role": "client"
    })
    
    pending_kyc = await db.users.count_documents({"kyc_status": "pending"})
    pending_partners = await db.partners.count_documents({"status": "pending"})
    pending_withdrawals = await db.transactions.count_documents({"type": "withdrawal", "status": "pending"})
    
    return {
        "today": {"transactions": today_tx, "volume": round(today_volume, 2)},
        "week": {"transactions": week_tx},
        "month": {"transactions": month_tx, "volume": round(month_volume, 2), "fees": round(month_fees, 2), "new_users": new_users},
        "pending": {"kyc": pending_kyc, "partners": pending_partners, "withdrawals": pending_withdrawals}
    }


# === ADMIN ACTIVITY LOGS ===
@router.get("/activity-logs")
async def get_admin_activity_logs(
    admin_id: Optional[str] = None,
    action_type: Optional[str] = None,
    resource_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    adm=Depends(get_admin)
):
    """
    Get admin activity logs. Only primary admin can see all logs.
    Other admins can only see their own activities.
    """
    # Only primary admin can view all logs
    if not is_original_primary_admin(adm):
        # Non-primary admins can only see their own logs
        admin_id = adm["id"]
    
    # Log this read action
    await log_admin_activity(adm, "read", "report", details={"report_type": "activity_logs"})
    
    query = {}
    
    if admin_id:
        query["admin_id"] = admin_id
    if action_type:
        query["action"] = action_type
    if resource_type:
        query["resource_type"] = resource_type
    if date_from:
        query["timestamp"] = {"$gte": date_from}
    if date_to:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = date_to
        else:
            query["timestamp"] = {"$lte": date_to}
    
    skip = (page - 1) * limit
    total = await db.admin_activity_logs.count_documents(query)
    
    logs = await db.admin_activity_logs.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get unique admins for filter dropdown
    admins_pipeline = [
        {"$group": {"_id": "$admin_id", "name": {"$first": "$admin_name"}, "role": {"$first": "$admin_role"}}},
        {"$sort": {"name": 1}}
    ]
    unique_admins = await db.admin_activity_logs.aggregate(admins_pipeline).to_list(100)
    
    return {
        "logs": logs,
        "total": total,
        "page": page,
        "pages": -(-total // limit),
        "filters": {
            "admins": [{"id": a["_id"], "name": a["name"], "role": a["role"]} for a in unique_admins if a["_id"]],
            "actions": ACTIVITY_ACTIONS,
            "resources": ACTIVITY_RESOURCES
        }
    }


@router.get("/activity-logs/stats")
async def get_activity_logs_stats(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    adm=Depends(get_admin)
):
    """Get statistics about admin activities (only for primary admin)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut voir les statistiques")
    
    query = {}
    if date_from:
        query["timestamp"] = {"$gte": date_from}
    if date_to:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = date_to
        else:
            query["timestamp"] = {"$lte": date_to}
    
    # Stats by action type
    actions_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    actions_stats = await db.admin_activity_logs.aggregate(actions_pipeline).to_list(20)
    
    # Stats by resource type
    resources_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$resource_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    resources_stats = await db.admin_activity_logs.aggregate(resources_pipeline).to_list(20)
    
    # Stats by admin
    admins_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$admin_id", "name": {"$first": "$admin_name"}, "role": {"$first": "$admin_role"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    admins_stats = await db.admin_activity_logs.aggregate(admins_pipeline).to_list(10)
    
    # Daily activity trend (last 30 days)
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    trend_pipeline = [
        {"$match": {"date": {"$gte": thirty_days_ago}}},
        {"$group": {"_id": "$date", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    daily_trend = await db.admin_activity_logs.aggregate(trend_pipeline).to_list(30)
    
    total_logs = await db.admin_activity_logs.count_documents(query)
    
    return {
        "total_activities": total_logs,
        "by_action": [{"action": a["_id"], "label": ACTIVITY_ACTIONS.get(a["_id"], a["_id"]), "count": a["count"]} for a in actions_stats],
        "by_resource": [{"resource": r["_id"], "label": ACTIVITY_RESOURCES.get(r["_id"], r["_id"]), "count": r["count"]} for r in resources_stats],
        "by_admin": [{"admin_id": a["_id"], "name": a["name"], "role": a["role"], "count": a["count"]} for a in admins_stats],
        "daily_trend": [{"date": d["_id"], "count": d["count"]} for d in daily_trend]
    }


@router.get("/activity-logs/settings")
async def get_activity_logs_settings(adm=Depends(get_admin)):
    """Get activity logs retention settings"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut voir les paramètres")
    
    settings = await db.admin_settings.find_one({"key": "activity_logs_retention"})
    return {
        "retention_days": settings.get("value", 1825) if settings else 1825,  # Default 5 years
        "options": [
            {"value": 30, "label": "30 jours"},
            {"value": 90, "label": "90 jours"},
            {"value": 365, "label": "1 an"},
            {"value": 1825, "label": "5 ans"}
        ]
    }


@router.put("/activity-logs/settings")
async def update_activity_logs_settings(req: ActivityRetentionReq, adm=Depends(get_admin_with_kyc)):
    """Update activity logs retention settings (primary admin only)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut modifier les paramètres")
    
    if req.retention_days not in [30, 90, 365, 1825]:
        raise HTTPException(400, "Durée de rétention invalide")
    
    await db.admin_settings.update_one(
        {"key": "activity_logs_retention"},
        {"$set": {"value": req.retention_days, "updated_at": now_iso(), "updated_by": adm["id"]}},
        upsert=True
    )
    
    await log_admin_activity(adm, "update", "settings", details={"setting": "activity_logs_retention", "new_value": req.retention_days})
    
    return {"message": f"Rétention mise à jour: {req.retention_days} jours"}


@router.delete("/activity-logs/cleanup")
async def cleanup_old_activity_logs(adm=Depends(get_admin_with_kyc)):
    """Delete activity logs older than retention period (primary admin only)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut supprimer les logs")
    
    # Get retention setting
    settings = await db.admin_settings.find_one({"key": "activity_logs_retention"})
    retention_days = settings.get("value", 1825) if settings else 1825
    
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    
    result = await db.admin_activity_logs.delete_many({"timestamp": {"$lt": cutoff_date}})
    
    await log_admin_activity(adm, "delete", "report", details={"action": "cleanup_logs", "deleted_count": result.deleted_count})
    
    return {"message": f"{result.deleted_count} logs supprimés", "deleted_count": result.deleted_count}


@router.delete("/activity-logs/{log_id}")
async def delete_activity_log(log_id: str, adm=Depends(get_admin_with_kyc)):
    """Delete a specific activity log (primary admin only)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut supprimer les logs")
    
    result = await db.admin_activity_logs.delete_one({"id": log_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Log non trouvé")
    
    await log_admin_activity(adm, "delete", "report", details={"deleted_log_id": log_id})
    
    return {"message": "Log supprimé"}


@router.get("/activity-logs/export")
async def export_activity_logs(
    format: str = "json",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    adm=Depends(get_admin)
):
    """Export activity logs (for printing or download)"""
    if not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut exporter les logs")
    
    query = {}
    if date_from:
        query["timestamp"] = {"$gte": date_from}
    if date_to:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = date_to
        else:
            query["timestamp"] = {"$lte": date_to}
    
    logs = await db.admin_activity_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(10000)
    
    await log_admin_activity(adm, "export", "report", details={"report_type": "activity_logs", "format": format, "count": len(logs)})
    
    if format == "json":
        return {"logs": logs, "exported_at": now_iso(), "total": len(logs)}
    
    # For other formats, return data that frontend can process
    return {
        "data": logs,
        "metadata": {
            "exported_at": now_iso(),
            "exported_by": adm["name"],
            "total_records": len(logs),
            "date_range": {"from": date_from, "to": date_to}
        }
    }


# === ACCOUNTING EXPORT ===
@router.post("/accounting/export")
async def export_accounting_data(req: AccountingExportReq, adm=Depends(get_admin)):
    """
    Export accounting data in various formats.
    Report types:
    - transactions: Only transactions
    - wallets: Transactions + Wallet balances
    - complete: Full report (transactions, fees, commissions, balances)
    """
    check_permission(adm, "transactions.export")
    
    # Build query filters
    tx_query = {}
    if req.date_from:
        tx_query["created_at"] = {"$gte": req.date_from}
    if req.date_to:
        if "created_at" in tx_query:
            tx_query["created_at"]["$lte"] = req.date_to
        else:
            tx_query["created_at"] = {"$lte": req.date_to}
    if req.country:
        tx_query["$or"] = [
            {"sender_country": req.country.upper()},
            {"receiver_country": req.country.upper()}
        ]
    if req.currency:
        tx_query["currency"] = req.currency.upper()
    
    # Apply country access restrictions
    admin_countries = get_accessible_countries(adm)
    if admin_countries:
        country_filter = {"$or": [
            {"sender_country": {"$in": admin_countries}},
            {"receiver_country": {"$in": admin_countries}}
        ]}
        if tx_query:
            tx_query = {"$and": [tx_query, country_filter]}
        else:
            tx_query = country_filter
    
    # Get transactions
    transactions = await db.transactions.find(tx_query, {"_id": 0}).sort("created_at", -1).to_list(50000)
    
    # Calculate summaries
    total_volume = sum(t.get("amount", 0) for t in transactions)
    total_fees = sum(t.get("fee", 0) + t.get("conversion_fee", 0) for t in transactions)
    
    # Group by type
    by_type = {}
    for tx in transactions:
        tx_type = tx.get("type", "other")
        if tx_type not in by_type:
            by_type[tx_type] = {"count": 0, "volume": 0, "fees": 0}
        by_type[tx_type]["count"] += 1
        by_type[tx_type]["volume"] += tx.get("amount", 0)
        by_type[tx_type]["fees"] += tx.get("fee", 0) + tx.get("conversion_fee", 0)
    
    # Group by currency
    by_currency = {}
    for tx in transactions:
        curr = tx.get("currency", "USD")
        if curr not in by_currency:
            by_currency[curr] = {"count": 0, "volume": 0, "fees": 0}
        by_currency[curr]["count"] += 1
        by_currency[curr]["volume"] += tx.get("amount", 0)
        by_currency[curr]["fees"] += tx.get("fee", 0) + tx.get("conversion_fee", 0)
    
    result = {
        "report_type": req.report_type,
        "generated_at": now_iso(),
        "generated_by": adm["name"],
        "date_range": {"from": req.date_from, "to": req.date_to},
        "filters": {"country": req.country, "currency": req.currency},
        "summary": {
            "total_transactions": len(transactions),
            "total_volume": round(total_volume, 2),
            "total_fees": round(total_fees, 2),
            "by_type": {k: {kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in by_type.items()},
            "by_currency": {k: {kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in by_currency.items()}
        },
        "transactions": transactions
    }
    
    # Add wallet balances if requested
    if req.report_type in ["wallets", "complete"]:
        wallet_query = {}
        if admin_countries:
            # Get users in accessible countries
            user_ids = await db.users.find({"country": {"$in": admin_countries}}, {"id": 1, "_id": 0}).to_list(100000)
            user_id_list = [u["id"] for u in user_ids]
            wallet_query["user_id"] = {"$in": user_id_list}
        
        wallets = await db.wallets.find(wallet_query, {"_id": 0}).to_list(100000)
        
        # Group wallet balances by currency
        wallet_totals = {}
        for w in wallets:
            curr = w.get("currency", "USD")
            if curr not in wallet_totals:
                wallet_totals[curr] = {"count": 0, "total_balance": 0}
            wallet_totals[curr]["count"] += 1
            wallet_totals[curr]["total_balance"] += w.get("balance", 0)
        
        result["wallets"] = {
            "total_wallets": len(wallets),
            "by_currency": {k: {kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()} for k, v in wallet_totals.items()},
            "details": wallets if req.report_type == "complete" else None
        }
    
    # Add commissions if complete report
    if req.report_type == "complete":
        # Partner commissions
        partner_tx_query = {}
        if req.date_from:
            partner_tx_query["created_at"] = {"$gte": req.date_from}
        if req.date_to:
            if "created_at" in partner_tx_query:
                partner_tx_query["created_at"]["$lte"] = req.date_to
            else:
                partner_tx_query["created_at"] = {"$lte": req.date_to}
        
        partner_transactions = await db.partner_transactions.find(partner_tx_query, {"_id": 0}).to_list(10000)
        
        total_partner_commissions = sum(t.get("partner_commission", 0) for t in partner_transactions)
        total_client_fees = sum(t.get("client_fee", 0) for t in partner_transactions)
        
        result["commissions"] = {
            "partner_transactions": len(partner_transactions),
            "total_partner_commissions": round(total_partner_commissions, 2),
            "total_client_fees": round(total_client_fees, 2)
        }
    
    # Log the export action
    await log_admin_activity(adm, "export", "report", details={
        "report_type": req.report_type,
        "format": req.format,
        "transaction_count": len(transactions),
        "date_range": {"from": req.date_from, "to": req.date_to}
    })
    
    return result


@router.get("/accounting/summary")
async def get_accounting_summary(
    period: str = "month",  # day, week, month, quarter, year, custom
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    adm=Depends(get_admin)
):
    """Get accounting summary for dashboard"""
    check_permission(adm, "transactions.view")
    
    # Calculate date range based on period
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=now.weekday())
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_month = ((now.month - 1) // 3) * 3 + 1
        start_date = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:  # custom
        start_date = datetime.fromisoformat(date_from) if date_from else now - timedelta(days=30)
    
    end_date = datetime.fromisoformat(date_to) if date_to else now
    
    # Build query
    query = {"created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}}
    
    # Apply country restrictions
    admin_countries = get_accessible_countries(adm)
    if admin_countries:
        query["$or"] = [
            {"sender_country": {"$in": admin_countries}},
            {"receiver_country": {"$in": admin_countries}}
        ]
    
    # Aggregation for summary
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": None,
            "total_transactions": {"$sum": 1},
            "total_volume": {"$sum": "$amount"},
            "total_fees": {"$sum": {"$add": [{"$ifNull": ["$fee", 0]}, {"$ifNull": ["$conversion_fee", 0]}]}},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}
        }}
    ]
    
    result = await db.transactions.aggregate(pipeline).to_list(1)
    summary = result[0] if result else {
        "total_transactions": 0, "total_volume": 0, "total_fees": 0,
        "completed": 0, "pending": 0, "failed": 0
    }
    
    # Daily breakdown for charts
    daily_pipeline = [
        {"$match": query},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "count": {"$sum": 1},
            "volume": {"$sum": "$amount"},
            "fees": {"$sum": {"$add": [{"$ifNull": ["$fee", 0]}, {"$ifNull": ["$conversion_fee", 0]}]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_data = await db.transactions.aggregate(daily_pipeline).to_list(100)
    
    # Type breakdown
    type_pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$type",
            "count": {"$sum": 1},
            "volume": {"$sum": "$amount"},
            "fees": {"$sum": {"$add": [{"$ifNull": ["$fee", 0]}, {"$ifNull": ["$conversion_fee", 0]}]}}
        }}
    ]
    type_data = await db.transactions.aggregate(type_pipeline).to_list(20)
    
    return {
        "period": period,
        "date_range": {"from": start_date.isoformat(), "to": end_date.isoformat()},
        "summary": {
            "total_transactions": summary.get("total_transactions", 0),
            "total_volume": round(summary.get("total_volume", 0), 2),
            "total_fees": round(summary.get("total_fees", 0), 2),
            "completed": summary.get("completed", 0),
            "pending": summary.get("pending", 0),
            "failed": summary.get("failed", 0)
        },
        "daily": [{"date": d["_id"], "count": d["count"], "volume": round(d["volume"], 2), "fees": round(d["fees"], 2)} for d in daily_data],
        "by_type": [{"type": t["_id"], "count": t["count"], "volume": round(t["volume"], 2), "fees": round(t["fees"], 2)} for t in type_data]
    }


