# Monity World v8 - Package de Déploiement

## Nouveautés v8 (par rapport à v7)

### Permission Dépôt Gestionnaire
- Nouvelle permission RBAC `clients.deposit`
- Endpoint `POST /api/admin/client-deposit` : dépôt direct sur le wallet d'un client
- Restriction par zone/pays : un gestionnaire ne peut déposer que sur les clients de ses `assigned_countries`
- Endpoint de recherche `GET /api/admin/client-deposit/search` filtré par pays du gestionnaire
- Page frontend `/admin/client-deposit` avec formulaire complet
- Traçabilité : transaction `manager_deposit`, log d'activité, notification client

### Session Unique par Compte
- Un compte ne peut être connecté que sur un seul appareil à la fois
- Toute nouvelle connexion invalide automatiquement la session précédente
- L'ancien appareil reçoit un message "Session expirée - un autre appareil s'est connecté"
- Fonctionne pour les comptes clients ET administrateurs

### Protection Anti-Double Requête (Idempotence)
- Clé d'idempotence sur les dépôts et transferts
- Les requêtes dupliquées retournent la réponse mise en cache sans double-crédit
- TTL de 24h sur les clés d'idempotence

### Correction de Bug
- Correction regex dans la recherche de clients (caractères spéciaux comme `+` dans les numéros de téléphone)

---

## Structure du Projet

```
monity-world-v8/
├── backend/            # API FastAPI
│   ├── server.py       # Serveur principal (~5,300 lignes)
│   ├── database.py     # Configuration MongoDB
│   ├── rbac.py         # Permissions et rôles
│   ├── routes/         # 22+ modules de routes
│   ├── utils/          # Utilitaires
│   ├── models/         # Modèles Pydantic
│   └── .env.example    # Variables d'environnement
├── frontend/           # Application React
│   ├── src/
│   │   ├── pages/admin/    # Pages admin (dont AdminClientDeposit.jsx)
│   │   ├── components/     # Composants partagés
│   │   └── utils/          # API, contexte
│   ├── public/
│   │   └── mobile-app/     # Build Expo exporté
│   └── .env.example
├── mobile-app/         # Source Expo/React Native
├── whatsapp-service/   # Service Node.js WhatsApp
├── docker/             # Configuration Docker
└── docs/               # Documentation
```

## Déploiement Rapide

### 1. Backend (Python/FastAPI)
```bash
cd backend
cp .env.example .env
# Éditer .env avec vos valeurs
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
```

### 2. Frontend (React)
```bash
cd frontend
cp .env.example .env
# Éditer .env: REACT_APP_BACKEND_URL=https://votre-domaine.com
yarn install
yarn build
# Servir le dossier build/ avec nginx
```

### 3. WhatsApp Service (Node.js)
```bash
cd whatsapp-service
npm install
node index.js
```

## Comptes par Défaut

Le système crée automatiquement un compte administrateur principal au démarrage :
- **Email**: admin@monityworld.com
- **Mot de passe**: Admin@123
- **Rôle**: primary_admin (accès complet)

> ⚠️ Changez ce mot de passe immédiatement après le premier déploiement !

## Rôles et Permissions

| Rôle | Accès |
|------|-------|
| primary_admin | Accès total |
| secondary_primary_admin | Accès étendu |
| admin | Selon permissions |
| manager | Selon permissions + pays assignés |
| client | Application client/mobile |

### Permission `clients.deposit`
- Attribuable aux gestionnaires via la page Administrateurs
- Limité aux clients des pays assignés au gestionnaire
- Dépôt direct (pas d'approbation requise)

## URLs Importantes

| URL | Description |
|-----|-------------|
| `/` | Portail client |
| `/admin/login` | Connexion admin |
| `/admin/client-deposit` | Dépôt client (gestionnaires) |
| `/mobile-app/` | Application mobile (web) |
| `/api/docs` | Documentation API |
