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
