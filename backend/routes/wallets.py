"""
Monity World - Wallet Routes
============================
Handles wallet operations: balance, transfer, recharge, withdraw, conversion.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/wallet", tags=["Wallet"])

# Alias router for /wallets endpoints  
wallets_router = APIRouter(prefix="/api", tags=["Wallets"])


# === MODELS ===
class TransferReq(BaseModel):
    receiver_phone: Optional[str] = None
    receiver_account: Optional[str] = None
    amount: float
    currency: str = "USD"
    target_currency: Optional[str] = None
    description: Optional[str] = None
    idempotency_key: Optional[str] = None


class RechargeReq(BaseModel):
    amount: float
    currency: str = "USD"
    method: str = "mobile_money"


class WithdrawReq(BaseModel):
    amount: float
    currency: str = "USD"
    method: str = "mobile_money"
    destination: str


class WalletAddReq(BaseModel):
    currency: str


class WalletConvertReq(BaseModel):
    from_currency: str
    to_currency: str
    amount: float


class WalletDeleteReq(BaseModel):
    currency: str
    convert_to: Optional[str] = None


class WalletConvertAndReplaceReq(BaseModel):
    source_currency: str
    target_currency: str
    conversion_fee_percent: float = 1.5


# === HELPER FUNCTIONS ===
def gen_id():
    import uuid
    return str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# === SETUP FUNCTION ===
def setup_wallet_routes(
    db,
    get_current_user,
    get_transaction_rule,
    get_international_rule, 
    calculate_fee,
    check_transaction_limits,
    get_exchange_rate
):
    """
    Setup wallet routes with database and dependencies.
    """
    
    # === WALLETS ===
    @wallets_router.get("/wallets")
    async def get_wallets(u=Depends(get_current_user)):
        """Get all user wallets"""
        return await db.wallets.find({"user_id": u["id"]}, {"_id": 0}).to_list(10)
    
    @wallets_router.post("/wallets/add")
    async def add_wallet(req: WalletAddReq, u=Depends(get_current_user)):
        """Add a new wallet"""
        existing = await db.wallets.find({"user_id": u["id"]}).to_list(10)
        if len(existing) >= u.get("max_wallets", 2):
            raise HTTPException(400, f"Maximum {u.get('max_wallets', 2)} portefeuilles autorisés")
        if any(w["currency"] == req.currency for w in existing):
            raise HTTPException(400, f"Vous avez déjà un portefeuille {req.currency}")
        
        cur = await db.currencies.find_one({"code": req.currency, "is_active": True})
        if not cur:
            raise HTTPException(400, "Devise non disponible")
        
        doc = {
            "id": gen_id(), "user_id": u["id"], "currency": req.currency,
            "balance": 0.0, "is_primary": len(existing) == 0, "created_at": now_iso()
        }
        await db.wallets.insert_one(doc)
        doc.pop("_id", None)
        return doc
    
    @wallets_router.delete("/wallets")
    async def delete_wallet(req: WalletDeleteReq, u=Depends(get_current_user)):
        """Delete a wallet"""
        wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
        if not wallet:
            raise HTTPException(404, "Portefeuille non trouvé")
        if wallet.get("is_primary"):
            raise HTTPException(400, "Impossible de supprimer le portefeuille principal")
        if wallet["balance"] > 0 and not req.convert_to:
            raise HTTPException(400, "Portefeuille non vide. Convertissez ou transférez le solde d'abord")
        
        if req.convert_to and wallet["balance"] > 0:
            target_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.convert_to})
            if not target_wallet:
                raise HTTPException(400, f"Portefeuille {req.convert_to} non trouvé")
            
            rate = await get_exchange_rate(db, req.currency, req.convert_to)
            converted = round(wallet["balance"] * rate * 0.985, 2)  # 1.5% fee
            await db.wallets.update_one(
                {"user_id": u["id"], "currency": req.convert_to},
                {"$inc": {"balance": converted}}
            )
        
        await db.wallets.delete_one({"user_id": u["id"], "currency": req.currency})
        return {"message": f"Portefeuille {req.currency} supprimé"}

    # === WALLET/ PREFIX ROUTES (ALIAS) ===
    @router.get("/wallets")
    async def wallet_get_wallets(u=Depends(get_current_user)):
        """Alias: Get all user wallets"""
        return await db.wallets.find({"user_id": u["id"]}, {"_id": 0}).to_list(10)

    @router.post("/wallets")
    async def wallet_add_wallet(req: WalletAddReq, u=Depends(get_current_user)):
        """Alias: Add a new wallet"""
        existing = await db.wallets.find({"user_id": u["id"]}).to_list(10)
        if len(existing) >= u.get("max_wallets", 2):
            raise HTTPException(400, f"Maximum {u.get('max_wallets', 2)} portefeuilles autorisés")
        if any(w["currency"] == req.currency for w in existing):
            raise HTTPException(400, f"Vous avez déjà un portefeuille {req.currency}")
        
        cur = await db.currencies.find_one({"code": req.currency, "is_active": True})
        if not cur:
            raise HTTPException(400, "Devise non disponible")
        
        doc = {
            "id": gen_id(), "user_id": u["id"], "currency": req.currency,
            "balance": 0.0, "is_primary": len(existing) == 0, "created_at": now_iso()
        }
        await db.wallets.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.delete("/wallets/{currency}")
    async def wallet_delete_wallet(currency: str, u=Depends(get_current_user)):
        """Alias: Delete a wallet"""
        wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
        if not wallet:
            raise HTTPException(404, "Portefeuille non trouvé")
        if wallet.get("is_primary"):
            raise HTTPException(400, "Impossible de supprimer le portefeuille principal")
        if wallet["balance"] > 0:
            raise HTTPException(400, "Portefeuille non vide")
        
        await db.wallets.delete_one({"user_id": u["id"], "currency": currency})
        return {"message": f"Portefeuille {currency} supprimé"}

    @router.get("/balance")
    async def get_balance(u=Depends(get_current_user)):
        """Get total balance across all wallets"""
        wallets = await db.wallets.find({"user_id": u["id"]}, {"_id": 0}).to_list(10)
        total_usd = 0.0
        
        for w in wallets:
            if w["currency"] == "USD":
                total_usd += w["balance"]
            else:
                rate = await get_exchange_rate(db, w["currency"], "USD")
                total_usd += w["balance"] * rate
        
        return {
            "wallets": wallets,
            "total_usd": round(total_usd, 2)
        }

    @router.post("/transfer")
    async def transfer(req: TransferReq, u=Depends(get_current_user)):
        """Transfer money to another user"""
        if req.amount <= 0:
            raise HTTPException(400, "Montant invalide")
        
        # Idempotency check
        if req.idempotency_key:
            existing = await db.idempotency_keys.find_one({
                "key": req.idempotency_key,
                "user_id": u["id"]
            })
            if existing:
                return existing.get("response", {"message": "Opération déjà effectuée", "duplicate": True})
        
        sw = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
        if not sw:
            raise HTTPException(400, f"Portefeuille {req.currency} non trouvé")
        
        # Find receiver
        receiver = None
        if req.receiver_phone:
            receiver = await db.users.find_one({"phone": req.receiver_phone})
        elif req.receiver_account:
            receiver = await db.users.find_one({"account_number": req.receiver_account})
        
        if not receiver:
            raise HTTPException(404, "Destinataire non trouvé")
        if receiver["id"] == u["id"]:
            raise HTTPException(400, "Auto-transfert interdit")
        
        # Get countries
        sender_country = u.get("country", "CD")
        receiver_country = receiver.get("country", "CD")
        is_international = sender_country != receiver_country
        
        target_currency = req.target_currency or req.currency
        is_conversion = req.currency != target_currency
        
        # Get rules
        if is_international:
            rule = await get_international_rule(db, sender_country, receiver_country)
            tx_type = "international"
        else:
            rule = await get_transaction_rule(db, sender_country, "transfer")
            tx_type = "transfer"
        
        # Check limits
        limit_check = await check_transaction_limits(db, u["id"], req.amount, tx_type, rule)
        if not limit_check["allowed"]:
            raise HTTPException(400, "; ".join(limit_check["errors"]))
        
        # Calculate fees
        base_fee = calculate_fee(req.amount, rule)
        conversion_fee = 0.0
        exchange_rate = 1.0
        received_amount = req.amount
        
        if is_conversion:
            conversion_fee = round(req.amount * 0.02, 2)  # 2% conversion
            margin = rule.get("exchange_rate_margin", 2.0) if is_international else 2.0
            exchange_rate = await get_exchange_rate(db, req.currency, target_currency, margin)
            received_amount = round((req.amount - conversion_fee) * exchange_rate, 2)
        
        total = req.amount + base_fee
        total_fees = base_fee + conversion_fee
        
        if sw["balance"] < total:
            raise HTTPException(400, f"Solde insuffisant. Disponible: {sw['balance']}, Requis: {total}")
        
        # Deduct from sender
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": req.currency},
            {"$inc": {"balance": -total}}
        )
        
        n = now_iso()
        
        # Credit receiver
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
        
        # Record transaction
        tx_id = gen_id()
        await db.transactions.insert_one({
            "id": tx_id, "sender_id": u["id"], "sender_name": u["name"],
            "sender_phone": u["phone"], "sender_country": sender_country,
            "receiver_id": receiver["id"], "receiver_name": receiver["name"],
            "receiver_phone": receiver["phone"], "receiver_country": receiver_country,
            "amount": req.amount, "fee": total_fees, "currency": req.currency,
            "target_currency": target_currency, "exchange_rate": exchange_rate,
            "received_amount": received_amount, "type": tx_type, "status": "completed",
            "description": req.description or f"Transfert vers {receiver['name']}",
            "created_at": n, "completed_at": n
        })
        
        response = {
            "message": f"{received_amount} {target_currency} envoyé à {receiver['name']}",
            "transaction_id": tx_id, "fee": total_fees,
            "exchange_rate": exchange_rate if is_conversion else None,
            "received_amount": received_amount
        }
        
        # Store idempotency key
        if req.idempotency_key:
            await db.idempotency_keys.insert_one({
                "key": req.idempotency_key,
                "user_id": u["id"],
                "response": response,
                "created_at": datetime.now(timezone.utc)
            })
        
        return response

    @router.post("/recharge")
    async def recharge(req: RechargeReq, u=Depends(get_current_user)):
        """Request wallet recharge"""
        if req.amount <= 0:
            raise HTTPException(400, "Montant invalide")
        
        country = u.get("country", "CD")
        rule = await get_transaction_rule(db, country, "recharge")
        limit_check = await check_transaction_limits(db, u["id"], req.amount, "recharge", rule)
        if not limit_check["allowed"]:
            raise HTTPException(400, "; ".join(limit_check["errors"]))
        
        fee = calculate_fee(req.amount, rule)
        n = now_iso()
        tx_id = gen_id()
        
        await db.transactions.insert_one({
            "id": tx_id, "sender_id": None, "sender_name": "Système",
            "receiver_id": u["id"], "receiver_name": u["name"],
            "receiver_phone": u["phone"], "receiver_country": country,
            "amount": req.amount, "fee": fee, "currency": req.currency,
            "type": "recharge", "status": "pending", "method": req.method,
            "description": f"Rechargement via {req.method}", "created_at": n
        })
        
        return {
            "message": "Rechargement en attente",
            "transaction_id": tx_id, "fee": fee, "status": "pending"
        }

    @router.post("/withdraw")
    async def withdraw(req: WithdrawReq, u=Depends(get_current_user)):
        """Request wallet withdrawal"""
        if req.amount <= 0:
            raise HTTPException(400, "Montant invalide")
        
        w = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
        if not w:
            raise HTTPException(400, f"Portefeuille {req.currency} non trouvé")
        
        country = u.get("country", "CD")
        rule = await get_transaction_rule(db, country, "withdrawal")
        limit_check = await check_transaction_limits(db, u["id"], req.amount, "withdrawal", rule)
        if not limit_check["allowed"]:
            raise HTTPException(400, "; ".join(limit_check["errors"]))
        
        fee = calculate_fee(req.amount, rule)
        total = req.amount + fee
        
        if w["balance"] < total:
            raise HTTPException(400, f"Solde insuffisant. Disponible: {w['balance']}, Requis: {total}")
        
        # Deduct immediately
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": req.currency},
            {"$inc": {"balance": -total}}
        )
        
        n = now_iso()
        tx_id = gen_id()
        
        await db.transactions.insert_one({
            "id": tx_id, "sender_id": u["id"], "sender_name": u["name"],
            "sender_phone": u["phone"], "sender_country": country,
            "receiver_id": None, "receiver_name": "Retrait",
            "receiver_phone": req.destination,
            "amount": req.amount, "fee": fee, "currency": req.currency,
            "type": "withdrawal", "status": "pending", "method": req.method,
            "description": f"Retrait vers {req.destination}", "created_at": n
        })
        
        return {
            "message": "Retrait en attente de validation",
            "transaction_id": tx_id, "fee": fee, "status": "pending"
        }

    @router.get("/transactions")
    async def get_transactions(page: int = 1, limit: int = 20, u=Depends(get_current_user)):
        """Get user transaction history"""
        skip = (page - 1) * limit
        q = {"$or": [{"sender_id": u["id"]}, {"receiver_id": u["id"]}]}
        total = await db.transactions.count_documents(q)
        txs = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        return {"transactions": txs, "total": total, "page": page, "pages": -(-total // limit)}

    @router.post("/convert")
    async def convert_currency(req: WalletConvertReq, u=Depends(get_current_user)):
        """Convert between wallets"""
        if req.amount <= 0:
            raise HTTPException(400, "Montant invalide")
        if req.from_currency == req.to_currency:
            raise HTTPException(400, "Même devise")
        
        from_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.from_currency})
        if not from_wallet or from_wallet["balance"] < req.amount:
            raise HTTPException(400, "Solde insuffisant")
        
        to_wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.to_currency})
        if not to_wallet:
            raise HTTPException(400, f"Portefeuille {req.to_currency} non trouvé")
        
        # Conversion with 1.5% fee
        fee = round(req.amount * 0.015, 2)
        rate = await get_exchange_rate(db, req.from_currency, req.to_currency)
        converted = round((req.amount - fee) * rate, 2)
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": req.from_currency},
            {"$inc": {"balance": -req.amount}}
        )
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": req.to_currency},
            {"$inc": {"balance": converted}}
        )
        
        n = now_iso()
        await db.transactions.insert_one({
            "id": gen_id(), "sender_id": u["id"], "sender_name": u["name"],
            "receiver_id": u["id"], "receiver_name": u["name"],
            "amount": req.amount, "fee": fee, "currency": req.from_currency,
            "target_currency": req.to_currency, "exchange_rate": rate,
            "received_amount": converted, "type": "conversion", "status": "completed",
            "description": f"Conversion {req.from_currency} → {req.to_currency}",
            "created_at": n, "completed_at": n
        })
        
        return {
            "message": f"{converted} {req.to_currency} crédités",
            "from_amount": req.amount, "to_amount": converted,
            "fee": fee, "rate": rate
        }

    return router, wallets_router
