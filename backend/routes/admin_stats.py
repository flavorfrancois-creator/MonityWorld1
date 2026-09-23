"""
Monity World - Admin Stats & KYC Routes
Extracted from server.py during refactoring
"""
import os
import logging
import random
import string
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, Request
from fastapi.responses import JSONResponse

ROOT_DIR = Path(__file__).parent.parent
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
from models.schemas import CurrencyUpdateReq, KYCPersonalInfoReq, TxActionReq, UserUpdateReq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=['Admin Stats & KYC'])

# === ADMIN ===
@router.get("/admin/stats")
async def admin_stats(country: str = "", adm=Depends(get_admin)):
    """Get dashboard statistics, filtered by admin's assigned countries"""
    # Build country filter based on admin permissions
    user_country_q = build_country_query(adm, country, "country")
    tx_country_q = build_transaction_country_query(adm, country)
    
    # Check if access is forbidden
    if user_country_q.get("__forbidden__") or tx_country_q.get("__forbidden__"):
        return {
            "total_users": 0, "total_transactions": 0,
            "pending_transactions": 0, "volume_30d": 0,
            "total_savings": 0, "daily_chart": [],
            "users_by_country": [], "tx_by_type": [],
            "filtered_by_country": country, "access_denied": True
        }
    
    # Get admin's allowed countries for display
    admin_countries = get_admin_country_filter(adm)
    
    total_users = await db.users.count_documents(user_country_q)
    
    # Transaction queries
    tx_base_q = tx_country_q.copy() if tx_country_q else {}
    total_tx = await db.transactions.count_documents(tx_base_q)
    
    pending_q = {"status": "pending"}
    pending_q.update(tx_base_q)
    pending_tx = await db.transactions.count_documents(pending_q)
    
    thirty_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    completed_q = {"created_at": {"$gte": thirty_ago}, "status": "completed"}
    completed_q.update(tx_base_q)
    recent_tx = await db.transactions.find(completed_q, {"_id": 0}).to_list(10000)
    volume = sum(t.get("amount", 0) for t in recent_tx)
    
    # Daily chart
    daily = []
    for i in range(6, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(days=i)
        ds = d.strftime("%Y-%m-%d")
        day_txs = [t for t in recent_tx if t.get("created_at", "").startswith(ds)]
        daily.append({"date": ds, "label": d.strftime("%d/%m"), "count": len(day_txs), "volume": sum(t.get("amount", 0) for t in day_txs)})
    
    # Users by country (filtered by admin's access)
    countries = {}
    async for u in db.users.find(user_country_q, {"country": 1, "_id": 0}):
        c = u.get("country", "Unknown")
        countries[c] = countries.get(c, 0) + 1
    
    # TX by type
    tx_type_pipeline = []
    if tx_base_q:
        tx_type_pipeline.append({"$match": tx_base_q})
    tx_type_pipeline.append({"$group": {"_id": "$type", "count": {"$sum": 1}}})
    tx_types_raw = await db.transactions.aggregate(tx_type_pipeline).to_list(20)
    tx_types = {t["_id"]: t["count"] for t in tx_types_raw if t["_id"]}
    
    # Total savings (filtered)
    total_savings = 0
    if user_country_q:
        user_ids = [u["id"] async for u in db.users.find(user_country_q, {"id": 1, "_id": 0})]
        async for w in db.wallets.find({"user_id": {"$in": user_ids}}, {"balance": 1, "_id": 0}):
            total_savings += w.get("balance", 0)
    else:
        async for w in db.wallets.find({}, {"balance": 1, "_id": 0}):
            total_savings += w.get("balance", 0)
    
    return {
        "total_users": total_users, "total_transactions": total_tx,
        "pending_transactions": pending_tx, "volume_30d": round(volume, 2),
        "total_savings": round(total_savings, 2),
        "daily_chart": daily,
        "users_by_country": [{"country": k, "count": v} for k, v in countries.items()],
        "tx_by_type": [{"type": k, "count": v} for k, v in tx_types.items()],
        "filtered_by_country": country if country else None,
        "admin_countries": admin_countries if admin_countries else "all"
    }


@router.get("/admin/transaction-categories")
async def admin_transaction_categories(country: str = "", adm=Depends(get_admin)):
    """Get detailed transaction categories for dashboard, filtered by admin's access"""
    tx_country_q = build_transaction_country_query(adm, country)
    user_country_q = build_country_query(adm, country, "country")
    
    # Check if access is forbidden
    if tx_country_q.get("__forbidden__"):
        return {
            "transfers": {"phone": {"count": 0, "volume": 0}, "card": {"count": 0, "volume": 0}, "payment_link": {"count": 0, "volume": 0}, "global": {"count": 0, "volume": 0}},
            "withdrawals": {"mobile_money": {"count": 0, "volume": 0}, "bank": {"count": 0, "volume": 0}, "visa": {"count": 0, "volume": 0}},
            "savings": {"total_amount": 0, "active_accounts": 0, "deposits_this_month": 0, "withdrawals_this_month": 0},
            "tontines": {"local": {"groups": 0, "members": 0, "volume": 0, "contributions": 0}, "international": {"groups": 0, "members": 0, "volume": 0, "contributions": 0}, "global": {"groups": 0, "members": 0, "volume": 0, "contributions": 0}},
            "filtered_by_country": country, "access_denied": True
        }
    
    # Get all transactions for analysis
    tx_query = {"status": {"$in": ["completed", "pending"]}}
    if tx_country_q:
        tx_query.update(tx_country_q)
    all_txs = await db.transactions.find(tx_query, {"_id": 0}).to_list(50000)
    
    # Transfers breakdown
    transfers = {
        "phone": {"count": 0, "volume": 0},
        "card": {"count": 0, "volume": 0},
        "payment_link": {"count": 0, "volume": 0},
        "global": {"count": 0, "volume": 0}
    }
    for tx in all_txs:
        if tx.get("type") == "transfer":
            amount = tx.get("amount", 0)
            if tx.get("via_card") or "card" in tx.get("description", "").lower():
                transfers["card"]["count"] += 1
                transfers["card"]["volume"] += amount
            elif tx.get("payment_link_id"):
                transfers["payment_link"]["count"] += 1
                transfers["payment_link"]["volume"] += amount
            elif tx.get("is_international"):
                transfers["global"]["count"] += 1
                transfers["global"]["volume"] += amount
            else:
                transfers["phone"]["count"] += 1
                transfers["phone"]["volume"] += amount
    
    # Withdrawals breakdown
    withdrawals = {
        "mobile_money": {"count": 0, "volume": 0},
        "bank": {"count": 0, "volume": 0},
        "visa": {"count": 0, "volume": 0}
    }
    for tx in all_txs:
        if tx.get("type") == "withdrawal":
            amount = tx.get("amount", 0)
            method = tx.get("description", "").lower()
            if "bank" in method or "bancaire" in method:
                withdrawals["bank"]["count"] += 1
                withdrawals["bank"]["volume"] += amount
            elif "visa" in method or "carte" in method:
                withdrawals["visa"]["count"] += 1
                withdrawals["visa"]["volume"] += amount
            else:
                withdrawals["mobile_money"]["count"] += 1
                withdrawals["mobile_money"]["volume"] += amount
    
    # Savings stats
    savings_query = {}
    if user_country_q:
        # Get user IDs for admin's allowed countries
        country_users = await db.users.find(user_country_q, {"id": 1, "_id": 0}).to_list(10000)
        country_user_ids = [u["id"] for u in country_users]
        savings_query = {"user_id": {"$in": country_user_ids}}
    
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    savings_deposits = len([tx for tx in all_txs if tx.get("type") == "savings_deposit" and tx.get("created_at", "") >= month_start])
    savings_withdrawals = len([tx for tx in all_txs if tx.get("type") == "savings_withdrawal" and tx.get("created_at", "") >= month_start])
    
    savings_wallets = await db.wallets.count_documents(savings_query) if savings_query else await db.wallets.count_documents({})
    total_savings = 0
    async for w in db.wallets.find(savings_query, {"balance": 1, "_id": 0}):
        total_savings += w.get("balance", 0)
    
    # Tontines (Groups) stats
    groups_query = {}
    if country:
        groups_query = {"$or": [
            {"creator_country": country.upper()},
            {"members_countries": country.upper()}
        ]}
    
    all_groups = await db.groups.find({}, {"_id": 0}).to_list(1000)
    
    tontines = {
        "local": {"groups": 0, "members": 0, "volume": 0, "contributions": 0},
        "international": {"groups": 0, "members": 0, "volume": 0, "contributions": 0},
        "global": {"groups": 0, "members": 0, "volume": 0, "contributions": 0}
    }
    
    for group in all_groups:
        members_count = len(group.get("members", []))
        total_collected = group.get("total_collected", 0)
        contributions = await db.group_contributions.count_documents({"group_id": group.get("id")})
        
        # Determine if local, international, or global
        if group.get("is_international"):
            tontines["international"]["groups"] += 1
            tontines["international"]["members"] += members_count
            tontines["international"]["volume"] += total_collected
            tontines["international"]["contributions"] += contributions
        elif group.get("is_global"):
            tontines["global"]["groups"] += 1
            tontines["global"]["members"] += members_count
            tontines["global"]["volume"] += total_collected
            tontines["global"]["contributions"] += contributions
        else:
            tontines["local"]["groups"] += 1
            tontines["local"]["members"] += members_count
            tontines["local"]["volume"] += total_collected
            tontines["local"]["contributions"] += contributions
    
    return {
        "transfers": transfers,
        "withdrawals": withdrawals,
        "savings": {
            "total_amount": round(total_savings, 2),
            "active_accounts": savings_wallets,
            "deposits_this_month": savings_deposits,
            "withdrawals_this_month": savings_withdrawals
        },
        "tontines": tontines,
        "filtered_by_country": country if country else None
    }


@router.get("/admin/users")
async def admin_get_users(page: int = 1, limit: int = 20, search: str = "", role: str = "", country: str = "", adm=Depends(get_admin)):
    """Get users filtered by admin's assigned countries"""
    skip = (page - 1) * limit
    
    # Build country filter based on admin permissions
    country_q = build_country_query(adm, country, "country")
    if country_q.get("__forbidden__"):
        return {"users": [], "total": 0, "page": page, "access_denied": True}
    
    q = country_q.copy() if country_q else {}
    if search: 
        search_q = {"$or": [{"name": {"$regex": search, "$options": "i"}}, {"phone": {"$regex": search, "$options": "i"}}]}
        if q:
            q = {"$and": [q, search_q]}
        else:
            q = search_q
    if role: q["role"] = role
    
    total = await db.users.count_documents(q)
    users = await db.users.find(q, {"_id": 0, "password": 0, "transaction_pin": 0}).skip(skip).limit(limit).to_list(limit)
    return {"users": users, "total": total, "page": page}

@router.patch("/admin/users/{uid}")
async def admin_update_user(uid: str, req: UserUpdateReq, adm=Depends(get_admin)):
    """Update user role or status. Only super admin can promote to admin/manager."""
    # Check if admin has access to this user's country
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    u = {k: v for k, v in req.model_dump().items() if v is not None}
    
    # Check if trying to change role to admin or manager
    if u.get("role") in ["admin", "manager"]:
        # Only super admin can promote to admin/manager
        if not adm.get("is_super_admin"):
            raise HTTPException(403, "Seul l'administrateur principal peut nommer des administrateurs ou gestionnaires")
        
        # Cannot demote super admin
        if user.get("is_super_admin"):
            raise HTTPException(403, "Impossible de modifier le rôle de l'administrateur principal")
        
        # When promoting, reset KYC if not already approved (admins need KYC too)
        if user.get("kyc_status") != "approved":
            u["kyc_status"] = "pending"
    
    if u: 
        await db.users.update_one({"id": uid}, {"$set": u})
        
        # Send notification if role changed
        if req.role and req.role != user.get("role"):
            role_names = {
                "admin": "Administrateur",
                "manager": "Gestionnaire",
                "merchant": "Marchand",
                "client": "Client"
            }
            await db.notifications.insert_one({
                "id": gen_id(),
                "user_id": uid,
                "type": "role_change",
                "title": "Rôle modifié",
                "message": f"Votre rôle a été modifié en: {role_names.get(req.role, req.role)}. Veuillez compléter votre vérification KYC si ce n'est pas déjà fait.",
                "is_read": False,
                "created_at": now_iso()
            })
    
    return {"message": "Utilisateur mis à jour"}


@router.post("/admin/users/{uid}/promote")
async def admin_promote_user(uid: str, role: str, adm=Depends(get_admin_with_kyc)):
    """Promote a user to admin or manager. Only super admin can do this. Requires approved KYC."""
    # Only super admin or primary admin can promote
    if not adm.get("is_super_admin") and not is_original_primary_admin(adm):
        raise HTTPException(403, "Seul l'administrateur principal peut nommer des administrateurs ou gestionnaires")
    
    if role not in ["admin", "manager"]:
        raise HTTPException(400, "Rôle invalide. Utilisez 'admin' ou 'manager'")
    
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    if user.get("is_super_admin"):
        raise HTTPException(403, "Impossible de modifier l'administrateur principal")
    
    # Update user role
    update_data = {
        "role": role,
        "promoted_at": now_iso(),
        "promoted_by": adm["id"],
        "promoted_by_name": adm["name"]
    }
    
    # If KYC not approved, set to pending (new admins need KYC)
    if user.get("kyc_status") != "approved":
        update_data["kyc_status"] = "pending"
    
    await db.users.update_one({"id": uid}, {"$set": update_data})
    
    # Send notification
    role_name = "Administrateur" if role == "admin" else "Gestionnaire"
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "promotion",
        "title": f"Promotion: {role_name}",
        "message": f"Félicitations ! Vous avez été promu(e) au rôle de {role_name}. Veuillez compléter votre vérification d'identité (KYC) pour activer toutes les fonctionnalités.",
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {
        "message": f"Utilisateur promu en {role_name}",
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "new_role": role
    }

@router.patch("/admin/users/{uid}/kyc/{action}")
async def admin_kyc(uid: str, action: str, note: str = "", adm=Depends(get_admin)):
    """Approve or reject user KYC"""
    # Check if admin has access to this user's country
    user = await db.users.find_one({"id": uid}, {"country": 1, "name": 1, "phone": 1})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    s = "approved" if action == "approve" else "rejected"
    update_data = {
        "kyc_status": s,
        "kyc_reviewed_at": now_iso(),
        "kyc_reviewed_by": adm["id"],
        "kyc_reviewer_name": adm["name"]
    }
    if note:
        update_data["kyc_review_note"] = note
    
    await db.users.update_one({"id": uid}, {"$set": update_data})
    
    # Send notification to user
    status_text = "approuvé" if action == "approve" else "rejeté"
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "kyc_review",
        "title": f"Vérification d'identité {status_text}e",
        "message": f"Votre vérification d'identité a été {status_text}e." + (f" Note: {note}" if note else ""),
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {"message": f"KYC {s}", "user_name": user.get("name"), "user_phone": user.get("phone")}


@router.get("/admin/kyc/pending")
async def admin_get_pending_kyc(page: int = 1, limit: int = 20, status: str = "submitted", adm=Depends(get_admin)):
    """Get all users with pending KYC verification"""
    skip = (page - 1) * limit
    
    # Build country filter based on admin access
    country_filter = build_country_query(adm, "", "country")
    if country_filter.get("__forbidden__"):
        return {"users": [], "total": 0, "page": page}
    
    # Filter by status (submitted, clarification_needed, or both)
    if status == "all":
        q = {"kyc_status": {"$in": ["submitted", "clarification_needed"]}}
    else:
        q = {"kyc_status": status}
    
    if country_filter:
        q.update(country_filter)
    
    total = await db.users.count_documents(q)
    users = await db.users.find(
        q, 
        {"_id": 0, "password": 0, "otp": 0, "reset_token": 0}
    ).sort("kyc_submitted_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "users": users,
        "total": total,
        "page": page,
        "pages": -(-total // limit)
    }


@router.get("/admin/kyc/stats")
async def get_kyc_stats(period: str = "month", adm=Depends(get_admin)):
    """Get KYC performance statistics for dashboard"""
    check_permission(adm, "kyc.view")
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    if period == "week":
        start_date = now - timedelta(days=7)
        prev_start = now - timedelta(days=14)
        prev_end = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
        prev_start = now - timedelta(days=60)
        prev_end = now - timedelta(days=30)
    elif period == "quarter":
        start_date = now - timedelta(days=90)
        prev_start = now - timedelta(days=180)
        prev_end = now - timedelta(days=90)
    elif period == "year":
        start_date = now - timedelta(days=365)
        prev_start = now - timedelta(days=730)
        prev_end = now - timedelta(days=365)
    else:
        start_date = now - timedelta(days=30)
        prev_start = now - timedelta(days=60)
        prev_end = now - timedelta(days=30)
    
    start_iso = start_date.isoformat()
    prev_start_iso = prev_start.isoformat()
    prev_end_iso = prev_end.isoformat()
    
    # Apply country restrictions
    admin_countries = get_accessible_countries(adm)
    country_match = {"country": {"$in": admin_countries}} if admin_countries else {}
    
    # Get total requests in period
    current_query = {"kyc_submitted_at": {"$gte": start_iso}}
    if country_match:
        current_query.update(country_match)
    total_requests = await db.users.count_documents(current_query)
    
    # Get status breakdown
    status_pipeline = [
        {"$match": {"kyc_status": {"$ne": "pending"}, **country_match}},
        {"$group": {"_id": "$kyc_status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    status_breakdown = await db.users.aggregate(status_pipeline).to_list(10)
    
    # Calculate approval and rejection rates
    approved_count = next((s["count"] for s in status_breakdown if s["_id"] == "approved"), 0)
    rejected_count = next((s["count"] for s in status_breakdown if s["_id"] == "rejected"), 0)
    total_processed = approved_count + rejected_count
    
    approval_rate = approved_count / total_processed if total_processed > 0 else 0
    rejection_rate = rejected_count / total_processed if total_processed > 0 else 0
    
    # Previous period approval rate for comparison
    prev_query = {"kyc_submitted_at": {"$gte": prev_start_iso, "$lt": prev_end_iso}, "kyc_status": "approved"}
    if country_match:
        prev_query.update(country_match)
    prev_approved = await db.users.count_documents(prev_query)
    
    prev_total_query = {"kyc_submitted_at": {"$gte": prev_start_iso, "$lt": prev_end_iso}, "kyc_status": {"$in": ["approved", "rejected"]}}
    if country_match:
        prev_total_query.update(country_match)
    prev_total = await db.users.count_documents(prev_total_query)
    previous_approval_rate = prev_approved / prev_total if prev_total > 0 else 0
    
    # Pending count
    pending_query = {"kyc_status": {"$in": ["submitted", "under_review", "clarification_needed"]}}
    if country_match:
        pending_query.update(country_match)
    pending_count = await db.users.count_documents(pending_query)
    
    # Average processing time (from submitted to approved/rejected)
    time_pipeline = [
        {"$match": {"kyc_status": {"$in": ["approved", "rejected"]}, "kyc_submitted_at": {"$exists": True}, "kyc_reviewed_at": {"$exists": True}, **country_match}},
        {"$limit": 1000},
        {"$project": {
            "submitted": {"$dateFromString": {"dateString": "$kyc_submitted_at", "onError": None}},
            "reviewed": {"$dateFromString": {"dateString": "$kyc_reviewed_at", "onError": None}}
        }},
        {"$match": {"submitted": {"$ne": None}, "reviewed": {"$ne": None}}},
        {"$project": {
            "processing_hours": {"$divide": [{"$subtract": ["$reviewed", "$submitted"]}, 3600000]}
        }},
        {"$group": {"_id": None, "avg_hours": {"$avg": "$processing_hours"}}}
    ]
    time_result = await db.users.aggregate(time_pipeline).to_list(1)
    avg_processing_time = time_result[0]["avg_hours"] if time_result else None
    
    # Daily trend for chart
    trend_pipeline = [
        {"$match": {"kyc_submitted_at": {"$gte": start_iso}, **country_match}},
        {"$group": {
            "_id": {"$substr": ["$kyc_submitted_at", 0, 10]},
            "submitted": {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$kyc_status", "approved"]}, 1, 0]}},
            "rejected": {"$sum": {"$cond": [{"$eq": ["$kyc_status", "rejected"]}, 1, 0]}}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_trend = await db.users.aggregate(trend_pipeline).to_list(100)
    
    # Rejected documents analysis
    doc_pipeline = [
        {"$match": {"kyc_status": "rejected", **country_match}},
        {"$lookup": {"from": "kyc_documents", "localField": "id", "foreignField": "user_id", "as": "documents"}},
        {"$unwind": {"path": "$documents", "preserveNullAndEmptyArrays": False}},
        {"$group": {"_id": "$documents.document_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    rejected_docs = await db.users.aggregate(doc_pipeline).to_list(10)
    
    # Rejection reasons
    reasons_pipeline = [
        {"$match": {"kyc_status": "rejected", "kyc_rejection_reason": {"$exists": True, "$ne": ""}, **country_match}},
        {"$group": {"_id": "$kyc_rejection_reason", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    rejection_reasons = await db.users.aggregate(reasons_pipeline).to_list(10)
    
    # Processing time by document type
    doc_time_pipeline = [
        {"$match": {"kyc_status": {"$in": ["approved", "rejected"]}, "kyc_submitted_at": {"$exists": True}, "kyc_reviewed_at": {"$exists": True}, **country_match}},
        {"$lookup": {"from": "kyc_documents", "localField": "id", "foreignField": "user_id", "as": "documents"}},
        {"$unwind": {"path": "$documents", "preserveNullAndEmptyArrays": False}},
        {"$project": {
            "document_type": "$documents.document_type",
            "submitted": {"$dateFromString": {"dateString": "$kyc_submitted_at", "onError": None}},
            "reviewed": {"$dateFromString": {"dateString": "$kyc_reviewed_at", "onError": None}}
        }},
        {"$match": {"submitted": {"$ne": None}, "reviewed": {"$ne": None}}},
        {"$group": {
            "_id": "$document_type",
            "avg_hours": {"$avg": {"$divide": [{"$subtract": ["$reviewed", "$submitted"]}, 3600000]}},
            "total_count": {"$sum": 1}
        }},
        {"$sort": {"total_count": -1}}
    ]
    processing_time_by_doc = await db.users.aggregate(doc_time_pipeline).to_list(10)
    
    # OCR stats if available
    ocr_pipeline = [
        {"$match": {"ocr_confidence": {"$exists": True}, **country_match}},
        {"$group": {
            "_id": None,
            "total_analyzed": {"$sum": 1},
            "avg_confidence": {"$avg": "$ocr_confidence"},
            "pre_approved": {"$sum": {"$cond": [{"$eq": ["$kyc_status", "pre_approved"]}, 1, 0]}}
        }}
    ]
    ocr_result = await db.users.aggregate(ocr_pipeline).to_list(1)
    ocr_stats = None
    if ocr_result:
        ocr_data = ocr_result[0]
        ocr_stats = {
            "total_analyzed": ocr_data.get("total_analyzed", 0),
            "avg_confidence": ocr_data.get("avg_confidence", 0),
            "pre_approved": ocr_data.get("pre_approved", 0),
            "pre_approval_rate": ocr_data["pre_approved"] / ocr_data["total_analyzed"] if ocr_data["total_analyzed"] > 0 else 0
        }
    
    return {
        "period": period,
        "total_requests": total_requests,
        "approval_rate": approval_rate,
        "previous_approval_rate": previous_approval_rate,
        "rejection_rate": rejection_rate,
        "avg_processing_time": avg_processing_time,
        "pending_count": pending_count,
        "by_status": [{"status": s["_id"], "count": s["count"]} for s in status_breakdown],
        "daily_trend": [{"date": d["_id"], "submitted": d["submitted"], "approved": d["approved"], "rejected": d["rejected"]} for d in daily_trend],
        "rejected_documents": [{"document_type": d["_id"], "count": d["count"]} for d in rejected_docs],
        "rejection_reasons": [{"reason": r["_id"], "count": r["count"]} for r in rejection_reasons],
        "processing_time_by_doc": [{"document_type": p["_id"], "avg_hours": round(p["avg_hours"], 2), "total_count": p["total_count"]} for p in processing_time_by_doc],
        "ocr_stats": ocr_stats
    }


@router.get("/admin/users/{uid}/kyc-documents")
async def admin_get_user_kyc_documents(uid: str, adm=Depends(get_admin)):
    """Get KYC documents for a specific user"""
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0, "otp": 0, "reset_token": 0})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check admin access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    return {
        "user": {
            "id": user["id"],
            "name": user.get("name"),
            "phone": user.get("phone"),
            "email": user.get("email"),
            "country": user.get("country"),
            "profile_image": user.get("profile_image"),
            "kyc_status": user.get("kyc_status"),
            "kyc_submitted_at": user.get("kyc_submitted_at"),
            "kyc_reviewed_at": user.get("kyc_reviewed_at"),
            "kyc_reviewer_name": user.get("kyc_reviewer_name"),
            "kyc_review_note": user.get("kyc_review_note"),
            "created_at": user.get("created_at")
        },
        "personal_info": user.get("kyc_personal_info", {}),
        "documents": user.get("kyc_documents", []),
        "discrepancies": user.get("kyc_discrepancies", [])
    }


@router.post("/admin/users/{uid}/kyc/discrepancy")
async def admin_report_discrepancy(uid: str, field: str, expected: str = "", found: str = "", note: str = "", adm=Depends(get_admin)):
    """Report a discrepancy between personal info and document"""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check admin access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    # Add discrepancy
    discrepancy = {
        "id": gen_id(),
        "field": field,
        "field_label": {
            "last_name": "Nom",
            "first_name": "Prénom",
            "date_of_birth": "Date de naissance",
            "place_of_birth": "Lieu de naissance",
            "occupation": "Emploi",
            "residence_address": "Adresse de résidence",
            "postal_box": "Boîte postale",
            "postal_code": "Code postal",
            "street": "Rue",
            "city": "Ville",
            "document": "Document",
            "photo": "Photo",
            "other": "Autre"
        }.get(field, field),
        "expected_value": expected,
        "found_value": found,
        "note": note,
        "reported_by": adm["id"],
        "reported_by_name": adm["name"],
        "reported_at": now_iso(),
        "status": "pending"  # pending, clarified, resolved
    }
    
    existing_discrepancies = user.get("kyc_discrepancies", [])
    existing_discrepancies.append(discrepancy)
    
    await db.users.update_one({"id": uid}, {"$set": {
        "kyc_discrepancies": existing_discrepancies,
        "kyc_status": "clarification_needed"
    }})
    
    # Send notification to user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "kyc_discrepancy",
        "title": "Clarification requise - KYC",
        "message": f"Une divergence a été détectée sur votre {discrepancy['field_label']}. Veuillez vérifier vos informations.",
        "is_read": False,
        "created_at": now_iso()
    })
    
    return {"message": "Divergence signalée", "discrepancy": discrepancy}


@router.post("/profile/kyc/clarify")
async def clarify_discrepancy(discrepancy_id: str, clarification: str, u=Depends(get_current_user)):
    """User clarifies a discrepancy"""
    user = await db.users.find_one({"id": u["id"]})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    discrepancies = user.get("kyc_discrepancies", [])
    updated = False
    
    for d in discrepancies:
        if d.get("id") == discrepancy_id:
            d["clarification"] = clarification
            d["clarified_at"] = now_iso()
            d["status"] = "clarified"
            updated = True
            break
    
    if not updated:
        raise HTTPException(404, "Divergence non trouvée")
    
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "kyc_discrepancies": discrepancies,
        "kyc_status": "submitted"  # Back to submitted for review
    }})
    
    return {"message": "Clarification envoyée"}


# === OCR SERVICE FOR KYC ===
from services.ocr_service import get_ocr_service, manual_validation_required, OCRService

# KYC Auto-approval settings
KYC_AUTO_APPROVAL_CONFIG = {
    "enabled": False,  # Default to manual mode
    "ocr_confidence_threshold": 0.90,  # 90% OCR confidence required
    "match_score_threshold": 0.90,  # 90% field match score required
}

@router.get("/admin/kyc/settings")
async def get_kyc_settings(adm=Depends(get_admin)):
    """Get current KYC auto-approval settings."""
    # Get settings from database or use defaults
    settings = await db.settings.find_one({"key": "kyc_auto_approval"})
    if settings:
        return {
            "enabled": settings.get("enabled", False),
            "ocr_confidence_threshold": settings.get("ocr_confidence_threshold", 0.90),
            "match_score_threshold": settings.get("match_score_threshold", 0.90)
        }
    return KYC_AUTO_APPROVAL_CONFIG

@router.put("/admin/kyc/settings")
async def update_kyc_settings(enabled: bool, ocr_threshold: float = 0.90, match_threshold: float = 0.90, adm=Depends(get_admin)):
    """Toggle KYC auto-approval mode."""
    if adm.get("role") != "admin":
        raise HTTPException(403, "Seul un administrateur peut modifier ces paramètres")
    
    await db.settings.update_one(
        {"key": "kyc_auto_approval"},
        {"$set": {
            "key": "kyc_auto_approval",
            "enabled": enabled,
            "ocr_confidence_threshold": ocr_threshold,
            "match_score_threshold": match_threshold,
            "updated_by": adm["id"],
            "updated_at": now_iso()
        }},
        upsert=True
    )
    
    mode = "automatique (pré-approbation)" if enabled else "manuel"
    return {"message": f"Mode KYC basculé en {mode}", "enabled": enabled}

@router.post("/admin/kyc/{uid}/ocr-analyze")
async def admin_ocr_analyze_document(uid: str, document_index: int = 0, adm=Depends(get_admin)):
    """
    Run OCR analysis on a user's KYC document.
    Automatically compares extracted data with user-provided information.
    """
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check admin access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    documents = user.get("kyc_documents", [])
    if not documents:
        raise HTTPException(400, "Aucun document KYC trouvé")
    
    if document_index >= len(documents):
        raise HTTPException(400, f"Index de document invalide. {len(documents)} documents disponibles.")
    
    doc = documents[document_index]
    file_path = ROOT_DIR / "uploads" / "kyc" / doc.get("filename", "")
    
    if not file_path.exists():
        raise HTTPException(404, "Fichier document non trouvé")
    
    # Read file content
    with open(file_path, "rb") as f:
        image_content = f.read()
    
    # Get OCR service
    # Check if Google credentials are configured in env
    google_creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    ocr_service = get_ocr_service(google_creds_path)
    
    # Get user personal info for comparison
    personal_info = user.get("kyc_personal_info", {})
    document_type = doc.get("document_type", "national_id")
    
    # Process document
    result = await ocr_service.process_kyc_document(
        image_content,
        document_type,
        personal_info
    )
    
    # Store OCR result in user record
    ocr_results = user.get("kyc_ocr_results", {})
    ocr_results[doc.get("id", str(document_index))] = result
    
    await db.users.update_one({"id": uid}, {"$set": {
        "kyc_ocr_results": ocr_results,
        "kyc_last_ocr_at": now_iso()
    }})
    
    # If discrepancies found, automatically create discrepancy records
    if result.get("comparison_result") and result["comparison_result"].get("discrepancies"):
        existing_discrepancies = user.get("kyc_discrepancies", [])
        
        for disc in result["comparison_result"]["discrepancies"]:
            # Check if this field already has a pending discrepancy
            if not any(d.get("field") == disc["field"] and d.get("status") == "pending" for d in existing_discrepancies):
                new_disc = {
                    "id": gen_id(),
                    "field": disc["field"],
                    "field_label": disc["field_label"],
                    "expected_value": disc["expected"],
                    "found_value": disc["found"],
                    "score": disc["score"],
                    "note": f"Détecté automatiquement par OCR (score: {disc['score']:.0%})",
                    "reported_by": adm["id"],
                    "reported_by_name": "Système OCR",
                    "reported_at": now_iso(),
                    "status": "pending",
                    "source": "ocr_auto"
                }
                existing_discrepancies.append(new_disc)
        
        if existing_discrepancies:
            await db.users.update_one({"id": uid}, {"$set": {
                "kyc_discrepancies": existing_discrepancies,
                "kyc_status": "clarification_needed"
            }})
            
            # Notify user
            await db.notifications.insert_one({
                "id": gen_id(),
                "user_id": uid,
                "type": "kyc_ocr_discrepancy",
                "title": "Vérification KYC - Divergences détectées",
                "message": f"{len(result['comparison_result']['discrepancies'])} divergence(s) détectée(s) entre vos informations et votre document. Veuillez vérifier.",
                "is_read": False,
                "created_at": now_iso()
            })
    
    # Check for auto-approval / pre-approval
    pre_approved = False
    auto_approval_note = None
    
    # Get auto-approval settings
    settings = await db.settings.find_one({"key": "kyc_auto_approval"})
    auto_enabled = settings.get("enabled", False) if settings else False
    ocr_threshold = settings.get("ocr_confidence_threshold", 0.90) if settings else 0.90
    match_threshold = settings.get("match_score_threshold", 0.90) if settings else 0.90
    
    if auto_enabled and result.get("ocr_success"):
        ocr_confidence = result.get("ocr_confidence", 0)
        comparison = result.get("comparison_result", {})
        overall_score = comparison.get("overall_score", 0)
        has_discrepancies = len(comparison.get("discrepancies", [])) > 0
        
        # Check if meets auto-approval criteria
        if (ocr_confidence >= ocr_threshold and 
            overall_score >= match_threshold and 
            not has_discrepancies):
            
            pre_approved = True
            auto_approval_note = f"Pré-approuvé automatiquement - OCR: {ocr_confidence:.0%}, Correspondance: {overall_score:.0%}. En attente de vérification finale par l'administrateur."
            
            # Update user status to pre-approved
            await db.users.update_one({"id": uid}, {"$set": {
                "kyc_status": "pre_approved",
                "kyc_pre_approved_at": now_iso(),
                "kyc_pre_approval_note": auto_approval_note,
                "kyc_ocr_confidence": ocr_confidence,
                "kyc_match_score": overall_score
            }})
            
            # Create admin notification for final review
            await db.notifications.insert_one({
                "id": gen_id(),
                "user_id": adm["id"],  # Notify admin
                "type": "kyc_pre_approved",
                "title": "KYC Pré-approuvé - Vérification requise",
                "message": f"Le KYC de {user.get('name')} a été pré-approuvé automatiquement (OCR: {ocr_confidence:.0%}, Correspondance: {overall_score:.0%}). Veuillez effectuer une vérification finale.",
                "is_read": False,
                "created_at": now_iso(),
                "related_user_id": uid
            })
            
            # Notify user of pre-approval
            await db.notifications.insert_one({
                "id": gen_id(),
                "user_id": uid,
                "type": "kyc_pre_approved",
                "title": "KYC Pré-approuvé",
                "message": "Votre vérification d'identité a été pré-approuvée. En attente de la validation finale par un administrateur.",
                "is_read": False,
                "created_at": now_iso()
            })
    
    return {
        "message": "Analyse OCR terminée" if result.get("ocr_success") else "Validation manuelle requise",
        "result": result,
        "discrepancies_found": len(result.get("comparison_result", {}).get("discrepancies", [])),
        "requires_manual_review": result.get("requires_manual_review", True),
        "pre_approved": pre_approved,
        "auto_approval_note": auto_approval_note
    }


@router.get("/admin/kyc/pre-approved")
async def get_pre_approved_kyc(page: int = 1, limit: int = 20, adm=Depends(get_admin)):
    """Get list of pre-approved KYC submissions awaiting final review."""
    skip = (page - 1) * limit
    admin_countries = get_admin_country_filter(adm)
    
    query = {"kyc_status": "pre_approved"}
    if admin_countries:
        query["country"] = {"$in": admin_countries}
    
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {
        "_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "country": 1,
        "profile_image": 1, "kyc_status": 1, "kyc_pre_approved_at": 1,
        "kyc_pre_approval_note": 1, "kyc_ocr_confidence": 1, "kyc_match_score": 1,
        "created_at": 1
    }).sort("kyc_pre_approved_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "users": users,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit
    }


@router.post("/admin/kyc/{uid}/final-approve")
async def final_approve_kyc(uid: str, note: str = "", adm=Depends(get_admin)):
    """Final approval of a pre-approved KYC submission."""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    if user.get("kyc_status") != "pre_approved":
        raise HTTPException(400, "Ce KYC n'est pas en état de pré-approbation")
    
    n = now_iso()
    final_note = note or f"Approbation finale après pré-approbation automatique. Vérifié par {adm['name']}."
    
    await db.users.update_one({"id": uid}, {"$set": {
        "kyc_status": "approved",
        "kyc_approved_at": n,
        "kyc_approved_by": adm["id"],
        "kyc_approved_by_name": adm["name"],
        "kyc_final_approval_note": final_note,
        "is_verified": True
    }})
    
    # Notify user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "kyc_approved",
        "title": "KYC Approuvé",
        "message": "Félicitations ! Votre vérification d'identité a été définitivement approuvée.",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "KYC approuvé définitivement", "kyc_status": "approved"}


@router.post("/admin/kyc/{uid}/revoke-pre-approval")
async def revoke_pre_approval(uid: str, reason: str = "", adm=Depends(get_admin)):
    """Revoke a pre-approved KYC and send back for review."""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    if user.get("kyc_status") != "pre_approved":
        raise HTTPException(400, "Ce KYC n'est pas en état de pré-approbation")
    
    n = now_iso()
    
    await db.users.update_one({"id": uid}, {"$set": {
        "kyc_status": "submitted",  # Back to review queue
        "kyc_pre_approval_revoked_at": n,
        "kyc_pre_approval_revoked_by": adm["id"],
        "kyc_pre_approval_revoke_reason": reason or "Vérification manuelle requise"
    }})
    
    # Notify user
    await db.notifications.insert_one({
        "id": gen_id(),
        "user_id": uid,
        "type": "kyc_review",
        "title": "KYC en cours de révision",
        "message": reason or "Votre vérification d'identité nécessite une révision manuelle supplémentaire.",
        "is_read": False,
        "created_at": n
    })
    
    return {"message": "Pré-approbation révoquée, KYC remis en file d'attente"}


@router.get("/admin/kyc/{uid}/ocr-results")
async def admin_get_ocr_results(uid: str, adm=Depends(get_admin)):
    """Get OCR analysis results for a user's KYC documents."""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check admin access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    return {
        "ocr_results": user.get("kyc_ocr_results", {}),
        "last_ocr_at": user.get("kyc_last_ocr_at"),
        "discrepancies": user.get("kyc_discrepancies", []),
        "personal_info": user.get("kyc_personal_info", {})
    }


@router.get("/admin/ocr/status")
async def admin_get_ocr_status(adm=Depends(get_admin)):
    """Check if OCR service is available and configured."""
    google_creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
    ocr_service = get_ocr_service(google_creds_path)
    
    # Get auto-approval settings
    settings = await db.settings.find_one({"key": "kyc_auto_approval"})
    auto_approval = {
        "enabled": settings.get("enabled", False) if settings else False,
        "ocr_confidence_threshold": settings.get("ocr_confidence_threshold", 0.90) if settings else 0.90,
        "match_score_threshold": settings.get("match_score_threshold", 0.90) if settings else 0.90
    }
    
    # Count pre-approved awaiting final review
    pre_approved_count = await db.users.count_documents({"kyc_status": "pre_approved"})
    
    return {
        "ocr_available": ocr_service.ocr_enabled,
        "provider": "Google Cloud Vision" if ocr_service.ocr_enabled else None,
        "fallback": "Validation manuelle",
        "message": "OCR configuré et disponible" if ocr_service.ocr_enabled else "OCR non configuré. Utilisez la validation manuelle.",
        "auto_approval": auto_approval,
        "pre_approved_count": pre_approved_count
    }


@router.patch("/admin/kyc/{uid}/discrepancy/{disc_id}")
async def admin_resolve_discrepancy(uid: str, disc_id: str, action: str, note: str = "", adm=Depends(get_admin)):
    """Admin resolves or updates a discrepancy status."""
    user = await db.users.find_one({"id": uid})
    if not user:
        raise HTTPException(404, "Utilisateur non trouvé")
    
    # Check admin access
    admin_countries = get_admin_country_filter(adm)
    if admin_countries and user.get("country") not in admin_countries:
        raise HTTPException(403, "Vous n'avez pas accès à cet utilisateur")
    
    if action not in ["resolve", "reject", "request_clarification"]:
        raise HTTPException(400, "Action invalide. Utilisez: resolve, reject, request_clarification")
    
    discrepancies = user.get("kyc_discrepancies", [])
    updated = False
    
    for d in discrepancies:
        if d.get("id") == disc_id:
            if action == "resolve":
                d["status"] = "resolved"
                d["resolved_by"] = adm["id"]
                d["resolved_by_name"] = adm["name"]
                d["resolved_at"] = now_iso()
                d["resolution_note"] = note
            elif action == "reject":
                d["status"] = "rejected"
                d["rejected_by"] = adm["id"]
                d["rejected_by_name"] = adm["name"]
                d["rejected_at"] = now_iso()
                d["rejection_note"] = note
            elif action == "request_clarification":
                d["status"] = "pending"
                d["note"] = note or d.get("note", "")
            updated = True
            break
    
    if not updated:
        raise HTTPException(404, "Divergence non trouvée")
    
    # Check if all discrepancies are resolved
    pending_count = sum(1 for d in discrepancies if d.get("status") == "pending")
    
    new_status = user.get("kyc_status", "submitted")
    if pending_count == 0 and action == "resolve":
        new_status = "submitted"  # Back to review queue
    elif action == "reject":
        new_status = "rejected"
    
    await db.users.update_one({"id": uid}, {"$set": {
        "kyc_discrepancies": discrepancies,
        "kyc_status": new_status
    }})
    
    return {
        "message": f"Divergence {'résolue' if action == 'resolve' else 'rejetée' if action == 'reject' else 'en attente de clarification'}",
        "pending_discrepancies": pending_count,
        "kyc_status": new_status
    }


@router.get("/admin/transactions")
async def admin_get_txs(page: int = 1, limit: int = 20, status: str = "", type: str = "", country: str = "", adm=Depends(get_admin)):
    """Get transactions filtered by admin's assigned countries"""
    skip = (page - 1) * limit
    
    # Build base query with admin's country restrictions
    tx_country_q = build_transaction_country_query(adm, country)
    
    if tx_country_q.get("__forbidden__"):
        return {"transactions": [], "total": 0, "page": page, "access_denied": True}
    
    q = tx_country_q.copy() if tx_country_q else {}
    if status: q["status"] = status
    if type: q["type"] = type
    
    total = await db.transactions.count_documents(q)
    txs = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"transactions": txs, "total": total, "page": page}

@router.patch("/admin/transactions/{tx_id}")
async def admin_tx_action(tx_id: str, req: TxActionReq, adm=Depends(get_admin)):
    tx = await db.transactions.find_one({"id": tx_id})
    if not tx: raise HTTPException(404, "Transaction non trouvée")
    n = now_iso()
    if req.action == "approve":
        await db.transactions.update_one({"id": tx_id}, {"$set": {"status": "completed", "completed_at": n, "admin_note": req.note}})
        # Credit receiver for transfers and recharges
        if tx.get("receiver_id") and tx.get("type") in ["transfer", "recharge"]:
            rw = await db.wallets.find_one({"user_id": tx["receiver_id"], "currency": tx.get("currency", "USD")})
            if rw:
                await db.wallets.update_one({"user_id": tx["receiver_id"], "currency": tx.get("currency", "USD")}, {"$inc": {"balance": tx["amount"]}})
            else:
                await db.wallets.insert_one({"id": gen_id(), "user_id": tx["receiver_id"], "currency": tx.get("currency", "USD"), "balance": tx["amount"], "is_primary": False, "created_at": n})
        return {"message": "Transaction approuvée"}
    else:
        await db.transactions.update_one({"id": tx_id}, {"$set": {"status": "rejected", "completed_at": n, "admin_note": req.note}})
        # Refund sender for rejected transfers and withdrawals
        if tx.get("sender_id") and tx.get("type") in ["transfer", "withdrawal"]:
            await db.wallets.update_one({"user_id": tx["sender_id"], "currency": tx.get("currency", "USD")}, {"$inc": {"balance": tx["amount"] + tx.get("fee", 0)}})
        return {"message": "Transaction rejetée"}

@router.get("/admin/currencies")
async def admin_currencies(adm=Depends(get_admin)):
    return await db.currencies.find({}, {"_id": 0}).to_list(100)

@router.patch("/admin/currencies/{code}")
async def admin_update_currency(code: str, req: CurrencyUpdateReq, adm=Depends(get_admin)):
    await db.currencies.update_one({"code": code.upper()}, {"$set": {"rate_to_usd": req.rate_to_usd, "is_active": req.is_active, "last_updated": now_iso()}})
    return {"message": "Taux mis à jour"}


