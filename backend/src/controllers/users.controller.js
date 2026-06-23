// ─────────────────────────────────────────────────────────────
//  Contrôleur de gestion des utilisateurs (réservé ADMIN)
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { ROLES } from '../constants.js';

const publicSelect = { id: true, email: true, nom: true, role: true, actif: true, createdAt: true };

export async function listUsers(req, res) {
  const users = await prisma.user.findMany({ select: publicSelect, orderBy: { createdAt: 'asc' } });
  res.json({ users });
}

export async function createUser(req, res) {
  const { email, nom, password, role } = req.body;

  if (!email || !nom || !password) {
    return res.status(400).json({ error: 'Email, nom et mot de passe sont requis.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
  }
  const roleFinal = ROLES.includes(role) ? role : 'OPERATEUR';

  const exists = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });

  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      nom: nom.trim(),
      password: bcrypt.hashSync(password, 12),
      role: roleFinal,
    },
    select: publicSelect,
  });
  res.status(201).json({ user });
}

// Mise à jour : nom, rôle, activation, et mot de passe (optionnel).
export async function updateUser(req, res) {
  const id = Number(req.params.id);
  const { nom, role, actif, password } = req.body;

  const data = {};
  if (nom !== undefined) data.nom = String(nom).trim();
  if (role !== undefined && ROLES.includes(role)) data.role = role;
  if (actif !== undefined) data.actif = Boolean(actif);
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min. 6).' });
    data.password = bcrypt.hashSync(password, 12);
  }

  // Empêche un admin de se désactiver ou se rétrograder lui-même.
  if (id === req.user.id && (data.actif === false || data.role === 'OPERATEUR')) {
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte.' });
  }

  const user = await prisma.user.update({ where: { id }, data, select: publicSelect });
  res.json({ user });
}
