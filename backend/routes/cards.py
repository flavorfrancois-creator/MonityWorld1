"""
Monity World - Cards Routes  
===========================
Handles virtual cards, NFC cards, and barcode lookups.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

router = APIRouter(tags=["Cards"])


class VirtualCardReq(BaseModel):
    name: str
    currency: str = "USD"
    limit: float = 1000.0
    can_send: bool = True
    can_receive: bool = True


class VirtualCardUpdateReq(BaseModel):
    name: Optional[str] = None
    is_locked: Optional[bool] = None
    can_send: Optional[bool] = None
    can_receive: Optional[bool] = None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_id():
    import uuid
    return str(uuid.uuid4())


def gen_barcode():
    import random
    import string
    return 'MVC' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=13))


def setup_cards_routes(db, get_current_user, get_virtual_card_price=None):
    """Setup virtual cards routes with dependencies"""
    
    @router.get("/virtual-cards")
    async def get_virtual_cards(u=Depends(get_current_user)):
        """Get all user's virtual cards"""
        cards = await db.virtual_cards.find(
            {"user_id": u["id"]},
            {"_id": 0, "delete_votes": 0}
        ).to_list(20)
        return cards

    @router.post("/virtual-cards")
    async def create_virtual_card(req: VirtualCardReq, u=Depends(get_current_user)):
        """Create a new virtual card"""
        # Check existing cards
        existing = await db.virtual_cards.count_documents({"user_id": u["id"]})
        
        # First card is free
        card_price = 0 if existing == 0 and not u.get("free_card_used") else 5.0
        if get_virtual_card_price:
            card_price = 0 if existing == 0 else get_virtual_card_price(u.get("country", "CD"))
        
        if card_price > 0:
            wallet = await db.wallets.find_one({"user_id": u["id"], "currency": req.currency})
            if not wallet or wallet["balance"] < card_price:
                raise HTTPException(400, f"Solde insuffisant. Prix de la carte: {card_price} {req.currency}")
            
            await db.wallets.update_one(
                {"user_id": u["id"], "currency": req.currency},
                {"$inc": {"balance": -card_price}}
            )
        
        card = {
            "id": gen_id(),
            "user_id": u["id"],
            "owner_name": u["name"],
            "name": req.name,
            "currency": req.currency,
            "balance": 0.0,
            "limit": req.limit,
            "barcode": gen_barcode(),
            "can_send": req.can_send,
            "can_receive": req.can_receive,
            "is_locked": False,
            "status": "pending",
            "created_at": now_iso()
        }
        
        await db.virtual_cards.insert_one(card)
        
        if existing == 0:
            await db.users.update_one({"id": u["id"]}, {"$set": {"free_card_used": True}})
        
        card.pop("_id", None)
        return card

    @router.get("/virtual-cards/{card_id}")
    async def get_virtual_card(card_id: str, u=Depends(get_current_user)):
        """Get single virtual card details"""
        card = await db.virtual_cards.find_one(
            {"id": card_id, "user_id": u["id"]},
            {"_id": 0, "delete_votes": 0}
        )
        if not card:
            raise HTTPException(404, "Carte non trouvée")
        return card

    @router.patch("/virtual-cards/{card_id}")
    async def update_virtual_card(card_id: str, req: VirtualCardUpdateReq, u=Depends(get_current_user)):
        """Update virtual card settings"""
        card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
        if not card:
            raise HTTPException(404, "Carte non trouvée")
        
        update = {}
        if req.name is not None:
            update["name"] = req.name
        if req.is_locked is not None:
            update["is_locked"] = req.is_locked
        if req.can_send is not None:
            update["can_send"] = req.can_send
        if req.can_receive is not None:
            update["can_receive"] = req.can_receive
        
        if update:
            update["updated_at"] = now_iso()
            await db.virtual_cards.update_one({"id": card_id}, {"$set": update})
        
        return {"message": "Carte mise à jour"}

    @router.delete("/virtual-cards/{card_id}")
    async def delete_virtual_card(card_id: str, u=Depends(get_current_user)):
        """Delete a virtual card"""
        card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
        if not card:
            raise HTTPException(404, "Carte non trouvée")
        
        if card.get("balance", 0) > 0:
            raise HTTPException(400, "Transférez le solde avant de supprimer la carte")
        
        await db.virtual_cards.delete_one({"id": card_id})
        return {"message": "Carte supprimée"}

    # === Mobile App Compatibility Endpoints ===
    
    @router.post("/virtual-cards/{card_id}/recharge")
    async def recharge_virtual_card(card_id: str, amount: float = Body(..., embed=True), u=Depends(get_current_user)):
        """Recharge a virtual card from user's wallet"""
        card = await db.virtual_cards.find_one({"id": card_id, "user_id": u["id"]})
        if not card:
            raise HTTPException(404, "Carte non trouvée")
        if card.get("status") != "approved":
            raise HTTPException(400, "Carte non approuvée")
        if card.get("is_locked"):
            raise HTTPException(400, "Carte verrouillée")
        
        currency = card["currency"]
        wallet = await db.wallets.find_one({"user_id": u["id"], "currency": currency})
        if not wallet or wallet["balance"] < amount:
            raise HTTPException(400, f"Solde insuffisant dans le portefeuille {currency}")
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": currency},
            {"$inc": {"balance": -amount}}
        )
        new_balance = card.get("balance", 0) + amount
        await db.virtual_cards.update_one({"id": card_id}, {"$set": {"balance": new_balance}})
        
        await db.transactions.insert_one({
            "id": gen_id(),
            "sender_id": u["id"],
            "sender_name": u["name"],
            "receiver_id": u["id"],
            "receiver_name": card["name"],
            "amount": amount,
            "fee": 0,
            "currency": currency,
            "type": "card_recharge",
            "status": "completed",
            "description": f"Rechargement carte {card['name']}",
            "created_at": now_iso(),
            "completed_at": now_iso()
        })
        
        return {"message": f"Carte rechargée de {amount} {currency}", "new_balance": new_balance}

    @router.get("/cards/nfc/{nfc_serial}")
    async def get_card_by_nfc(nfc_serial: str):
        """Get card info by NFC serial number"""
        card = await db.virtual_cards.find_one(
            {"nfc_serial_number": nfc_serial.upper(), "status": "approved"},
            {"_id": 0, "delete_votes": 0, "card_pin": 0}
        )
        if not card:
            raise HTTPException(404, "Carte NFC non trouvée ou non active")
        
        owner = await db.users.find_one({"id": card.get("user_id")}, {"_id": 0, "name": 1, "phone": 1})
        return {
            "card_id": card["id"],
            "card_name": card["name"],
            "owner_name": card.get("owner_name") or (owner["name"] if owner else "Inconnu"),
            "currency": card["currency"],
            "can_receive": card.get("can_receive", True),
            "can_send": card.get("can_send", True),
            "is_locked": card.get("is_locked", False),
            "balance": card.get("balance", 0)
        }

    @router.get("/cards/barcode/{barcode}")
    async def get_card_by_barcode(barcode: str):
        """Get card info by barcode"""
        card = await db.virtual_cards.find_one(
            {"barcode": barcode, "status": "approved"},
            {"_id": 0, "delete_votes": 0}
        )
        if not card:
            raise HTTPException(404, "Carte non trouvée ou non active")
        
        return {
            "card_id": card["id"],
            "card_name": card["name"],
            "owner_name": card.get("owner_name", ""),
            "currency": card["currency"],
            "can_receive": card.get("can_receive", True)
        }

    @router.get("/virtual-cards/barcode/{barcode}")
    async def get_virtual_card_by_barcode(barcode: str):
        """Alias for barcode lookup"""
        card = await db.virtual_cards.find_one(
            {"barcode": barcode, "status": "approved"},
            {"_id": 0, "delete_votes": 0}
        )
        if not card:
            raise HTTPException(404, "Carte non trouvée")
        return {
            "card_id": card["id"],
            "card_name": card["name"],
            "owner_name": card.get("owner_name", ""),
            "currency": card["currency"],
            "can_receive": card.get("can_receive", True)
        }

    return router
