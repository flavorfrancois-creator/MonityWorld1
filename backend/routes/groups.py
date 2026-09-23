"""
Monity World - Groups Routes (Tontines)
=======================================
Handles group savings (tontines), contributions, and member management.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import random
import string

router = APIRouter(tags=["Groups"])


class GroupReq(BaseModel):
    name: str
    description: Optional[str] = None
    contribution_amount: float
    currency: str = "USD"
    frequency: str = "monthly"
    auto_debit: bool = False
    max_members: int = 10


class GroupJoinBodyReq(BaseModel):
    invite_code: str


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_id():
    import uuid
    return str(uuid.uuid4())


def setup_groups_routes(db, get_current_user):
    """Setup groups/tontines routes with dependencies"""
    
    @router.get("/groups")
    async def get_groups(u=Depends(get_current_user)):
        """Get all groups user is a member of"""
        return await db.groups.find(
            {"$or": [{"creator_id": u["id"]}, {"members": u["id"]}]},
            {"_id": 0}
        ).to_list(50)

    @router.post("/groups")
    async def create_group(req: GroupReq, u=Depends(get_current_user)):
        """Create a new tontine group"""
        invite_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        doc = {
            "id": gen_id(),
            "name": req.name,
            "description": req.description,
            "creator_id": u["id"],
            "creator_name": u["name"],
            "members": [u["id"]],
            "member_names": {u["id"]: u["name"]},
            "admins": [u["id"]],
            "contribution_amount": req.contribution_amount,
            "currency": req.currency,
            "frequency": req.frequency,
            "auto_debit": req.auto_debit,
            "max_members": req.max_members,
            "total_collected": 0,
            "current_pot": 0,
            "status": "active",
            "invite_code": invite_code,
            "pending_invitations": [],
            "pending_join_requests": [],
            "rotation_order": [u["id"]],
            "current_cycle": 1,
            "current_beneficiary_index": 0,
            "payout_history": [],
            "cycle_contributions": {},
            "created_at": now_iso()
        }
        await db.groups.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.get("/groups/{group_id}")
    async def get_group_details(group_id: str, u=Depends(get_current_user)):
        """Get detailed group information"""
        group = await db.groups.find_one({"id": group_id}, {"_id": 0})
        if not group:
            raise HTTPException(404, "Groupe non trouvé")
        if u["id"] not in group.get("members", []) and u["id"] not in group.get("pending_invitations", []):
            raise HTTPException(403, "Vous n'avez pas accès à ce groupe")
        return group

    @router.post("/groups/join/{code}")
    async def join_group_by_code(code: str, u=Depends(get_current_user)):
        """Join a group using invite code"""
        group = await db.groups.find_one({"invite_code": code})
        if not group:
            raise HTTPException(404, "Code d'invitation invalide")
        if u["id"] in group.get("members", []):
            raise HTTPException(400, "Vous êtes déjà membre")
        if len(group.get("members", [])) >= group.get("max_members", 10):
            raise HTTPException(400, "Groupe complet")
        
        await db.groups.update_one(
            {"id": group["id"]},
            {
                "$push": {"members": u["id"], "rotation_order": u["id"]},
                "$set": {f"member_names.{u['id']}": u["name"]}
            }
        )
        
        await db.group_messages.insert_one({
            "id": gen_id(),
            "group_id": group["id"],
            "sender_id": "system",
            "sender_name": "Système",
            "content": f"{u['name']} a rejoint le groupe",
            "type": "join",
            "created_at": now_iso()
        })
        
        return {"message": f"Vous avez rejoint le groupe {group['name']}", "group_id": group["id"]}

    # Mobile app compatibility - join with body
    @router.post("/groups/join")
    async def join_group_by_body(req: GroupJoinBodyReq, u=Depends(get_current_user)):
        """Join group by invite code in body - Mobile app compatibility"""
        group = await db.groups.find_one({"invite_code": req.invite_code})
        if not group:
            raise HTTPException(404, "Code d'invitation invalide")
        if u["id"] in group.get("members", []):
            raise HTTPException(400, "Vous êtes déjà membre")
        if len(group.get("members", [])) >= group.get("max_members", 10):
            raise HTTPException(400, "Groupe complet")
        
        await db.groups.update_one(
            {"id": group["id"]},
            {
                "$push": {"members": u["id"], "rotation_order": u["id"]},
                "$set": {f"member_names.{u['id']}": u["name"]}
            }
        )
        
        await db.group_messages.insert_one({
            "id": gen_id(),
            "group_id": group["id"],
            "sender_id": "system",
            "sender_name": "Système",
            "content": f"{u['name']} a rejoint le groupe",
            "type": "join",
            "created_at": now_iso()
        })
        
        return {"message": f"Vous avez rejoint le groupe {group['name']}", "group_id": group["id"]}

    @router.post("/groups/{group_id}/contribute")
    async def contribute_to_group(group_id: str, amount: float = Body(None, embed=True), u=Depends(get_current_user)):
        """Contribute to group pot"""
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(404, "Groupe non trouvé")
        if u["id"] not in group.get("members", []):
            raise HTTPException(403, "Vous n'êtes pas membre")
        if group.get("status") != "active":
            raise HTTPException(400, "Groupe non actif")
        
        contribution = amount or group.get("contribution_amount", 0)
        if contribution <= 0:
            raise HTTPException(400, "Montant invalide")
        
        wallet = await db.wallets.find_one({"user_id": u["id"], "currency": group["currency"]})
        if not wallet or wallet["balance"] < contribution:
            raise HTTPException(400, "Solde insuffisant")
        
        await db.wallets.update_one(
            {"user_id": u["id"], "currency": group["currency"]},
            {"$inc": {"balance": -contribution}}
        )
        
        await db.groups.update_one(
            {"id": group_id},
            {
                "$inc": {
                    "total_collected": contribution,
                    "current_pot": contribution,
                    f"cycle_contributions.{u['id']}": contribution
                }
            }
        )
        
        await db.group_messages.insert_one({
            "id": gen_id(),
            "group_id": group_id,
            "sender_id": "system",
            "sender_name": "Système",
            "content": f"{u['name']} a contribué {contribution} {group['currency']}",
            "type": "contribution",
            "created_at": now_iso()
        })
        
        return {"message": f"Contribution de {contribution} {group['currency']} effectuée"}

    @router.post("/groups/{group_id}/leave")
    async def leave_group(group_id: str, u=Depends(get_current_user)):
        """Leave a group"""
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(404, "Groupe non trouvé")
        if u["id"] not in group.get("members", []):
            raise HTTPException(400, "Vous n'êtes pas membre")
        if u["id"] == group.get("creator_id"):
            raise HTTPException(400, "Le créateur ne peut pas quitter le groupe")
        
        await db.groups.update_one(
            {"id": group_id},
            {
                "$pull": {"members": u["id"], "rotation_order": u["id"], "admins": u["id"]},
                "$unset": {f"member_names.{u['id']}": "", f"cycle_contributions.{u['id']}": ""}
            }
        )
        
        await db.group_messages.insert_one({
            "id": gen_id(),
            "group_id": group_id,
            "sender_id": "system",
            "sender_name": "Système",
            "content": f"{u['name']} a quitté le groupe",
            "type": "leave",
            "created_at": now_iso()
        })
        
        return {"message": "Vous avez quitté le groupe"}

    @router.get("/groups/{group_id}/messages")
    async def get_group_messages(group_id: str, page: int = 1, limit: int = 50, u=Depends(get_current_user)):
        """Get group chat messages"""
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(404, "Groupe non trouvé")
        if u["id"] not in group.get("members", []):
            raise HTTPException(403, "Vous n'êtes pas membre")
        
        skip = (page - 1) * limit
        messages = await db.group_messages.find(
            {"group_id": group_id},
            {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
        
        return {"messages": messages[::-1], "page": page}

    @router.post("/groups/{group_id}/messages")
    async def send_group_message(group_id: str, content: str = Body(..., embed=True), u=Depends(get_current_user)):
        """Send a message to group chat"""
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(404, "Groupe non trouvé")
        if u["id"] not in group.get("members", []):
            raise HTTPException(403, "Vous n'êtes pas membre")
        
        msg = {
            "id": gen_id(),
            "group_id": group_id,
            "sender_id": u["id"],
            "sender_name": u["name"],
            "content": content,
            "type": "message",
            "created_at": now_iso()
        }
        await db.group_messages.insert_one(msg)
        msg.pop("_id", None)
        return msg

    @router.delete("/groups/{group_id}")
    async def delete_group(group_id: str, u=Depends(get_current_user)):
        """Delete a group (creator only)"""
        group = await db.groups.find_one({"id": group_id})
        if not group:
            raise HTTPException(404, "Groupe non trouvé")
        if u["id"] != group.get("creator_id"):
            raise HTTPException(403, "Seul le créateur peut supprimer le groupe")
        if group.get("current_pot", 0) > 0:
            raise HTTPException(400, "Distribuez d'abord la cagnotte")
        
        await db.groups.delete_one({"id": group_id})
        await db.group_messages.delete_many({"group_id": group_id})
        return {"message": "Groupe supprimé"}

    return router
