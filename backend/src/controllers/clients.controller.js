// ─────────────────────────────────────────────────────────────
//  Contrôleur de gestion des clients (réservé ADMIN)
//  Permet de lister les clients distincts et de fusionner les
//  variantes d'orthographe (ex : "PUBLI SOUVENIR" / "PUBLI SOUVENIRS").
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { addLog } from '../services/log.service.js';
import { LOG_ACTIONS } from '../constants.js';

// Noms de clients distincts (pour l'autocomplétion du formulaire).
// Accessible à tout utilisateur authentifié.
export async function listClientNames(req, res) {
  const rows = await prisma.commande.findMany({
    where: { supprime: false },
    distinct: ['client'],
    select: { client: true },
    orderBy: { client: 'asc' },
  });
  res.json({ clients: rows.map((r) => r.client).filter(Boolean) });
}

// Liste des clients distincts avec nombre de commandes et quantité totale.
export async function listClients(req, res) {
  const rows = await prisma.commande.groupBy({
    by: ['client'],
    where: { supprime: false },
    _count: { _all: true },
    _sum: { quantite: true },
  });
  const clients = rows
    .map((r) => ({ client: r.client, commandes: r._count._all, quantite: r._sum.quantite || 0 }))
    .sort((a, b) => a.client.localeCompare(b.client, 'fr'));
  res.json({ clients });
}

// Fusionne plusieurs noms de clients vers un nom canonique.
export async function mergeClients(req, res) {
  const { from, to } = req.body;
  const cible = (to || '').trim();
  if (!Array.isArray(from) || from.length === 0 || !cible) {
    return res.status(400).json({ error: 'Sélectionnez des clients et un nom cible.' });
  }
  const result = await prisma.commande.updateMany({
    where: { client: { in: from } },
    data: { client: cible },
  });
  await addLog({
    action: LOG_ACTIONS.CLIENTS_FUSIONNES,
    detail: `Fusion « ${from.join(' », « ')} » → « ${cible} » (${result.count} commande(s))`,
    userId: req.user.id,
  });
  res.json({ updated: result.count });
}

// Nettoie les espaces superflus dans tous les noms de clients (trim + espaces multiples).
export async function normalizeClients(req, res) {
  const rows = await prisma.commande.findMany({ select: { id: true, client: true } });
  let n = 0;
  for (const r of rows) {
    const propre = (r.client || '').replace(/\s+/g, ' ').trim();
    if (propre !== r.client) {
      await prisma.commande.update({ where: { id: r.id }, data: { client: propre } });
      n += 1;
    }
  }
  await addLog({
    action: LOG_ACTIONS.CLIENTS_NORMALISES,
    detail: `Nettoyage des espaces sur ${n} commande(s)`,
    userId: req.user.id,
  });
  res.json({ updated: n });
}
