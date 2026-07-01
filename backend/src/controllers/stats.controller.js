// ─────────────────────────────────────────────────────────────
//  Contrôleur des statistiques (agrégations en JS, portable).
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { STATUTS, STATUT_EXPEDIEE } from '../constants.js';

function debutPeriode(periode) {
  const now = new Date();
  if (periode === '12m') { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d; }
  if (periode === 'annee') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

const moisKey = (d) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
};

export async function stats(req, res) {
  const periode = req.query.periode || 'tout';
  const debut = debutPeriode(periode);
  const now = new Date();

  const commandes = await prisma.commande.findMany({
    where: { supprime: false },
    select: {
      dateCommande: true, dateExpedition: true, dateLivraison: true, quantite: true,
      statut: true, client: true, typeMug: true, prixEsat: true, prixVente: true, rebut: true,
      atelier: true, designation: true,
    },
  });
  const produits = await prisma.produit.findMany({ select: { nom: true, prixAchat: true } });
  const prixByType = Object.fromEntries(produits.map((p) => [p.nom, p.prixAchat]));
  const prixLigne = (c) => (c.prixEsat != null ? c.prixEsat : (prixByType[c.typeMug] || 0));

  // ── Production mensuelle sur TOUT l'historique (pour la comparaison N-1) ──
  const moisMap = new Map();
  for (const c of commandes) {
    if (!c.dateCommande) continue;
    const k = moisKey(c.dateCommande);
    const cur = moisMap.get(k) || { commandes: 0, quantite: 0 };
    cur.commandes += 1; cur.quantite += c.quantite || 0;
    moisMap.set(k, cur);
  }
  const parMois = [...moisMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mois, v]) => ({ mois, ...v }));

  // ── Sous-ensemble filtré par période ──
  const inPeriod = debut ? commandes.filter((c) => c.dateCommande && new Date(c.dateCommande) >= debut) : commandes;

  let quantiteTotale = 0; let rebutTotal = 0; let coutAchat = 0;
  const clients = new Set();
  const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  const parClient = new Map(); const parTypeMug = new Map(); const parAtelier = new Map();
  let delaiSomme = 0; let delaiN = 0;
  const bump = (m, k, q) => { const c = m.get(k) || { commandes: 0, quantite: 0 }; c.commandes += 1; c.quantite += q; m.set(k, c); };

  for (const c of inPeriod) {
    const q = c.quantite || 0;
    quantiteTotale += q; rebutTotal += c.rebut || 0; coutAchat += prixLigne(c) * q;
    if (c.client) clients.add(c.client.trim().toUpperCase());
    if (parStatut[c.statut] !== undefined) parStatut[c.statut] += 1;
    if (c.client) bump(parClient, c.client.trim(), q);
    bump(parTypeMug, c.typeMug?.trim() || '(non précisé)', q);
    const at = c.atelier?.trim() || '(aucun)';
    parAtelier.set(at, (parAtelier.get(at) || 0) + 1);
    if (c.dateCommande && c.dateExpedition) {
      const j = (new Date(c.dateExpedition) - new Date(c.dateCommande)) / 86400000;
      if (j >= 0 && j < 400) { delaiSomme += j; delaiN += 1; }
    }
  }

  // ── Charge de production (à produire = non expédié) ──
  const chargeMap = new Map();
  let aProduire = 0; let aProduireCommandes = 0;
  for (const c of inPeriod) {
    if (c.statut === STATUT_EXPEDIEE) continue;
    const q = c.quantite || 0; aProduire += q; aProduireCommandes += 1;
    const cur = chargeMap.get(c.statut) || { commandes: 0, quantite: 0 };
    cur.commandes += 1; cur.quantite += q; chargeMap.set(c.statut, cur);
  }
  const charge = STATUTS.filter((s) => s !== STATUT_EXPEDIEE)
    .map((s) => ({ statut: s, commandes: chargeMap.get(s)?.commandes || 0, quantite: chargeMap.get(s)?.quantite || 0 }));

  // ── Retards : date de sortie dépassée et non expédié ──
  const retards = commandes
    .filter((c) => c.statut !== STATUT_EXPEDIEE && c.dateLivraison && new Date(c.dateLivraison) < now)
    .map((c) => ({
      client: c.client, designation: c.designation, quantite: c.quantite, statut: c.statut,
      dateLivraison: c.dateLivraison, joursRetard: Math.floor((now - new Date(c.dateLivraison)) / 86400000),
    }))
    .sort((a, b) => b.joursRetard - a.joursRetard)
    .slice(0, 10);

  // ── Deltas vs période précédente de même durée ──
  let deltas = null;
  if (debut) {
    const prevDebut = new Date(debut.getTime() - (now - debut));
    let pM = 0; let pC = 0; let pCout = 0;
    for (const c of commandes) {
      if (!c.dateCommande) continue;
      const d = new Date(c.dateCommande);
      if (d >= prevDebut && d < debut) { const q = c.quantite || 0; pM += q; pC += 1; pCout += prixLigne(c) * q; }
    }
    const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
    deltas = { mugs: pct(quantiteTotale, pM), commandes: pct(inPeriod.length, pC), cout: pct(coutAchat, pCout) };
  }

  // ── Rentabilité (réservée ADMIN) : sur les commandes ayant un prix de vente ──
  let marge = null;
  if (req.user.role === 'ADMIN') {
    let ca = 0; let cout = 0; let nb = 0;
    for (const c of inPeriod) {
      if (c.prixVente == null) continue;
      const q = c.quantite || 0;
      ca += c.prixVente * q; cout += prixLigne(c) * q; nb += 1;
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    marge = {
      ca: r2(ca), cout: r2(cout), marge: r2(ca - cout),
      taux: ca > 0 ? Math.round(((ca - cout) / ca) * 1000) / 10 : null,
      nbCommandes: nb, nbTotal: inPeriod.length,
    };
  }

  const topClients = [...parClient.entries()].map(([client, v]) => ({ client, ...v }))
    .sort((a, b) => b.quantite - a.quantite).slice(0, 8);
  const typesMug = [...parTypeMug.entries()].map(([type, v]) => ({ type, ...v })).sort((a, b) => b.quantite - a.quantite);
  const ateliers = [...parAtelier.entries()].map(([atelier, count]) => ({ atelier, count })).sort((a, b) => b.count - a.count);

  res.json({
    periode,
    kpis: {
      nbCommandes: inPeriod.length,
      quantiteTotale,
      nbClients: clients.size,
      rebutTotal,
      tauxRebut: quantiteTotale ? Math.round((rebutTotal / quantiteTotale) * 10000) / 100 : 0,
      coutAchat: Math.round(coutAchat * 100) / 100,
      delaiMoyenJours: delaiN ? Math.round((delaiSomme / delaiN) * 10) / 10 : null,
      aProduire,
      aProduireCommandes,
    },
    deltas,
    marge,
    parStatut,
    parMois,
    charge,
    topClients,
    typesMug,
    ateliers,
    retards,
  });
}
