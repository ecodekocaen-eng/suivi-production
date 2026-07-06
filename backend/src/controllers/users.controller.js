// ─────────────────────────────────────────────────────────────
//  Contrôleur de gestion des utilisateurs (réservé ADMIN)
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { prisma } from '../prisma.js';
import { ROLES, LOG_ACTIONS, USER_LOG_ACTIONS } from '../constants.js';
import { addLog, getUserAuditLogs } from '../services/log.service.js';

const publicSelect = {
  id: true, email: true, nom: true, role: true, actif: true,
  accesFacturation: true, createdAt: true,
};

export async function listUsers(req, res) {
  const users = await prisma.user.findMany({ select: publicSelect, orderBy: { createdAt: 'asc' } });
  res.json({ users });
}

// Journal d'audit des comptes (qui a créé / modifié / supprimé quel compte).
export async function listUserLogs(req, res) {
  const logs = await getUserAuditLogs(USER_LOG_ACTIONS, 100);
  res.json({ logs });
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
  await addLog({
    action: LOG_ACTIONS.USER_CREE,
    detail: `Compte créé : ${user.email} (${user.role})`,
    userId: req.user.id,
  });
  res.status(201).json({ user });
}

// Mise à jour : nom, rôle, activation, et mot de passe (optionnel).
export async function updateUser(req, res) {
  const id = Number(req.params.id);
  const { nom, role, actif, accesFacturation, password } = req.body;

  const data = {};
  const changements = [];
  if (nom !== undefined) { data.nom = String(nom).trim(); changements.push('nom'); }
  if (role !== undefined && ROLES.includes(role)) { data.role = role; changements.push(`rôle → ${role}`); }
  if (actif !== undefined) { data.actif = Boolean(actif); changements.push(data.actif ? 'activé' : 'désactivé'); }
  if (accesFacturation !== undefined) {
    data.accesFacturation = Boolean(accesFacturation);
    changements.push(data.accesFacturation ? 'accès facturation activé' : 'accès facturation retiré');
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min. 6).' });
    data.password = bcrypt.hashSync(password, 12);
    changements.push('mot de passe');
  }

  // Empêche un admin de se désactiver ou se rétrograder lui-même.
  if (id === req.user.id && (data.actif === false || data.role === 'OPERATEUR')) {
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver ou rétrograder votre propre compte.' });
  }

  const user = await prisma.user.update({ where: { id }, data, select: publicSelect });
  await addLog({
    action: LOG_ACTIONS.USER_MODIFIE,
    detail: `Compte ${user.email} modifié : ${changements.join(', ') || '—'}`,
    userId: req.user.id,
  });
  res.json({ user });
}

// Suppression définitive d'un compte (réservé ADMIN).
// Détache d'abord les références (commandes modifiées, logs) pour éviter les
// violations de clés étrangères, puis supprime le compte.
export async function deleteUser(req, res) {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }
  const cible = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!cible) return res.status(404).json({ error: 'Compte introuvable.' });

  await prisma.commande.updateMany({ where: { modifieParId: id }, data: { modifieParId: null } });
  await prisma.log.updateMany({ where: { userId: id }, data: { userId: null } });
  await prisma.releve.updateMany({ where: { creeParId: id }, data: { creeParId: null } });
  await prisma.user.delete({ where: { id } });

  await addLog({
    action: LOG_ACTIONS.USER_SUPPRIME,
    detail: `Compte supprimé : ${cible.email} (${cible.role})`,
    userId: req.user.id,
  });
  res.json({ ok: true });
}
