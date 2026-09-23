# Monity World - Refactoring Documentation

## Status: Phases 1-5 COMPLETE

## Architecture Finale

```
backend/
├── server.py              (5,280 lines - core endpoints: auth, wallet, groups, savings, profile)
├── database.py            (centralized DB, auth deps, shared utilities)
├── rbac.py                (role-based access control)
├── models/
│   └── schemas.py         (91 Pydantic models - centralized)
├── utils/
│   ├── auth.py            (JWT, password hashing, admin role checks)
│   ├── helpers.py         (general utilities)
│   ├── fees.py            (exchange rates, fees, transaction limits)
│   ├── admin_helpers.py   (admin country filtering, query builders)
│   ├── activity.py        (admin activity logging)
│   ├── whatsapp.py        (WhatsApp messaging shared functions)
│   └── storage.py         (Emergent Object Storage)
├── routes/
│   ├── admin_whatsapp.py  (1,132 lines - WhatsApp admin management)
│   ├── admin_stats.py     (1,190 lines - admin stats, KYC management)
│   ├── partner_routes.py  (1,063 lines - partner system)
│   ├── virtual_cards_routes.py (741 lines - virtual cards + admin)
│   ├── payments_routes.py (817 lines - payment links, ecommerce, API keys)
│   ├── admin_analytics.py (755 lines - analytics, activity, accounting)
│   ├── admin_mgmt.py      (597 lines - RBAC, admin management, suspension)
│   ├── admin_countries.py (351 lines - countries & services)
│   ├── nfc_bank_cards.py  (441 lines - NFC & bank cards)
│   ├── mobile_sms.py      (400 lines - mobile payments, SMS)
│   ├── admin_rules.py     (319 lines - transaction rules)
│   ├── mobile_compat.py   (392 lines - mobile app compatibility)
│   ├── integrations.py    (639 lines - financial integrations admin)
│   └── merchant.py        (971 lines - merchant portal)
```

## Key Metrics
- **Before**: server.py = 13,500 lines (monolithic)
- **After**: server.py = 5,280 lines + 12 route modules = ~14,000 lines total (modular)
- **Reduction**: 61% reduction in server.py
- **Modules created**: 12 route modules + 7 utility modules
- **Models centralized**: 91 Pydantic models in models/schemas.py

## Shared Dependencies
- `database.py`: db, get_current_user, get_admin, gen_id, now_iso, NON_CLIENT_ROLES
- `utils/fees.py`: get_exchange_rate, calculate_fee, get_transaction_rule
- `utils/admin_helpers.py`: get_admin_country_filter, build_country_query
- `utils/activity.py`: log_admin_activity
- `utils/whatsapp.py`: send_whatsapp_otp, send_whatsapp_message

## Remaining in server.py (5,280 lines)
- Auth endpoints (login, register, OTP, 2FA, password reset)
- Wallet/Transfer endpoints (balance, transfer, recharge, withdraw)
- Groups/Tontines endpoints
- Savings endpoints
- Profile/KYC endpoints
- Notifications
- Contacts/Search
- Financial integrations (partial - to be extracted)
- App setup & startup events
