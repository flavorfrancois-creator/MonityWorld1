"""
Monity World - Transactions Routes
==================================
Handles transaction history and mobile app aliases.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

router = APIRouter(tags=["Transactions"])


class TransferReq(BaseModel):
    receiver_phone: Optional[str] = None
    receiver_account: Optional[str] = None
    amount: float
    currency: str = "USD"
    target_currency: Optional[str] = None
    description: Optional[str] = None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_id():
    import uuid
    return str(uuid.uuid4())


def setup_transactions_routes(db, get_current_user, get_transaction_rule, get_international_rule, calculate_fee, check_transaction_limits, get_exchange_rate):
    """Setup transaction routes with dependencies"""
    
    # === Mobile App Aliases ===
    
    @router.get("/transactions/history")
    async def transactions_history(page: int = 1, limit: int = 20, u=Depends(get_current_user)):
        """Get transaction history - Mobile app compatibility"""
        skip = (page - 1) * limit
        q = {"$or": [{"sender_id": u["id"]}, {"receiver_id": u["id"]}]}
        total = await db.transactions.count_documents(q)
        txs = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        return {"transactions": txs, "total": total, "page": page, "pages": -(-total // limit)}

    @router.post("/transactions/transfer")
    async def transactions_transfer(req: TransferReq, u=Depends(get_current_user)):
        """Transfer money - Mobile app compatibility"""
        if req.amount <= 0:
            raise HTTPException(400, "Montant invalide")
        
        sw = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
        if not sw:
            raise HTTPException(400, f"Portefeuille {req.currency} non trouvé")
        
        receiver = None
        if req.receiver_phone:
            receiver = await db.users.find_one({"phone": req.receiver_phone})
        elif req.receiver_account:
            receiver = await db.users.find_one({"account_number": req.receiver_account})
        
        if not receiver:
            raise HTTPException(404, "Destinataire non trouvé")
        if receiver["id"] == u["id"]:
            raise HTTPException(400, "Auto-transfert interdit")
        
        sender_country = u.get("country", "CD")
        receiver_country = receiver.get("country", "CD")
        is_international = sender_country != receiver_country
        target_currency = req.target_currency or req.currency
        is_conversion = req.currency != target_currency
        
        if is_international:
            rule = await get_transaction_rule(sender_country, "international") or {}
            tx_type = "international"
        else:
            rule = await get_transaction_rule(sender_country, "transfer") or {}
            tx_type = "transfer"
        
        limit_check = await check_transaction_limits(u["id"], req.amount, tx_type, rule)
        if not limit_check.get("allowed", True):
            raise HTTPException(400, "; ".join(limit_check.get("errors", [])))
        
        base_fee = calculate_fee(req.amount, rule)
        conversion_fee = 0.0
        exchange_rate = 1.0
        received_amount = req.amount
        
        if is_conversion:
            conversion_fee = round(req.amount * 0.02, 2)
            exchange_rate = await get_exchange_rate(req.currency, target_currency, 2.0)
            received_amount = round((req.amount - conversion_fee) * exchange_rate, 2)
        
        total = req.amount + base_fee
        total_fees = base_fee + conversion_fee
        
        if sw["balance"] < total:
            raise HTTPException(400, f"Solde insuffisant. Disponible: {sw['balance']}, Requis: {total}")
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": req.currency},
            {"$inc": {"balance": -total}}
        )
        
        n = now_iso()
        
        rw = await db.wallets.find_one({"user_id": receiver["id"], "currency": target_currency})
        if not rw:
            await db.wallets.insert_one({
                "id": gen_id(), "user_id": receiver["id"], "currency": target_currency,
                "balance": received_amount, "is_primary": False, "created_at": n
            })
        else:
            await db.wallets.update_one(
                {"user_id": receiver["id"], "currency": target_currency},
                {"$inc": {"balance": received_amount}}
            )
        
        tx_id = gen_id()
        await db.transactions.insert_one({
            "id": tx_id,
            "sender_id": u["id"],
            "sender_name": u["name"],
            "sender_phone": u["phone"],
            "sender_country": sender_country,
            "receiver_id": receiver["id"],
            "receiver_name": receiver["name"],
            "receiver_phone": receiver["phone"],
            "receiver_country": receiver_country,
            "amount": req.amount,
            "fee": total_fees,
            "currency": req.currency,
            "target_currency": target_currency,
            "exchange_rate": exchange_rate,
            "received_amount": received_amount,
            "type": tx_type,
            "status": "completed",
            "description": req.description or f"Transfert vers {receiver['name']}",
            "created_at": n,
            "completed_at": n
        })
        
        return {
            "message": f"{received_amount} {target_currency} envoyé à {receiver['name']}",
            "transaction_id": tx_id,
            "fee": total_fees,
            "exchange_rate": exchange_rate if is_conversion else None,
            "received_amount": received_amount
        }

    @router.post("/transactions/recharge")
    async def transactions_recharge(
        amount: float = Body(...),
        currency: str = Body("USD"),
        method: str = Body("mobile_money"),
        u=Depends(get_current_user)
    ):
        """Wallet recharge request - Mobile app compatibility"""
        if amount <= 0:
            raise HTTPException(400, "Montant invalide")
        
        country = u.get("country", "CD")
        rule = await get_transaction_rule(country, "recharge") or {}
        limit_check = await check_transaction_limits(u["id"], amount, "recharge", rule)
        if not limit_check.get("allowed", True):
            raise HTTPException(400, "; ".join(limit_check.get("errors", [])))
        
        fee = calculate_fee(amount, rule)
        tx_id = gen_id()
        
        await db.transactions.insert_one({
            "id": tx_id,
            "sender_id": None,
            "sender_name": "Système",
            "receiver_id": u["id"],
            "receiver_name": u["name"],
            "receiver_phone": u["phone"],
            "receiver_country": country,
            "amount": amount,
            "fee": fee,
            "currency": currency,
            "type": "recharge",
            "status": "pending",
            "method": method,
            "description": f"Rechargement via {method}",
            "created_at": now_iso()
        })
        
        return {"message": "Rechargement en attente", "transaction_id": tx_id, "fee": fee, "status": "pending"}

    @router.post("/transactions/withdraw")
    async def transactions_withdraw(
        amount: float = Body(...),
        currency: str = Body("USD"),
        method: str = Body("mobile_money"),
        destination: str = Body(...),
        u=Depends(get_current_user)
    ):
        """Wallet withdrawal request - Mobile app compatibility"""
        if amount <= 0:
            raise HTTPException(400, "Montant invalide")
        
        w = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
        if not w:
            raise HTTPException(400, f"Portefeuille {currency} non trouvé")
        
        country = u.get("country", "CD")
        rule = await get_transaction_rule(country, "withdrawal") or {}
        limit_check = await check_transaction_limits(u["id"], amount, "withdrawal", rule)
        if not limit_check.get("allowed", True):
            raise HTTPException(400, "; ".join(limit_check.get("errors", [])))
        
        fee = calculate_fee(amount, rule)
        total = amount + fee
        
        if w["balance"] < total:
            raise HTTPException(400, f"Solde insuffisant. Disponible: {w['balance']}, Requis: {total}")
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": currency},
            {"$inc": {"balance": -total}}
        )
        
        tx_id = gen_id()
        await db.transactions.insert_one({
            "id": tx_id,
            "sender_id": u["id"],
            "sender_name": u["name"],
            "sender_phone": u["phone"],
            "sender_country": country,
            "receiver_id": None,
            "receiver_name": "Retrait",
            "receiver_phone": destination,
            "amount": amount,
            "fee": fee,
            "currency": currency,
            "type": "withdrawal",
            "status": "pending",
            "method": method,
            "description": f"Retrait vers {destination}",
            "created_at": now_iso()
        })
        
        return {"message": "Retrait en attente de validation", "transaction_id": tx_id, "fee": fee, "status": "pending"}

    return router
