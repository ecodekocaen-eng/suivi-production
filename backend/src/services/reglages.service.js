// ─────────────────────────────────────────────────────────────
//  Service des réglages de production par visuel.
//  Un réglage = température + temps de presse + note, associé à un
//  visuel (clé normalisée pour retrouver le réglage malgré les
//  variantes d'orthographe).
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { addLog } from './log.service.js';
import { LOG_ACTIONS } from '../constants.js';

// Normalise un nom de visuel pour servir de clé de correspondance
// (espaces réduits + majuscules), comme la normalisation des clients.
export function normVisuel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Liste des réglages, filtrable par recherche sur le libellé du visuel.
export async function listReglages(search) {
  const where = {};
  const s = (search || '').trim();
  if (s) where.visuel = { contains: s };
  return prisma.reglage.findMany({ where, orderBy: { visuel: 'asc' } });
}

// Réglages correspondant à une liste de visuels (pour la fiche commande).
// Retourne un objet indexé par clé normalisée.
export async function getReglagesForVisuels(visuels) {
  const cles = [...new Set((visuels || []).map(normVisuel).filter(Boolean))];
  if (cles.length === 0) return {};
  const rows = await prisma.reglage.findMany({ where: { cle: { in: cles } } });
  return Object.fromEntries(rows.map((r) => [r.cle, r]));
}

// Dernière utilisation de chaque visuel (référence + date de commande),
// calculée à partir des en-têtes de commande ET des lignes.
// Retourne une Map : clé normalisée → { reference, date }.
export async function usageByVisuel() {
  const map = new Map();
  const consider = (visuel, reference, date) => {
    const cle = normVisuel(visuel);
    if (!cle || !date) return;
    const prev = map.get(cle);
    if (!prev || new Date(date) > new Date(prev.date)) map.set(cle, { reference, date });
  };

  // Les deux lectures sont indépendantes → en parallèle (une seule latence).
  const [cmds, lignes] = await Promise.all([
    prisma.commande.findMany({
      where: { supprime: false },
      select: { designation: true, reference: true, dateCommande: true },
    }),
    prisma.ligneCommande.findMany({
      where: { commande: { supprime: false } },
      select: { visuel: true, commande: { select: { reference: true, dateCommande: true } } },
    }),
  ]);
  // On traite les en-têtes d'abord (comportement identique : > strict, 1er gardé à date égale).
  for (const c of cmds) consider(c.designation, c.reference, c.dateCommande);
  for (const l of lignes) consider(l.visuel, l.commande.reference, l.commande.dateCommande);

  return map;
}

// Crée ou met à jour le réglage d'un visuel (clé = visuel normalisé).
export async function upsertReglage({ visuel, temperature, tempsSecondes, note }, userId) {
  const cle = normVisuel(visuel);
  if (!cle) { const e = new Error('Le visuel est requis.'); e.status = 400; throw e; }
  const label = String(visuel).replace(/\s+/g, ' ').trim(); // conserve la casse, nettoie les espaces
  const data = { visuel: label, temperature, tempsSecondes, note };
  const reglage = await prisma.reglage.upsert({
    where: { cle },
    update: data,
    create: { cle, ...data },
  });
  await addLog({
    action: LOG_ACTIONS.REGLAGE_ENREGISTRE,
    detail: `Réglage « ${reglage.visuel} » : ${temperature ?? '—'} °C · ${tempsSecondes ?? '—'} s`,
    userId,
  });
  return reglage;
}

export async function deleteReglage(id, userId) {
  const r = await prisma.reglage.findUnique({ where: { id: Number(id) } });
  if (!r) return null;
  await prisma.reglage.delete({ where: { id: Number(id) } });
  await addLog({
    action: LOG_ACTIONS.REGLAGE_SUPPRIME,
    detail: `Réglage « ${r.visuel} » supprimé`,
    userId,
  });
  return r;
}
