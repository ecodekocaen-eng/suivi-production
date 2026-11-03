// ─────────────────────────────────────────────────────────────
//  Initialisation commune (serveur classique ET serverless Vercel).
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

// Crée le 1er compte ADMIN si la base est vide et que ADMIN_EMAIL/PASSWORD
// sont définis. Idempotent (no-op dès qu'un utilisateur existe).
let done = false;
export async function ensureAdmin() {
  if (done) return;
  done = true;
  try {
    const count = await prisma.user.count();
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (count === 0 && email && password.length >= 6) {
      await prisma.user.create({
        data: {
          email,
          nom: process.env.ADMIN_NOM || 'Administrateur',
          password: bcrypt.hashSync(password, 12),
          role: 'ADMIN',
        },
      });
      console.log(`✅ Compte ADMIN initial créé : ${email}`);
    }
  } catch (err) {
    done = false; // on réessaiera au prochain démarrage
    console.error('Auto-seed admin ignoré :', err.message);
  }
}

// Tables ajoutées après la mise en service : la base PostgreSQL de production
// n'est pas migrée automatiquement, on crée donc ici ce qui manque (sans jamais
// toucher aux tables existantes). SQL identique à ce que créerait `prisma db push`
// pour schema.postgres.prisma. En local (SQLite) : `npm run prisma:push`.
let schemaOk = false;
export async function ensureSchema() {
  if (schemaOk || !/^postgres/i.test(process.env.DATABASE_URL || '')) return;
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Modele" (
      "id" SERIAL NOT NULL,
      "reference" TEXT NOT NULL,
      "nom" TEXT NOT NULL,
      "client" TEXT,
      "typeMug" TEXT,
      "fichierNom" TEXT,
      "fichierChemin" TEXT,
      "fichierTaille" INTEGER,
      "fichierType" TEXT,
      "apercuChemin" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Modele_pkey" PRIMARY KEY ("id")
    )`);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Modele_reference_key" ON "Modele"("reference")');

    // File d'impression des transferts + signe de vie de l'agent (PC atelier).
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Impression" (
      "id" SERIAL NOT NULL,
      "commandeId" INTEGER NOT NULL,
      "ligneId" INTEGER,
      "fichierId" INTEGER,
      "fichierNom" TEXT NOT NULL,
      "quantite" INTEGER NOT NULL,
      "imprimante" TEXT NOT NULL,
      "statut" TEXT NOT NULL DEFAULT 'EN_FILE',
      "message" TEXT,
      "lot" TEXT NOT NULL,
      "creeParId" INTEGER,
      "creeParNom" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "envoyeAt" TIMESTAMP(3),
      "imprimeAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Impression_pkey" PRIMARY KEY ("id")
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PosteImpression" (
      "id" SERIAL NOT NULL,
      "nom" TEXT NOT NULL,
      "version" TEXT,
      "imprimantes" TEXT,
      "derniereVue" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PosteImpression_pkey" PRIMARY KEY ("id")
    )`);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Impression_commandeId_idx" ON "Impression"("commandeId")');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Impression_statut_idx" ON "Impression"("statut")');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "PosteImpression_nom_key" ON "PosteImpression"("nom")');
    // PostgreSQL n'a pas de « ADD CONSTRAINT IF NOT EXISTS » : on vérifie d'abord.
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Impression_commandeId_fkey') THEN
        ALTER TABLE "Impression" ADD CONSTRAINT "Impression_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`);
    schemaOk = true;
  } catch (err) {
    console.error('Création des tables manquantes :', err.message);
  }
}
