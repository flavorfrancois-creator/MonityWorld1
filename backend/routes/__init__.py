"""
Monity World - Routes Package
=============================
Contains all API route modules organized by domain.

Modules:
- auth: Authentication, registration, login, 2FA, biometric
- wallets: Wallet operations, transfers, recharge, withdraw
- transactions: Transaction history, mobile aliases
- cards: Virtual cards, NFC, barcode lookups
- savings: Savings accounts
- groups: Tontines/group savings
- integrations: SMS OTP, Mobile Money integration
- merchant: Merchant portal, invoices, POS
"""

from .auth import router as auth_router, setup_auth_routes
from .wallets import router as wallet_router, wallets_router, setup_wallet_routes
from .transactions import router as transactions_router, setup_transactions_routes
from .cards import router as cards_router, setup_cards_routes
from .savings import router as savings_router, setup_savings_routes
from .groups import router as groups_router, setup_groups_routes
from .integrations import router as integrations_router
from .merchant import router as merchant_router, setup_merchant_routes

__all__ = [
    # Auth
    'auth_router', 'setup_auth_routes',
    # Wallets
    'wallet_router', 'wallets_router', 'setup_wallet_routes',
    # Transactions
    'transactions_router', 'setup_transactions_routes',
    # Cards
    'cards_router', 'setup_cards_routes',
    # Savings
    'savings_router', 'setup_savings_routes',
    # Groups
    'groups_router', 'setup_groups_routes',
    # Integrations
    'integrations_router',
    # Merchant
    'merchant_router', 'setup_merchant_routes'
]
