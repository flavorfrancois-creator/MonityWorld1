"""
Monity World - Savings Routes
=============================
Handles savings accounts: create, contribute, withdraw.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta

router = APIRouter(tags=["Savings"])


class SavingsReq(BaseModel):
    type: str = "flexible"  # flexible, fixed
    amount: float
    currency: str = "USD"
    duration_months: int = 3  # For fixed


class SavingsReqV2(BaseModel):
    name: str
    type: str = "flexible"
    target_amount: Optional[float] = None
    contribution_amount: float
    currency: str = "USD"
    frequency: str = "monthly"  # daily, weekly, biweekly, monthly, quarterly
    auto_debit: bool = False
    duration_months: Optional[int] = None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_id():
    import uuid
    return str(uuid.uuid4())


def setup_savings_routes(db, get_current_user):
    """Setup savings routes with dependencies"""
    
    @router.get("/savings")
    async def get_savings(u=Depends(get_current_user)):
        """Get all user savings"""
        return await db.savings.find({"user_id": u["id"]}, {"_id": 0}).to_list(50)

    @router.post("/savings")
    async def create_savings(req: SavingsReq, u=Depends(get_current_user)):
        """Create a new savings account"""
        w = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
        if not w or w["balance"] < req.amount:
            raise HTTPException(400, "Solde insuffisant")
        
        now_dt = datetime.now(timezone.utc)
        rate = 0.08 if req.type == "fixed" else 0.05
        locked = None
        if req.type == "fixed" and req.duration_months:
            locked = (now_dt + timedelta(days=30 * req.duration_months)).isoformat()
        
        doc = {
            "id": gen_id(), "user_id": u["id"], "type": req.type, "amount": req.amount,
            "currency": req.currency, "interest_rate": rate, "locked_until": locked,
            "status": "active", "created_at": now_dt.isoformat()
        }
        await db.savings.insert_one(doc)
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": req.currency},
            {"$inc": {"balance": -req.amount}}
        )
        doc.pop("_id", None)
        return doc

    @router.post("/savings/v2")
    async def create_savings_v2(req: SavingsReqV2, u=Depends(get_current_user)):
        """Create savings with advanced options"""
        now_dt = datetime.now(timezone.utc)
        rate = 0.08 if req.type == "fixed" else 0.05
        
        doc = {
            "id": gen_id(),
            "user_id": u["id"],
            "name": req.name,
            "type": req.type,
            "target_amount": req.target_amount,
            "contribution_amount": req.contribution_amount,
            "currency": req.currency,
            "frequency": req.frequency,
            "auto_debit": req.auto_debit,
            "duration_months": req.duration_months,
            "interest_rate": rate,
            "total_contributed": 0,
            "next_contribution_date": now_dt.isoformat(),
            "status": "active",
            "created_at": now_dt.isoformat()
        }
        await db.savings.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.post("/savings/{sid}/contribute")
    async def contribute_to_savings(sid: str, amount: float = Body(None, embed=True), u=Depends(get_current_user)):
        """Manual contribution to savings"""
        s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
        if not s:
            raise HTTPException(404, "Épargne non trouvée")
        if s.get("status") != "active":
            raise HTTPException(400, "Cette épargne n'est plus active")
        
        contribution = amount or s.get("contribution_amount", 0)
        if contribution <= 0:
            raise HTTPException(400, "Montant invalide")
        
        wallet = await db.wallets.find_one({"user_id": u["id"], "currency": s["currency"]})
        if not wallet or wallet["balance"] < contribution:
            raise HTTPException(400, "Solde insuffisant")
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": s["currency"]},
            {"$inc": {"balance": -contribution}}
        )
        
        new_total = s.get("total_contributed", s.get("amount", 0)) + contribution
        await db.savings.update_one(
            {"id": sid},
            {
                "$inc": {"total_contributed": contribution, "amount": contribution},
                "$set": {"last_contribution": now_iso()}
            }
        )
        
        return {
            "message": f"Contribution de {contribution} {s['currency']} effectuée",
            "new_total": new_total,
            "remaining": max(0, s.get("target_amount", 0) - new_total) if s.get("target_amount") else None
        }

    @router.patch("/savings/{sid}")
    async def update_savings_settings(
        sid: str,
        auto_debit: Optional[bool] = Body(None),
        frequency: Optional[str] = Body(None),
        contribution_amount: Optional[float] = Body(None),
        u=Depends(get_current_user)
    ):
        """Update savings settings"""
        s = await db.savings.find_one({"id": sid, "user_id": u["id"]})
        if not s:
            raise HTTPException(404, "Épargne non trouvée")
        
        update = {}
        if auto_debit is not None:
            update["auto_debit"] = auto_debit
        if frequency:
            update["frequency"] = frequency
        if contribution_amount is not None:
            update["contribution_amount"] = contribution_amount
        
        if update:
            update["updated_at"] = now_iso()
            await db.savings.update_one({"id": sid}, {"$set": update})
        
        return {"message": "Épargne mise à jour"}

    @router.delete("/savings/{sid}")
    async def withdraw_savings(sid: str, u=Depends(get_current_user)):
        """Withdraw all savings with interest"""
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
        
        cd = datetime.fromisoformat(s["created_at"])
        if cd.tzinfo is None:
            cd = cd.replace(tzinfo=timezone.utc)
        days = (datetime.now(timezone.utc) - cd).days
        interest = round(s["amount"] * s.get("interest_rate", 0.05) * (days / 365), 2)
        total = s["amount"] + interest
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": s["currency"]},
            {"$inc": {"balance": total}}
        )
        await db.savings.update_one({"id": sid}, {"$set": {"status": "completed"}})
        
        return {
            "message": "Épargne retirée avec succès",
            "amount": s["amount"],
            "interest": interest,
            "total": total
        }

    # Mobile app aliases
    @router.post("/savings/{sid}/deposit")
    async def savings_deposit_alias(sid: str, amount: float = Body(..., embed=True), u=Depends(get_current_user)):
        """Alias for contribute - Mobile app compatibility"""
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
        """Partial or full withdrawal - Mobile app compatibility"""
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
        interest = round(withdraw_amount * s.get("interest_rate", 0.05) * (days / 365), 2)
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

    return router
