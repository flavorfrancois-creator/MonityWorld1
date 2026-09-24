"""
Advanced Role-Based Access Control (RBAC) System for Monity World
Defines permissions, roles, and access control functions.
"""

from typing import List, Dict, Optional
from functools import wraps
from fastapi import HTTPException

# =====================
# PERMISSION DEFINITIONS
# =====================

# All available permissions in the system
PERMISSIONS = {
    # User Management
    "users.view": "Voir les utilisateurs",
    "users.create": "Créer des utilisateurs",
    "users.edit": "Modifier les utilisateurs",
    "users.suspend": "Suspendre tous les utilisateurs",
    "users.delete": "Supprimer les utilisateurs",
    "users.promote": "Promouvoir les utilisateurs",
    
    # Granular Suspension Permissions (by user type)
    "clients.suspend": "Suspendre les clients",
    "merchants.suspend": "Suspendre les marchands",
    "partners.suspend_user": "Suspendre les partenaires (utilisateurs)",
    
    # Client Deposit (for managers)
    "clients.deposit": "Effectuer des dépôts sur les comptes clients",
    
    # Transaction Management
    "transactions.view": "Voir les transactions",
    "transactions.approve": "Approuver les transactions",
    "transactions.reject": "Rejeter les transactions",
    "transactions.export": "Exporter les transactions",
    
    # Currency & Rates
    "currencies.view": "Voir les devises",
    "currencies.edit": "Modifier les devises",
    "rates.view": "Voir les taux de change",
    "rates.edit": "Modifier les taux de change",
    
    # Country Management
    "countries.view": "Voir les pays",
    "countries.edit": "Modifier les pays",
    
    # Services by Country
    "services_country.view": "Voir les services par pays",
    "services_country.edit": "Modifier les services par pays",
    
    # Currencies by Country
    "currencies_country.view": "Voir les devises par pays",
    "currencies_country.edit": "Modifier les devises par pays",
    
    # Partner Management
    "partners.view": "Voir les partenaires",
    "partners.create": "Créer des partenaires",
    "partners.edit": "Modifier les partenaires",
    "partners.suspend": "Suspendre les partenaires",
    "partners.approve": "Approuver les partenaires",
    
    # Partner Rates
    "partner_rates.view": "Voir les taux partenaires",
    "partner_rates.edit": "Modifier les taux partenaires",
    
    # NFC Limits
    "nfc_limits.view": "Voir les limites NFC",
    "nfc_limits.edit": "Modifier les limites NFC",
    
    # Virtual Cards
    "virtual_cards.view": "Voir les cartes virtuelles",
    "virtual_cards.edit": "Modifier les cartes virtuelles",
    
    # Rules & Fees
    "rules_fees.view": "Voir les règles et frais",
    "rules_fees.edit": "Modifier les règles et frais",
    
    # KYC Management
    "kyc.view": "Voir les KYC",
    "kyc.approve": "Approuver les KYC",
    "kyc.reject": "Rejeter les KYC",
    
    # Dashboard & Analytics
    "dashboard.view": "Voir le tableau de bord",
    "dashboard.view_all": "Voir le tableau de bord général",
    "analytics.view": "Voir les analytics",
    "analytics.view_all": "Voir les analytics généraux",
    
    # Admin Management (only for primary admin)
    "admins.view": "Voir les administrateurs",
    "admins.create": "Créer des administrateurs",
    "admins.edit": "Modifier les administrateurs",
    "admins.suspend": "Suspendre les administrateurs",
    "admins.delete": "Supprimer les administrateurs",
    "admins.assign_permissions": "Attribuer des permissions",
    
    # Settings
    "settings.view": "Voir les paramètres",
    "settings.edit": "Modifier les paramètres",
}

# Permission groups for easier assignment
PERMISSION_GROUPS = {
    "users_full": ["users.view", "users.create", "users.edit", "users.suspend", "users.delete", "users.promote", "clients.suspend", "merchants.suspend", "partners.suspend_user"],
    "users_basic": ["users.view"],
    "users_suspend_clients": ["users.view", "clients.suspend"],
    "users_suspend_merchants": ["users.view", "merchants.suspend"],
    "users_suspend_all": ["users.view", "clients.suspend", "merchants.suspend", "partners.suspend_user"],
    "clients_deposit": ["clients.deposit"],
    "transactions_full": ["transactions.view", "transactions.approve", "transactions.reject", "transactions.export"],
    "transactions_basic": ["transactions.view"],
    "currencies_full": ["currencies.view", "currencies.edit", "rates.view", "rates.edit"],
    "currencies_basic": ["currencies.view", "rates.view"],
    "countries_full": ["countries.view", "countries.edit"],
    "services_full": ["services_country.view", "services_country.edit", "currencies_country.view", "currencies_country.edit"],
    "partners_full": ["partners.view", "partners.create", "partners.edit", "partners.suspend", "partners.approve", "partner_rates.view", "partner_rates.edit"],
    "partners_basic": ["partners.view", "partner_rates.view"],
    "nfc_full": ["nfc_limits.view", "nfc_limits.edit"],
    "cards_full": ["virtual_cards.view", "virtual_cards.edit"],
    "rules_full": ["rules_fees.view", "rules_fees.edit"],
    "kyc_full": ["kyc.view", "kyc.approve", "kyc.reject"],
    "kyc_basic": ["kyc.view"],
    "dashboard_full": ["dashboard.view", "dashboard.view_all", "analytics.view", "analytics.view_all"],
    "dashboard_basic": ["dashboard.view", "analytics.view"],
    "admins_full": ["admins.view", "admins.create", "admins.edit", "admins.suspend", "admins.delete", "admins.assign_permissions"],
    "settings_full": ["settings.view", "settings.edit"],
}

# =====================
# ROLE DEFINITIONS
# =====================

ROLES = {
    "primary_admin": {
        "label": "Administrateur Principal",
        "level": 0,  # Highest level
        "is_primary": True,
        "can_be_suspended": False,
        "can_be_deleted": False,
        "default_permissions": list(PERMISSIONS.keys()),  # All permissions
    },
    "secondary_primary_admin": {
        "label": "Administrateur Principal (Secondaire)",
        "level": 1,
        "is_primary": True,
        "can_be_suspended": True,
        "can_be_deleted": False,  # Cannot be deleted, only suspended
        "default_permissions": [],  # Must be explicitly granted
    },
    "admin": {
        "label": "Administrateur",
        "level": 2,
        "is_primary": False,
        "can_be_suspended": True,
        "can_be_deleted": True,
        "default_permissions": [],  # Must be explicitly granted
    },
    "manager": {
        "label": "Gestionnaire",
        "level": 3,
        "is_primary": False,
        "can_be_suspended": True,
        "can_be_deleted": True,
        "default_permissions": [],  # Must be explicitly granted
    },
    "partner": {
        "label": "Partenaire",
        "level": 4,
        "is_primary": False,
        "can_be_suspended": True,
        "can_be_deleted": True,
        "default_permissions": [],
    },
    "client": {
        "label": "Client",
        "level": 6,
        "is_primary": False,
        "can_be_suspended": True,
        "can_be_deleted": True,
        "default_permissions": [],
    },
}

# Which roles can create which other roles
ROLE_CREATION_HIERARCHY = {
    "primary_admin": ["secondary_primary_admin", "admin", "manager", "partner", "client"],
    "secondary_primary_admin": [],  # Defined by primary admin via can_create_roles
    "admin": [],  # Defined by primary admin via can_create_roles
    "manager": [],  # Defined by primary admin via can_create_roles
}

# Which roles can suspend which other roles
ROLE_SUSPENSION_HIERARCHY = {
    "primary_admin": ["secondary_primary_admin", "admin", "manager", "partner", "client"],
    "secondary_primary_admin": [],  # Defined by primary admin via can_suspend_roles
    "admin": [],  # Defined by primary admin via can_suspend_roles
    "manager": [],  # Defined by primary admin via can_suspend_roles
}


# =====================
# ACCESS CONTROL FUNCTIONS
# =====================

def get_role_info(role: str) -> dict:
    """Get role information."""
    return ROLES.get(role, ROLES["client"])


def get_role_level(role: str) -> int:
    """Get the hierarchical level of a role. Lower = more powerful."""
    return ROLES.get(role, {}).get("level", 99)


def is_primary_admin(user: dict) -> bool:
    """Check if user is any type of primary admin."""
    role = user.get("role", "client")
    return role in ["primary_admin", "secondary_primary_admin"]


def is_original_primary_admin(user: dict) -> bool:
    """Check if user is the original primary admin (level 0)."""
    return (
        user.get("is_super_admin") is True
        or (
            user.get("role") == "primary_admin"
            and user.get("admin_level", 1) == 0
        )
    )


def can_manage_role(actor: dict, target_role: str) -> bool:
    """Check if actor can manage (create/edit/suspend) a user with target role."""
    actor_role = actor.get("role", "client")
    actor_level = get_role_level(actor_role)
    target_level = get_role_level(target_role)
    
    # Can only manage roles with higher level number (less powerful)
    return actor_level < target_level


def can_create_role(actor: dict, target_role: str) -> bool:
    """Check if actor can create a user with the target role."""
    actor_role = actor.get("role", "client")
    
    # Original primary admin can create any role
    if is_original_primary_admin(actor):
        return True
    
    # Check explicit permission from can_create_roles
    allowed_roles = actor.get("can_create_roles", [])
    if target_role in allowed_roles:
        return True
    
    # Check default hierarchy
    default_allowed = ROLE_CREATION_HIERARCHY.get(actor_role, [])
    return target_role in default_allowed


def can_suspend_role(actor: dict, target_role: str) -> bool:
    """Check if actor can suspend a user with the target role."""
    actor_role = actor.get("role", "client")
    
    # Original primary admin can suspend any role except themselves
    if is_original_primary_admin(actor):
        return target_role != "primary_admin"
    
    # Check explicit permission from can_suspend_roles
    allowed_roles = actor.get("can_suspend_roles", [])
    if target_role in allowed_roles:
        return True
    
    # Check default hierarchy
    default_allowed = ROLE_SUSPENSION_HIERARCHY.get(actor_role, [])
    return target_role in default_allowed


def can_access_user(actor: dict, target_user: dict) -> bool:
    """Check if actor can access/view a specific user."""
    # Check country access
    actor_countries = actor.get("assigned_countries", [])
    if actor_countries:  # If actor has country restrictions
        target_country = target_user.get("country", "")
        if target_country and target_country not in actor_countries:
            return False
    
    # Check role hierarchy - can only access users with lower privilege
    actor_level = get_role_level(actor.get("role", "client"))
    target_level = get_role_level(target_user.get("role", "client"))
    
    # Same level or lower privilege is accessible
    return actor_level <= target_level


def has_permission(user: dict, permission: str) -> bool:
    """Check if user has a specific permission."""
    role = user.get("role", "client")
    
    # Original primary admin has all permissions
    if is_original_primary_admin(user):
        return True
    
    # Check if user is suspended
    if user.get("is_suspended", False):
        return False
    
    # Check user's explicit permissions
    user_permissions = user.get("permissions", [])
    if permission in user_permissions:
        return True
    
    # Check default role permissions
    role_info = ROLES.get(role, {})
    default_perms = role_info.get("default_permissions", [])
    return permission in default_perms


def has_any_permission(user: dict, permissions: List[str]) -> bool:
    """Check if user has any of the specified permissions."""
    return any(has_permission(user, p) for p in permissions)


def has_all_permissions(user: dict, permissions: List[str]) -> bool:
    """Check if user has all of the specified permissions."""
    return all(has_permission(user, p) for p in permissions)


def get_user_permissions(user: dict) -> List[str]:
    """Get all permissions for a user."""
    if is_original_primary_admin(user):
        return list(PERMISSIONS.keys())
    
    if user.get("is_suspended", False):
        return []
    
    # Combine explicit permissions with role defaults
    user_perms = set(user.get("permissions", []))
    role_info = ROLES.get(user.get("role", "client"), {})
    default_perms = set(role_info.get("default_permissions", []))
    
    return list(user_perms | default_perms)


def get_accessible_countries(user: dict) -> List[str]:
    """Get list of countries the user can access. Empty = all countries."""
    if is_original_primary_admin(user):
        return []  # All countries
    
    return user.get("assigned_countries", [])


def can_access_country(user: dict, country_code: str) -> bool:
    """Check if user can access data for a specific country."""
    if is_original_primary_admin(user):
        return True
    
    assigned = user.get("assigned_countries", [])
    if not assigned:  # No restrictions
        return True
    
    return country_code.upper() in [c.upper() for c in assigned]


def require_permission(permission: str):
    """Decorator to require a specific permission for an endpoint."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get user from kwargs (assumes 'adm' or 'u' parameter)
            user = kwargs.get('adm') or kwargs.get('u')
            if not user:
                raise HTTPException(401, "Non authentifié")
            
            if not has_permission(user, permission):
                raise HTTPException(403, f"Permission requise: {PERMISSIONS.get(permission, permission)}")
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def check_permission(user: dict, permission: str):
    """Check permission and raise exception if not granted."""
    if not has_permission(user, permission):
        raise HTTPException(403, f"Permission requise: {PERMISSIONS.get(permission, permission)}")


def check_can_suspend(actor: dict, target: dict):
    """Check if actor can suspend target and raise exception if not."""
    target_role = target.get("role", "client")
    
    # Cannot suspend original primary admin
    if is_original_primary_admin(target):
        raise HTTPException(403, "Impossible de suspendre l'administrateur principal")
    
    # Cannot suspend yourself
    if actor.get("id") == target.get("id"):
        raise HTTPException(400, "Vous ne pouvez pas vous suspendre vous-même")
    
    if not can_suspend_role(actor, target_role):
        raise HTTPException(403, f"Vous n'êtes pas autorisé à suspendre ce type de compte")


def can_suspend_user_by_type(actor: dict, target_role: str) -> bool:
    """
    Check if actor can suspend a user of a specific type (client, merchant, partner).
    Uses granular permissions like 'clients.suspend', 'merchants.suspend', etc.
    """
    # Original primary admin can suspend anyone
    if is_original_primary_admin(actor):
        return True
    
    # Check users.suspend for general suspension permission
    if has_permission(actor, "users.suspend"):
        return True
    
    # Check specific suspension permissions based on user type
    if target_role == "client":
        return has_permission(actor, "clients.suspend")
    elif target_role == "merchant":
        return has_permission(actor, "merchants.suspend")
    elif target_role == "partner":
        return has_permission(actor, "partners.suspend_user")
    
    # For admin/manager roles, use the role suspension hierarchy
    return can_suspend_role(actor, target_role)


def check_can_suspend_user_by_type(actor: dict, target: dict):
    """
    Check if actor can suspend target user based on their role type.
    Raises exception if not authorized.
    """
    target_role = target.get("role", "client")
    
    # Cannot suspend original primary admin
    if is_original_primary_admin(target):
        raise HTTPException(403, "Impossible de suspendre l'administrateur principal")
    
    # Cannot suspend yourself
    if actor.get("id") == target.get("id"):
        raise HTTPException(400, "Vous ne pouvez pas vous suspendre vous-même")
    
    if not can_suspend_user_by_type(actor, target_role):
        role_label = ROLES.get(target_role, {}).get("label", target_role)
        raise HTTPException(403, f"Vous n'êtes pas autorisé à suspendre les {role_label.lower()}s")


def check_can_create_role(actor: dict, target_role: str):
    """Check if actor can create a user with target role and raise exception if not."""
    if not can_create_role(actor, target_role):
        role_label = ROLES.get(target_role, {}).get("label", target_role)
        raise HTTPException(403, f"Vous n'êtes pas autorisé à créer un compte de type: {role_label}")


# =====================
# ADMIN USER SCHEMA
# =====================

def get_default_admin_data() -> dict:
    """Get default data structure for admin users."""
    return {
        "admin_level": None,  # 0 = original primary, 1+ = secondary primary, None = regular admin/manager
        "permissions": [],  # Explicit permissions granted
        "assigned_countries": [],  # Countries this admin can access (empty = all)
        "can_create_roles": [],  # Roles this admin can create
        "can_suspend_roles": [],  # Roles this admin can suspend
        "is_suspended": False,
        "suspended_at": None,
        "suspended_by": None,
        "suspension_reason": None,
        "created_by_admin_id": None,  # ID of admin who created this account
        "created_by_admin_name": None,
    }


def get_permission_categories() -> dict:
    """Get permissions organized by category for UI display."""
    categories = {
        "Utilisateurs": {
            "permissions": ["users.view", "users.create", "users.edit", "users.suspend", "users.delete", "users.promote"],
            "icon": "Users"
        },
        "Suspension par Type": {
            "permissions": ["clients.suspend", "merchants.suspend", "partners.suspend_user"],
            "icon": "UserX"
        },
        "Dépôts Clients": {
            "permissions": ["clients.deposit"],
            "icon": "Banknote"
        },
        "Transactions": {
            "permissions": ["transactions.view", "transactions.approve", "transactions.reject", "transactions.export"],
            "icon": "ArrowLeftRight"
        },
        "Devises & Taux": {
            "permissions": ["currencies.view", "currencies.edit", "rates.view", "rates.edit"],
            "icon": "Coins"
        },
        "Pays": {
            "permissions": ["countries.view", "countries.edit"],
            "icon": "Globe"
        },
        "Services par Pays": {
            "permissions": ["services_country.view", "services_country.edit"],
            "icon": "Settings"
        },
        "Devises par Pays": {
            "permissions": ["currencies_country.view", "currencies_country.edit"],
            "icon": "Banknote"
        },
        "Partenaires": {
            "permissions": ["partners.view", "partners.create", "partners.edit", "partners.suspend", "partners.approve", "partner_rates.view", "partner_rates.edit"],
            "icon": "Handshake"
        },
        "Limites NFC": {
            "permissions": ["nfc_limits.view", "nfc_limits.edit"],
            "icon": "CreditCard"
        },
        "Cartes Virtuelles": {
            "permissions": ["virtual_cards.view", "virtual_cards.edit"],
            "icon": "Wallet"
        },
        "Règles & Frais": {
            "permissions": ["rules_fees.view", "rules_fees.edit"],
            "icon": "Scale"
        },
        "Vérification KYC": {
            "permissions": ["kyc.view", "kyc.approve", "kyc.reject"],
            "icon": "Shield"
        },
        "Tableau de Bord": {
            "permissions": ["dashboard.view", "dashboard.view_all", "analytics.view", "analytics.view_all"],
            "icon": "LayoutDashboard"
        },
        "Administrateurs": {
            "permissions": ["admins.view", "admins.create", "admins.edit", "admins.suspend", "admins.delete", "admins.assign_permissions"],
            "icon": "UserCog"
        },
        "Paramètres": {
            "permissions": ["settings.view", "settings.edit"],
            "icon": "Settings2"
        },
    }
    
    # Add permission labels
    for cat_name, cat_data in categories.items():
        cat_data["permission_labels"] = {
            p: PERMISSIONS.get(p, p) for p in cat_data["permissions"]
        }
    
    return categories
