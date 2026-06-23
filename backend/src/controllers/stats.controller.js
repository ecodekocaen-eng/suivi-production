// ─────────────────────────────────────────────────────────────
//  Contrôleur des statistiques.
//  Agrégations calculées en JS (portable SQLite/PostgreSQL) sur les
//  commandes non supprimées.
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { STATUTS } from '../constants.js';

// Calcule la date de début selon la période demandée (ou null = tout).
function debutPeriode(periode) {
  const now = new Date();
  if (periode === '12m') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 12);
    return d;
  }
  if (periode === 'annee') {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }
  return null; // 'tout'
}

export async function stats(req, res) {
  const periode = req.query.periode || 'tout';
  const debut = debutPeriode(periode);

  const where = { supprime: false };
  if (debut) where.dateCommande = { gte: debut };

  const commandes = await prisma.commande.findMany({
    where,
    select: {
      dateCommande: true, dateExpedition: true, quantite: true, statut: true,
      client: true, typeMug: true, prixEsat: true, rebut: true, atelier: true,
    },
  });

  // ── KPIs globaux ──
  let quantiteTotale = 0;
  let rebutTotal = 0;
  let caEstime = 0;
  const clients = new Set();

  // ── Accumulateurs ──
  const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  const parMois = new Map();     // 'YYYY-MM' -> { commandes, quantite }
  const parClient = new Map();   // client    -> { commandes, quantite }
  const parTypeMug = new Map();  // type      -> { commandes, quantite }
  const parAtelier = new Map();  // atelier   -> count

  // Délai moyen de production (commande → expédition), en jours.
  let delaiSomme = 0;
  let delaiN = 0;

  const bump = (map, key, qte) => {
    const cur = map.get(key) || { commandes: 0, quantite: 0 };
    cur.commandes += 1;
    cur.quantite += qte;
    map.set(key, cur);
  };

  for (const c of commandes) {
    const qte = c.quantite || 0;
    quantiteTotale += qte;
    rebutTotal += c.rebut || 0;
    if (c.prixEsat) caEstime += c.prixEsat * qte;
    if (c.client) clients.add(c.client.trim().toUpperCase());

    if (parStatut[c.statut] !== undefined) parStatut[c.statut] += 1;

    if (c.dateCommande) {
      const d = new Date(c.dateCommande);
      const mois = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      bump(parMois, mois, qte);
    }
    if (c.client) bump(parClient, c.client.trim(), qte);
    bump(parTypeMug, c.typeMug?.trim() || '(non précisé)', qte);

    const at = c.atelier?.trim() || '(aucun)';
    parAtelier.set(at, (parAtelier.get(at) || 0) + 1);

    if (c.dateCommande && c.dateExpedition) {
      const jours = (new Date(c.dateExpedition) - new Date(c.dateCommande)) / 86400000;
      if (jours >= 0 && jours < 400) { delaiSomme += jours; delaiN += 1; }
    }
  }

  // ── Mise en forme ──
  const moisTries = [...parMois.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mois, v]) => ({ mois, ...v }));

  const topClients = [...parClient.entries()]
    .map(([client, v]) => ({ client, ...v }))
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, 10);

  const typesMug = [...parTypeMug.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.quantite - a.quantite);

  const ateliers = [...parAtelier.entries()]
    .map(([atelier, count]) => ({ atelier, count }))
    .sort((a, b) => b.count - a.count);

  res.json({
    periode,
    kpis: {
      nbCommandes: commandes.length,
      quantiteTotale,
      nbClients: clients.size,
      rebutTotal,
      caEstime: Math.round(caEstime * 100) / 100,
      delaiMoyenJours: delaiN ? Math.round((delaiSomme / delaiN) * 10) / 10 : null,
    },
    parStatut,
    parMois: moisTries,
    topClients,
    typesMug,
    ateliers,
  });
}
