"""
Monity World - Admin Access Control Utilities
Functions for managing role-based access control for admin users
"""


def get_admin_country_filter(admin: dict) -> list:
    """
    Get the list of countries an admin can access.
    Empty list means all countries (super admin).
    """
    assigned = admin.get("assigned_countries", [])
    if isinstance(assigned, list) and len(assigned) > 0:
        return [c.upper() for c in assigned]
    return []  # Empty = super admin, can see all


def build_country_query(admin: dict, country_param: str = "", field_name: str = "country") -> dict:
    """
    Build MongoDB query filter based on admin's assigned countries and optional country parameter.
    
    Args:
        admin: The admin user dict
        country_param: Optional specific country to filter by
        field_name: The field name in the document to filter on
        
    Returns:
        MongoDB query dict. If {"__forbidden__": True}, access is denied.
    """
    admin_countries = get_admin_country_filter(admin)
    
    # If specific country requested
    if country_param:
        country_upper = country_param.upper()
        # If admin has restrictions, check if requested country is allowed
        if admin_countries and country_upper not in admin_countries:
            return {"__forbidden__": True}  # Will return empty results
        return {field_name: country_upper}
    
    # No specific country requested
    if admin_countries:
        # Admin has restrictions, filter by their assigned countries
        return {field_name: {"$in": admin_countries}}
    
    # Super admin, no filter
    return {}


def build_transaction_country_query(admin: dict, country_param: str = "") -> dict:
    """
    Build MongoDB query for transactions based on sender/receiver country.
    
    Args:
        admin: The admin user dict
        country_param: Optional specific country to filter by
        
    Returns:
        MongoDB query dict. If {"__forbidden__": True}, access is denied.
    """
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


async def check_admin_card_access(admin: dict, card: dict, db) -> bool:
    """
    Check if admin has access to a card based on owner's country.
    
    Args:
        admin: The admin user dict
        card: The virtual card document
        db: Database connection
        
    Returns:
        True if admin has access, False otherwise
    """
    admin_countries = get_admin_country_filter(admin)
    
    # Super admin can access all
    if not admin_countries:
        return True
    
    # Standalone cards without user can be accessed
    if not card.get("user_id"):
        return True
    
    # Check owner's country
    owner = await db.users.find_one({"id": card["user_id"]}, {"country": 1, "_id": 0})
    if owner and owner.get("country") in admin_countries:
        return True
    
    return False
