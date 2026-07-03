// ─────────────────────────────────────────────────────────────
//  Service de facturation ESAT.
//  Une commande est « à facturer » tant qu'elle n'est ni rattachée à un
//  relevé ni marquée facturée. Le relevé fige ses lignes (detailJson)
//  et son total au moment de la création.
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { addLog } from './log.service.js';
import { LOG_ACTIONS } from '../constants.js';

// Champs exposés au module facturation (liste blanche : jamais prixVente).
const factuSelect = {
  id: true, reference: true, client: true, designation: true,
  quantite: true, statut: true, dateCommande: true, dateExpedition: true,
  prixEsat: true,
};

const r2 = (x) => Math.round(x * 100) / 100;
const montant = (c) => r2((c.prixEsat || 0) * (c.quantite || 0));

// Commandes non encore facturées (sélection manuelle côté interface).
export async function listAFacturer() {
  const commandes = await prisma.commande.findMany({
    where: { supprime: false, releveId: null, factureAt: null },
    select: factuSelect,
    orderBy: { dateCommande: 'desc' },
  });
  return commandes.map((c) => ({ ...c, montant: montant(c) }));
}

// Numéro de relevé séquentiel par année : REL-2026-001, REL-2026-002…
export async function nextNumero() {
  const annee = new Date().getFullYear();
  const prefixe = `REL-${annee}-`;
  const rows = await prisma.releve.findMany({
    where: { numero: { startsWith: prefixe } },
    select: { numero: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = /-(\d+)$/.exec(r.numero || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefixe}${String(max + 1).padStart(3, '0')}`;
}

// Crée un relevé à partir d'une sélection de commandes non facturées.
export async function createReleve({ commandeIds, libelle }, userId) {
  const ids = [...new Set((commandeIds || []).map(Number).filter(Boolean))];
  if (ids.length === 0) {
    const e = new Error('Sélectionnez au moins une commande.'); e.status = 400; throw e;
  }

  // On ne prend que les commandes réellement facturables (jamais deux fois).
  const commandes = await prisma.commande.findMany({
    where: { id: { in: ids }, supprime: false, releveId: null, factureAt: null },
    select: factuSelect,
    orderBy: { dateCommande: 'asc' },
  });
  if (commandes.length === 0) {
    const e = new Error('Aucune commande facturable dans la sélection.'); e.status = 400; throw e;
  }

  const lignes = commandes.map((c) => ({
    reference: c.reference, client: c.client, designation: c.designation,
    quantite: c.quantite, prixEsat: c.prixEsat, montant: montant(c),
    dateCommande: c.dateCommande,
  }));
  const total = r2(lignes.reduce((s, l) => s + l.montant, 0));

  const releve = await prisma.releve.create({
    data: {
      numero: await nextNumero(),
      libelle: libelle || null,
      total,
      detailJson: JSON.stringify(lignes),
      creeParId: userId,
    },
  });
  await prisma.commande.updateMany({
    where: { id: { in: commandes.map((c) => c.id) } },
    data: { releveId: releve.id, factureAt: new Date() },
  });

  await addLog({
    action: LOG_ACTIONS.RELEVE_CREE,
    detail: `Relevé ${releve.numero} créé : ${commandes.length} commande(s), ${total} €`,
    userId,
  });
  return releve;
}

// Historique des relevés (le plus récent en premier).
export function listReleves() {
  return prisma.releve.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      creePar: { select: { nom: true } },
      _count: { select: { commandes: true } },
    },
  });
}

// Détail d'un relevé : lignes figées au moment de la création.
export async function getReleve(id) {
  const releve = await prisma.releve.findUnique({
    where: { id: Number(id) },
    include: { creePar: { select: { nom: true } } },
  });
  if (!releve) return null;
  const { detailJson, ...reste } = releve;
  let lignes = [];
  try { lignes = JSON.parse(detailJson || '[]'); } catch { /* relevé sans détail */ }
  return { ...reste, lignes };
}

// Annule un relevé : les commandes redeviennent « à facturer ».
export async function deleteReleve(id, userId) {
  const releve = await prisma.releve.findUnique({ where: { id: Number(id) } });
  if (!releve) return null;
  await prisma.commande.updateMany({
    where: { releveId: releve.id },
    data: { releveId: null, factureAt: null },
  });
  await prisma.releve.delete({ where: { id: releve.id } });
  await addLog({
    action: LOG_ACTIONS.RELEVE_ANNULE,
    detail: `Relevé ${releve.numero} annulé (commandes remises « à facturer »)`,
    userId,
  });
  return releve;
}

// Marque des commandes comme déjà facturées SANS relevé (apurement de
// l'historique : commandes facturées avant la mise en place du module).
export async function exclureCommandes(commandeIds, userId) {
  const ids = [...new Set((commandeIds || []).map(Number).filter(Boolean))];
  if (ids.length === 0) {
    const e = new Error('Sélectionnez au moins une commande.'); e.status = 400; throw e;
  }
  const result = await prisma.commande.updateMany({
    where: { id: { in: ids }, supprime: false, releveId: null, factureAt: null },
    data: { factureAt: new Date() },
  });
  await addLog({
    action: LOG_ACTIONS.COMMANDES_EXCLUES_FACTURATION,
    detail: `${result.count} commande(s) marquée(s) déjà facturée(s) (hors relevé)`,
    userId,
  });
  return result.count;
}
