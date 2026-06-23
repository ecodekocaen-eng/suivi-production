// ─────────────────────────────────────────────────────────────
//  Génération et téléchargement d'un CSV des statistiques.
//  Séparateur ";" + BOM UTF-8 pour une ouverture directe dans Excel (FR).
// ─────────────────────────────────────────────────────────────
import { STATUT_LABELS } from './constants.js';
import { fmtMois } from './format.js';

// Échappe une valeur pour le format CSV.
function cell(v) {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (arr) => arr.map(cell).join(';');

export function exportStatsCsv(data, periodeLabel) {
  const L = [];
  L.push(row(['Statistiques de production — ECODEKO']));
  L.push(row(['Période', periodeLabel]));
  L.push(row(['Généré le', new Date().toLocaleString('fr-FR')]));
  L.push('');

  L.push(row(['INDICATEURS']));
  L.push(row(['Commandes', data.kpis.nbCommandes]));
  L.push(row(['Mugs produits', data.kpis.quantiteTotale]));
  L.push(row(['Clients', data.kpis.nbClients]));
  L.push(row(['Rebut total', data.kpis.rebutTotal]));
  L.push(row(['CA ESAT estimé (€)', data.kpis.caEstime]));
  L.push(row(['Délai moyen production (j)', data.kpis.delaiMoyenJours ?? '']));
  L.push('');

  L.push(row(['PAR STATUT', 'Commandes']));
  for (const [s, n] of Object.entries(data.parStatut)) L.push(row([STATUT_LABELS[s] || s, n]));
  L.push('');

  L.push(row(['PAR MOIS', 'Commandes', 'Mugs']));
  for (const m of data.parMois) L.push(row([fmtMois(m.mois), m.commandes, m.quantite]));
  L.push('');

  L.push(row(['TOP CLIENTS', 'Commandes', 'Mugs']));
  for (const c of data.topClients) L.push(row([c.client, c.commandes, c.quantite]));
  L.push('');

  L.push(row(['PAR TYPE DE MUG', 'Commandes', 'Mugs']));
  for (const t of data.typesMug) L.push(row([t.type, t.commandes, t.quantite]));
  L.push('');

  L.push(row(['PAR ATELIER', 'Commandes']));
  for (const a of data.ateliers) L.push(row([a.atelier, a.count]));

  const csv = '﻿' + L.join('\r\n'); // BOM + CRLF
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `suivi-stats-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
