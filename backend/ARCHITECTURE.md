# Monity World Backend - Architecture Modulaire

## Structure Actuelle

```
backend/
├── server.py           # Fichier principal (monolithique - à refactoriser)
├── models/
│   ├── __init__.py
│   └── schemas.py      # Modèles Pydantic pour les requêtes/réponses
├── utils/
│   ├── __init__.py
│   ├── helpers.py      # Fonctions utilitaires générales
│   ├── access_control.py # Contrôle d'accès basé sur les rôles
│   └── transactions.py   # Utilitaires pour les transactions
├── routes/
│   ├── __init__.py
│   └── integrations.py   # Routes pour les intégrations tierces
├── integrations/
│   └── __init__.py       # Module d'intégrations (SMS, Mobile Money)
└── tests/                # Tests unitaires et d'intégration
```

## Plan de Refactorisation (À Faire)

### Phase 1 : Routes
Diviser `server.py` en modules de routes séparés :

- `routes/auth.py` - Authentification, inscription, JWT
- `routes/wallet.py` - Portefeuilles, transferts, recharges
- `routes/cards.py` - Cartes virtuelles
- `routes/groups.py` - Cotisations/Tontines
- `routes/payments.py` - Liens de paiement, e-commerce
- `routes/admin.py` - Panel administrateur
- `routes/admin_cards.py` - Gestion admin des cartes
- `routes/admin_rules.py` - Règles de transaction

### Phase 2 : Services
Créer une couche service pour la logique métier :

- `services/auth_service.py` - Logique d'authentification
- `services/wallet_service.py` - Logique des portefeuilles
- `services/transaction_service.py` - Logique des transactions
- `services/notification_service.py` - Notifications utilisateurs

### Phase 3 : Configuration
- `config/settings.py` - Configuration centralisée
- `config/database.py` - Connexion base de données

## Utilisation des Modules

### Models (schemas.py)
```python
from models import RegisterReq, TransferReq, EcommerceLinkCreateReq
```

### Utils
```python
from utils import gen_id, hash_pw, verify_pw, now_iso
from utils import get_admin_country_filter, build_country_query
from utils import calculate_fee, check_transaction_limits
```

## Contrôle d'Accès

Le système utilise un RBAC (Role-Based Access Control) avec :

- `super_admin` : Accès complet à tous les pays
- `admin` : Accès limité aux pays assignés (`assigned_countries`)
- `manager` : Accès en lecture aux pays assignés
- `client` : Accès à son propre compte uniquement

### Fonctions Clés

- `get_admin_country_filter(admin)` : Retourne la liste des pays accessibles
- `build_country_query(admin, country_param)` : Construit un filtre MongoDB
- `check_admin_card_access(admin, card, db)` : Vérifie l'accès à une carte

## Collections MongoDB

- `users` - Utilisateurs avec rôles et permissions
- `wallets` - Portefeuilles multi-devises
- `transactions` - Toutes les transactions
- `virtual_cards` - Cartes virtuelles et NFC
- `groups` - Groupes de cotisation
- `payment_links` - Liens de paiement simples
- `ecommerce_links` - Liens de paiement e-commerce
- `ecommerce_validations` - Codes OTP e-commerce
- `transaction_rules` - Règles de frais nationales
- `international_rules` - Règles de frais internationales
- `countries` - Pays supportés
- `currencies` - Devises et taux de change

## Notes de Migration

Lors de la refactorisation :

1. Créer les nouveaux fichiers de routes
2. Importer les dépendances nécessaires (db, get_current_user, etc.)
3. Déplacer les endpoints un par un
4. Tester chaque endpoint après migration
5. Mettre à jour les imports dans `server.py`
6. Supprimer le code migré de `server.py`

## Variables d'Environnement

```env
MONGO_URL=mongodb://...
DB_NAME=monity_world
JWT_SECRET=your-secret-key
ENABLE_SMS_OTP=true/false
ENABLE_MOBILE_MONEY=true/false
```
