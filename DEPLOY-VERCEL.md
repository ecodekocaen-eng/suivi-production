# Déploiement sur Vercel (Pro)

L'app est adaptée pour Vercel : **frontend statique** (Vite) + **API Express en fonction
serverless**, avec **PostgreSQL** (Neon) pour la base et **Vercel Blob** pour les fichiers.
Inclus dans votre abonnement Vercel Pro (offres gratuites pour Neon et Blob dans les limites).

> Les gros fichiers passent par le **lien WeTransfer/Smash** de chaque ligne ; l'upload
> direct est plafonné à ~4 Mo (limite des fonctions Vercel) — voir `MAX_FILE_SIZE`.

## 1. Base de données — Neon (gratuit)

1. Créer un projet sur https://neon.tech → récupérer la **connection string poolée**
   (celle avec `-pooler`, ex. `postgresql://user:pass@ep-xxx-pooler.../neondb?sslmode=require`).
2. Créer les tables (une fois, depuis votre machine) :
   ```bash
   cd backend
   DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" \
     npx prisma db push --schema prisma/schema.postgres.prisma
   ```

## 2. Projet Vercel

1. https://vercel.com → **Add New → Project** → importer le repo GitHub
   `ecodekocaen-eng/suivi-production`.
2. **Root Directory** : laisser la racine du repo. La config est dans `vercel.json`
   (build, fonction `api/index.mjs`, routage).
3. **Storage → Blob** : créer un store **Blob** et le **connecter au projet**
   → la variable `BLOB_READ_WRITE_TOKEN` est injectée automatiquement.

## 3. Variables d'environnement (Project → Settings → Environment Variables)

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la connection string Neon **poolée** (`sslmode=require`) |
| `STORAGE_DRIVER` | `blob` |
| `MAX_FILE_SIZE` | `4194304` (4 Mo) |
| `JWT_SECRET` | une longue chaîne aléatoire (`openssl rand -hex 48`) |
| `SECURE_COOKIE` | `true` |
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | votre email (compte admin créé au 1er accès) |
| `ADMIN_PASSWORD` | mot de passe admin (≥ 6 caractères) |
| `BLOB_READ_WRITE_TOKEN` | *(ajouté automatiquement en connectant le store Blob)* |

`CORS_ORIGIN` n'est pas nécessaire (front et API sont sur le même domaine).

## 4. Déployer

**Deploy**. Vercel exécute `npm run vercel-build` (build du front + génération du client
Prisma Postgres), puis publie le front statique et la fonction API. Le compte admin est
créé automatiquement au premier appel.

## 5. Importer l'historique (optionnel, une fois)

Depuis votre machine, en pointant sur Neon :
```bash
cd backend
DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" STORAGE_DRIVER=blob \
  node scripts/import-csv.js --file "/chemin/export.csv"
```

## Notes

- **Mises à jour** : chaque `git push` sur `main` redéploie automatiquement.
- **Limite 4 Mo** par upload direct (fonctions Vercel) ; au-delà → lien WeTransfer/Smash.
- Les visuels sont publics via une URL Blob non devinable ; ils sont **supprimés**
  automatiquement à l'expédition (comme en local).
- Pour rester sur un serveur classique (VPS/Docker, SQLite + disque), voir `README.md`
  (la branche `main` reste compatible : `STORAGE_DRIVER=disk`).
