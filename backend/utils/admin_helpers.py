"""
Monity World - Admin Utility Functions
"""

def get_admin_country_filter(admin: dict) -> list:
    assigned = admin.get("assigned_countries", [])
    if isinstance(assigned, list) and len(assigned) > 0:
        return [c.upper() for c in assigned]
    return []


def build_country_query(admin: dict, country_param: str = "", field_name: str = "country") -> dict:
    admin_countries = get_admin_country_filter(admin)
    if country_param:
        country_upper = country_param.upper()
        if admin_countries and country_upper not in admin_countries:
            return {"__forbidden__": True}
        return {field_name: country_upper}
    if admin_countries:
        return {field_name: {"$in": admin_countries}}
    return {}


async def check_admin_card_access(admin: dict, card: dict, db) -> bool:
    admin_countries = get_admin_country_filter(admin)
    if not admin_countries:
        return True
    if not card.get("user_id"):
        return True
    owner = await db.users.find_one({"id": card["user_id"]}, {"country": 1, "_id": 0})
    if owner and owner.get("country") in admin_countries:
        return True
    return False


def build_transaction_country_query(admin: dict, country_param: str = "") -> dict:
    admin_countries = get_admin_country_filter(admin)
    if country_param:
        country_upper = country_param.upper()
        if admin_countries and country_upper not in admin_countries:
            return {"__forbidden__": True}
        return {"$or": [
            {"sender_country": country_upper},
            {"receiver_country": country_upper}
        ]}
    if admin_countries:
        return {"$or": [
            {"sender_country": {"$in": admin_countries}},
            {"receiver_country": {"$in": admin_countries}}
        ]}
    return {}
