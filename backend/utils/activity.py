"""
Monity World - Admin Activity Logging
"""
from datetime import datetime, timezone
from database import db, gen_id, now_iso

ACTIVITY_ACTIONS = {
    "create": "Création",
    "read": "Lecture",
    "update": "Modification",
    "delete": "Suppression",
    "login": "Connexion",
    "logout": "Déconnexion",
    "approve": "Approbation",
    "reject": "Rejet",
    "suspend": "Suspension",
    "unsuspend": "Réactivation",
    "export": "Export",
    "promote": "Promotion"
}

ACTIVITY_RESOURCES = {
    "user": "Utilisateur",
    "transaction": "Transaction",
    "kyc": "Vérification KYC",
    "admin": "Administrateur",
    "settings": "Paramètres",
    "currency": "Devise",
    "country": "Pays",
    "partner": "Partenaire",
    "virtual_card": "Carte virtuelle",
    "group": "Groupe/Tontine",
    "wallet": "Portefeuille",
    "report": "Rapport"
}


async def log_admin_activity(
    admin: dict,
    action: str,
    resource_type: str,
    resource_id: str = None,
    details: dict = None,
    ip_address: str = None
):
    activity = {
        "id": gen_id(),
        "admin_id": admin.get("id"),
        "admin_name": admin.get("name"),
        "admin_role": admin.get("role"),
        "admin_phone": admin.get("phone"),
        "action": action,
        "action_label": ACTIVITY_ACTIONS.get(action, action),
        "resource_type": resource_type,
        "resource_label": ACTIVITY_RESOURCES.get(resource_type, resource_type),
        "resource_id": resource_id,
        "details": details or {},
        "ip_address": ip_address,
        "timestamp": now_iso(),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
    }
    await db.admin_activity_logs.insert_one(activity)
    return activity
