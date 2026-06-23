// ─────────────────────────────────────────────────────────────
//  Démarrage du serveur HTTP
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './prisma.js';

// S'assure que le dossier d'upload existe.
fs.mkdirSync(config.uploadDir, { recursive: true });

// Auto-création du premier compte ADMIN (utile en déploiement cloud).
// Déclenché uniquement si la base ne contient aucun utilisateur ET que
// ADMIN_EMAIL / ADMIN_PASSWORD sont définis dans l'environnement.
async function ensureAdmin() {
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
    console.error('Auto-seed admin ignoré :', err.message);
  }
}

await ensureAdmin();

const app = createApp();
app.listen(config.port, () => {
  console.log(`🚀 API suivi de production sur http://localhost:${config.port}`);
  console.log(`   Environnement : ${config.nodeEnv}`);
});
