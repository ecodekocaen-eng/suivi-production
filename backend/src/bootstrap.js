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
    schemaOk = true;
  } catch (err) {
    console.error('Création des tables manquantes :', err.message);
  }
}
