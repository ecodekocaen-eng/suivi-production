# ─────────────────────────────────────────────────────────────
#  Image unique : build du frontend React puis API Express qui le sert.
#  Déploiement mono-port (l'API sert aussi le frontend en production).
# ─────────────────────────────────────────────────────────────

# ── Étape 1 : build du frontend ──
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Étape 2 : backend + frontend compilé ──
FROM node:20-alpine AS runtime
WORKDIR /app/backend

# Dépendances backend (dont Prisma CLI pour generate / db push).
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npx prisma generate

# Frontend compilé, là où le backend va le chercher (../frontend/dist).
COPY --from=frontend /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
EXPOSE 4000

# Synchronise le schéma (crée les tables au 1er lancement) puis démarre l'API.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node src/server.js"]
