// ─────────────────────────────────────────────────────────────
//  Service commandes : CRUD, filtres, tri, pagination, soft delete,
//  changement de statut avec purge automatique à l'expédition.
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { addLog } from './log.service.js';
import { deleteFichiersForLigne } from './fichiers.service.js';
import { LOG_ACTIONS, STATUT_EXPEDIEE, STATUT_LABELS } from '../constants.js';

// Colonnes triables autorisées (liste blanche).
const SORTABLE = new Set([
  'reference', 'client', 'designation', 'quantite', 'statut',
  'dateCommande', 'dateLivraison', 'createdAt',
]);

// Liste paginée avec filtres, recherche, tri.
export async function listCommandes({
  search, statuts, livraisonDebut, livraisonFin,
  page = 1, pageSize = 20, sortBy = 'dateCommande', sortDir = 'desc',
  inclureSupprimees = false,
}) {
  const where = {};
  if (!inclureSupprimees) where.supprime = false;
  if (Array.isArray(statuts) && statuts.length > 0) where.statut = { in: statuts };

  if (search) {
    where.OR = [
      { reference: { contains: search } },
      { client: { contains: search } },
      { designation: { contains: search } },
    ];
  }

  if (livraisonDebut || livraisonFin) {
    where.dateLivraison = {};
    if (livraisonDebut) where.dateLivraison.gte = new Date(livraisonDebut);
    if (livraisonFin) where.dateLivraison.lte = new Date(livraisonFin);
  }

  const orderBy = {};
  orderBy[SORTABLE.has(sortBy) ? sortBy : 'dateCommande'] = sortDir === 'asc' ? 'asc' : 'desc';

  const take = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [total, items] = await Promise.all([
    prisma.commande.count({ where }),
    prisma.commande.findMany({
      where,
      orderBy,
      take,
      skip,
      include: { _count: { select: { fichiers: true } } },
    }),
  ]);

  return {
    items,
    total,
    page: Math.max(parseInt(page, 10) || 1, 1),
    pageSize: take,
    totalPages: Math.ceil(total / take),
  };
}

export function getCommande(id) {
  return prisma.commande.findUnique({
    where: { id: Number(id) },
    include: {
      fichiers: { orderBy: { createdAt: 'asc' } },
      lignes: { orderBy: { ordre: 'asc' } },
      modifiePar: { select: { nom: true, email: true } },
    },
  });
}

// Dérive les champs d'en-tête (quantité totale, type, désignation) à partir des lignes,
// pour que le tableau, la recherche et les stats restent cohérents.
function deriveHeader(lignes) {
  const quantite = lignes.reduce((s, l) => s + (l.quantite || 0), 0);
  const types = [...new Set(lignes.map((l) => (l.typeMug || '').trim()).filter(Boolean))];
  const typeMug = types.length === 0 ? null : (types.length === 1 ? types[0] : 'MULTI');
  const designation = lignes.length === 1
    ? (lignes[0].visuel || '')
    : `Multi visuels (${lignes.length})`;
  return { quantite, typeMug, designation };
}

// Compte des commandes (non supprimées) par statut, pour le tableau de bord.
export async function countByStatut() {
  const rows = await prisma.commande.groupBy({
    by: ['statut'],
    where: { supprime: false },
    _count: { _all: true },
  });
  const counts = {};
  for (const s of Object.keys(STATUT_LABELS)) counts[s] = 0;
  for (const r of rows) counts[r.statut] = r._count._all;
  return counts;
}

// Calcule la prochaine référence au format AAAA-NNNN (séquence par année).
// Ex : première commande de 2026 → "2026-0001", puis "2026-0002"…
export async function nextReference() {
  const annee = new Date().getFullYear();
  const prefixe = `${annee}-`;
  const rows = await prisma.commande.findMany({
    where: { reference: { startsWith: prefixe } },
    select: { reference: true },
  });
  let max = 0;
  for (const r of rows) {
    const m = /-(\d+)\s*$/.exec(r.reference || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefixe}${String(max + 1).padStart(4, '0')}`;
}

export async function createCommande(data, userId, lignes = null) {
  const payload = { ...data, modifieParId: userId };
  // Si des lignes sont fournies, l'en-tête (quantité/type/désignation) en découle.
  if (Array.isArray(lignes) && lignes.length > 0) Object.assign(payload, deriveHeader(lignes));

  // Référence automatique si non fournie.
  const refAuto = !payload.reference;
  if (refAuto) payload.reference = await nextReference();

  // Création avec petit retry si collision sur une référence auto-générée.
  let commande;
  for (let essai = 0; ; essai += 1) {
    try {
      commande = await prisma.commande.create({ data: payload });
      break;
    } catch (e) {
      if (e.code === 'P2002' && refAuto && essai < 5) {
        payload.reference = await nextReference();
        continue;
      }
      throw e;
    }
  }

  if (Array.isArray(lignes) && lignes.length > 0) {
    await prisma.ligneCommande.createMany({
      data: lignes.map((l, i) => ({
        typeMug: l.typeMug, visuel: l.visuel, quantite: l.quantite,
        commentaire: l.commentaire, lien: l.lien, ordre: i, commandeId: commande.id,
      })),
    });
  }

  await addLog({
    action: LOG_ACTIONS.COMMANDE_CREEE,
    detail: `Commande ${commande.reference} créée`,
    userId,
    commandeId: commande.id,
  });
  return commande;
}

// Met à jour une commande et gère le changement de statut + purge à l'expédition.
export async function updateCommande(id, data, userId, lignes = null) {
  const existing = await prisma.commande.findUnique({ where: { id: Number(id) } });
  if (!existing) return null;

  const nouveauStatut = data.statut;
  const statutChange = nouveauStatut && nouveauStatut !== existing.statut;

  // Si on passe à EXPEDIEE, on date l'expédition.
  if (statutChange && nouveauStatut === STATUT_EXPEDIEE && existing.statut !== STATUT_EXPEDIEE) {
    data.dateExpedition = new Date();
  }

  // Si des lignes sont fournies, elles remplacent les précédentes et redéfinissent l'en-tête.
  const majLignes = Array.isArray(lignes);
  if (majLignes && lignes.length > 0) Object.assign(data, deriveHeader(lignes));

  const commande = await prisma.commande.update({
    where: { id: Number(id) },
    data: { ...data, modifieParId: userId },
  });

  if (majLignes) {
    // Diff par id pour PRÉSERVER l'identité des lignes (donc leurs visuels) :
    // - lignes existantes absentes du payload → supprimées (avec leurs fichiers)
    // - lignes avec id → mises à jour
    // - lignes sans id → créées
    const existantes = await prisma.ligneCommande.findMany({ where: { commandeId: commande.id } });
    const idsExistants = new Set(existantes.map((e) => e.id));
    const idsRecus = new Set(lignes.filter((l) => l.id).map((l) => Number(l.id)));

    for (const e of existantes) {
      if (!idsRecus.has(e.id)) {
        await deleteFichiersForLigne(e.id, userId); // nettoie les visuels sur disque
        await prisma.ligneCommande.delete({ where: { id: e.id } });
      }
    }

    let ordre = 0;
    for (const l of lignes) {
      const dataL = {
        typeMug: l.typeMug, visuel: l.visuel, quantite: l.quantite,
        commentaire: l.commentaire, lien: l.lien, ordre,
      };
      if (l.id && idsExistants.has(Number(l.id))) {
        await prisma.ligneCommande.update({ where: { id: Number(l.id) }, data: dataL });
      } else {
        await prisma.ligneCommande.create({ data: { ...dataL, commandeId: commande.id } });
      }
      ordre += 1;
    }
  }

  if (statutChange) {
    await addLog({
      action: LOG_ACTIONS.STATUT_MODIFIE,
      detail: `Statut modifié : ${STATUT_LABELS[existing.statut] || existing.statut} → ${STATUT_LABELS[nouveauStatut] || nouveauStatut}`,
      userId,
      commandeId: commande.id,
    });
    // Les visuels ne sont PLUS supprimés à l'expédition : ils sont conservés
    // (rétention) puis purgés par le nettoyage automatique (voir purgeExpiredFichiers).
  } else {
    await addLog({
      action: LOG_ACTIONS.COMMANDE_MODIFIEE,
      detail: `Commande ${commande.reference} modifiée`,
      userId,
      commandeId: commande.id,
    });
  }

  return prisma.commande.findUnique({ where: { id: Number(id) } });
}

// Soft delete (réservé ADMIN).
export async function softDeleteCommande(id, userId) {
  const existing = await prisma.commande.findUnique({ where: { id: Number(id) } });
  if (!existing) return null;
  const commande = await prisma.commande.update({
    where: { id: Number(id) },
    data: { supprime: true, supprimeAt: new Date() },
  });
  await addLog({
    action: LOG_ACTIONS.COMMANDE_SUPPRIMEE,
    detail: `Commande ${commande.reference} supprimée (corbeille)`,
    userId,
    commandeId: commande.id,
  });
  return commande;
}

// Restauration depuis la corbeille (réservé ADMIN).
export async function restoreCommande(id, userId) {
  const commande = await prisma.commande.update({
    where: { id: Number(id) },
    data: { supprime: false, supprimeAt: null },
  });
  await addLog({
    action: LOG_ACTIONS.COMMANDE_RESTAUREE,
    detail: `Commande ${commande.reference} restaurée`,
    userId,
    commandeId: commande.id,
  });
  return commande;
}
