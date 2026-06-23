# Suivi de production — ECODEKO

Application web full-stack de suivi de production de mugs pour une petite équipe
(1 à 5 utilisateurs). Centralise les commandes, gère plusieurs visuels par commande
(galerie, téléchargement ZIP) et **supprime automatiquement les fichiers à l'expédition**
pour maîtriser l'espace disque, avec traçabilité complète.

## Stack

| Couche | Techno |
|---|---|
| Backend | Node.js + Express (API REST) |
| Frontend | React + Vite |
| ORM / BDD | Prisma — **SQLite** (dev) → **PostgreSQL** (prod) |
| Auth | JWT en cookie httpOnly + bcrypt, **rôles ADMIN / OPÉRATEUR** |
| Upload | Multer (drag & drop) · ZIP via archiver |
| Sécurité | rate limiting login, CORS strict, validation MIME serveur |

## Fonctionnalités

- 🔐 Connexion JWT (cookie httpOnly), rôles **ADMIN** (gestion comptes + suppression) et **OPÉRATEUR** (lecture/écriture)
- 👥 Page d'administration des utilisateurs (création, activation/désactivation, rôle)
- 📋 Tableau de bord : recherche, filtre par statut, **tri sur colonnes**, **pagination**, indicateurs par statut, statut modifiable en ligne
- 🔄 Statuts : `En attente → En production → Contrôle qualité → Prêt à expédier → Expédiée`
- 🧾 **Lignes multiples** par commande (type de mug · visuel · quantité · commentaire) ; l'en-tête (quantité totale, type, désignation) est dérivé automatiquement des lignes
- ⚙️ Confort de saisie : **référence auto au format `AAAA-NNNN`** (séquence annuelle, modifiable), autocomplétion client, date de sortie auto (+10 jours ouvrés), prix ESAT en boutons (0,20 € / 0,30 €), **upload des visuels par ligne dès la création** avec **barre de progression**
- 🖼️ Visuels **par ligne** (ou au niveau commande) : upload multiple (JPG/PNG/GIF/WEBP/PDF, 10 Mo max) en glisser-déposer, galerie miniatures par ligne, téléchargement individuel ou groupé (ZIP). Stockage `uploads/commande_<id>/ligne_<id>/`. L'édition des lignes préserve leurs visuels (diff par id) ; retirer une ligne supprime ses fichiers.
- 🗑️ **Purge automatique** des fichiers au passage à *Expédiée* (disque + base), avec bandeau d'information et log horodaté ; upload désactivé sur les commandes expédiées
- ♻️ **Soft delete** (corbeille) des commandes, réservé aux ADMIN, avec restauration
- 🕘 Historique complet par commande (création, statuts, fichiers, purge)
- 📊 Onglet **Statistiques** : KPIs (commandes, mugs produits, clients, rebut, CA ESAT estimé, délai moyen), production sur 12 mois, répartition par statut, top clients, types de mug, ateliers (`GET /api/stats`), **filtre de période** (tout / 12 mois / année) et **export CSV** (Excel FR)
- 🧹 Outil **Clients** (ADMIN) : fusion des variantes d'orthographe et nettoyage des espaces (`GET /api/clients`, `POST /api/clients/merge`, `POST /api/clients/normalize`)
- 🏷️ Catalogue **Produits** (ADMIN) : types de mug avec **miniature** et **prix d'achat** ; dans les lignes de commande, le type se choisit dans une liste déroulante affichant la **miniature** du produit (`/api/produits`, image servie sur `/api/produits/:id/image`)

## Structure

```
.
├── backend/                 API Express + Prisma
│   ├── prisma/schema.prisma schéma BDD
│   ├── scripts/             seed-admin.js · import-csv.js
│   └── src/                 controllers / services / routes / middleware
├── frontend/                React + Vite
│   └── src/                 pages / components / api / auth
├── Dockerfile               build frontend + API (mono-port)
├── docker-compose.yml       déploiement (SQLite par défaut, Postgres en option)
└── README.md
```

## Schéma de données

- **User** : `email, password (bcrypt), nom, role (ADMIN|OPERATEUR), actif`
- **Commande** : `reference (unique), client, designation, quantite, statut, dateCommande, dateLivraison, dateExpedition, notes` + colonnes métier conservées (`typeMug, prixEsat, atelier, rebut, noteTransport, aFacturer, dateSortieTexte`) + `fichiersSupprimes/At`, `supprime/At` (corbeille)
- **Fichier** : `nom, nomStockage, chemin, taille, type, commandeId`
- **Log** : `action, detail, userId, commandeId, createdAt`

> Note : `role` et `statut` sont des `String` validées côté serveur (les `enum` Prisma
> ne sont pas supportés sous SQLite — cela garde un code identique en dev et en prod).

---

## Lancement en local (développement)

Prérequis : **Node.js ≥ 18**. Deux terminaux (backend + frontend).

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env          # puis générez un JWT_SECRET :
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npx prisma db push            # crée backend/prisma/dev.db + les tables
npm run seed -- admin@exemple.fr motDePasse "Votre Nom"   # 1er compte ADMIN
npm run import -- --file "/chemin/export.csv"             # (optionnel) import CSV

npm run dev                   # API sur http://localhost:4000
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev                   # interface sur http://localhost:5173
```

Ouvrez **http://localhost:5173** et connectez-vous.

> Si le port **4000** est déjà occupé : lancez le backend avec `PORT=4100 npm run dev`,
> puis le frontend avec `VITE_API_TARGET=http://localhost:4100 npm run dev`.
> Le serveur Vite relaie automatiquement `/api` vers le backend (pas de souci CORS).

## Variables d'environnement (backend/.env)

| Variable | Description | Défaut |
|---|---|---|
| `DATABASE_URL` | SQLite `file:./dev.db` (relatif à `prisma/`) ou URL PostgreSQL | `file:./dev.db` |
| `PORT` | Port de l'API | `4000` |
| `NODE_ENV` | `development` / `production` | `development` |
| `JWT_SECRET` | Secret de signature JWT (**à changer**) | — |
| `JWT_EXPIRES_IN` | Durée de validité du token | `8h` |
| `CORS_ORIGIN` | Origine autorisée (URL frontend) | `http://localhost:5173` |
| `UPLOAD_DIR` | Dossier des visuels (**disque persistant**) | `./uploads` |
| `MAX_FILE_SIZE` | Taille max/fichier (octets) | `10485760` (10 Mo) |
| `SECURE_COOKIE` | `true` si HTTPS | `false` |

## Scripts (backend)

| Commande | Effet |
|---|---|
| `npm run dev` / `npm start` | Démarre l'API (watch / normal) |
| `npx prisma db push` | Crée / synchronise les tables |
| `npm run seed -- <email> <mdp> [nom]` | Crée un compte ADMIN |
| `npm run import -- --file "<csv>" [--reset]` | Importe l'historique (idempotent par référence) |

### Import CSV

Le script `scripts/import-csv.js` lit l'export de la Google Sheet, mappe les colonnes,
**génère une référence stable `IMP-00001…`** (donc ré-exécutable sans créer de doublon)
et affiche un rapport *importées / ignorées / erreurs*. Le statut de la feuille est traduit :
`(vide)→En attente`, `Impression OK / En cours de prod→En production`,
`Terminé→Prêt à expédier`, `Expédié→Expédiée`.

---

## Déploiement en production

### ⭐ Le plus rapide — GitHub + Render ou Railway (disque persistant)

L'app tourne **telle quelle** (Docker), avec un **disque persistant** monté sur `/data`
pour la base SQLite (`/data/prod.db`) **et** les visuels (`/data/uploads`).

**1) Pousser sur GitHub**
```bash
git init && git add -A && git commit -m "Suivi production ECODEKO"
git branch -M main
git remote add origin https://github.com/<vous>/suivi-production.git
git push -u origin main
```

**2a) Render** — « New + → Blueprint », sélectionner le repo : le fichier
[`render.yaml`](render.yaml) configure tout (Docker, disque `/data`, healthcheck,
`JWT_SECRET` auto). Renseigner `ADMIN_EMAIL` et `ADMIN_PASSWORD` dans le dashboard →
le compte admin est créé au 1er démarrage. *(Le disque persistant requiert le plan Starter.)*

**2b) Railway** — « New Project → Deploy from GitHub repo ». Railway lit
[`railway.json`](railway.json) (build via Dockerfile). Ajouter un **Volume** monté sur
`/data`, puis les variables : `NODE_ENV=production`, `DATABASE_URL=file:/data/prod.db`,
`UPLOAD_DIR=/data/uploads`, `JWT_SECRET=<aléatoire>`, `SECURE_COOKIE=true`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`.

**3) Importer l'historique** (une fois) via le shell du service :
`npm run import -- --file /chemin/export.csv` (ou recréer les commandes depuis l'app).

> Auto-seed : si la base est vide et que `ADMIN_EMAIL`/`ADMIN_PASSWORD` sont définis,
> le compte ADMIN est créé automatiquement au démarrage — pas besoin de commande manuelle.

### Option A — Docker (le plus simple)

L'image build le frontend et l'API ; l'API sert le tout sur un seul port. SQLite + volumes persistants par défaut.

```bash
export JWT_SECRET=$(openssl rand -hex 48)
docker compose up -d --build

# Première initialisation (créer l'admin, importer) :
docker compose exec app npm run seed -- admin@exemple.fr motDePasse "Admin"
docker compose exec app npm run import -- --file /chemin/dans/conteneur.csv
```

L'application est sur **http://localhost:4000**. Les données (base + visuels) persistent
dans les volumes `db_data` et `uploads_data`.

**Passer à PostgreSQL** : mettre `provider = "postgresql"` dans `backend/prisma/schema.prisma`,
décommenter le service `db` et adapter `DATABASE_URL` dans `docker-compose.yml` (voir commentaires).

### Option B — VPS (Node + PM2 + nginx)

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

# Build
cd frontend && npm ci && npm run build && cd ..
cd backend  && npm ci
cp .env.example .env   # NODE_ENV=production, JWT_SECRET, SECURE_COOKIE=true, CORS_ORIGIN=https://votre-domaine
npx prisma db push
npm run seed -- admin@exemple.fr motDePasse "Admin"

# Lancement permanent (l'API sert aussi le frontend compilé)
sudo npm install -g pm2
pm2 start src/server.js --name suivi-production
pm2 save && pm2 startup
```

nginx en reverse proxy + HTTPS :

```nginx
server {
  server_name suivi.mondomaine.fr;
  client_max_body_size 12M;   # ≥ MAX_FILE_SIZE
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

```bash
sudo certbot --nginx -d suivi.mondomaine.fr
```

Puis `SECURE_COOKIE=true` dans `.env` et `pm2 restart suivi-production`.

### Option C — Railway / Render

Déployer le `Dockerfile`, ajouter les variables d'environnement dans le dashboard,
et attacher un **volume persistant** sur `/app/backend/prisma` et `/app/backend/uploads`
(ou utiliser PostgreSQL managé + un volume pour les uploads).

### Sauvegardes

```bash
# SQLite
cp backend/prisma/dev.db /sauvegardes/suivi-$(date +%F).db
# Visuels
tar czf /sauvegardes/uploads-$(date +%F).tar.gz backend/uploads/
```

## Sécurité

- Mots de passe hachés bcrypt (coût 12) · JWT en cookie **httpOnly** (jamais en localStorage)
- **Rate limiting** sur `/api/auth/login` (10 essais / 15 min / IP)
- Validation du **type MIME côté serveur** · fichiers servis uniquement via routes authentifiées
- **CORS** restreint à l'origine du frontend · pas de stack trace exposée en production
- Secrets dans `.env` (jamais committé)
