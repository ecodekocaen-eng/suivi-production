// ─────────────────────────────────────────────────────────────
//  Création du premier compte ADMIN
//  Usage : npm run seed -- <email> <mot_de_passe> [nom]
//  Ou via variables d'env : ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOM
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma.js';

const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.argv[3] || process.env.ADMIN_PASSWORD || '';
const nom = process.argv[4] || process.env.ADMIN_NOM || 'Administrateur';

if (!email || !password) {
  console.error('❌ Usage : npm run seed -- <email> <mot_de_passe> [nom]');
  process.exit(1);
}
if (password.length < 6) {
  console.error('❌ Le mot de passe doit faire au moins 6 caractères.');
  process.exit(1);
}

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.error(`❌ Un compte existe déjà avec l'email « ${email} ».`);
  process.exit(1);
}

await prisma.user.create({
  data: { email, nom, password: bcrypt.hashSync(password, 12), role: 'ADMIN' },
});

console.log(`✅ Compte ADMIN créé : ${email}`);
await prisma.$disconnect();
process.exit(0);
