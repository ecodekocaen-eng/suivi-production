// ─────────────────────────────────────────────────────────────
//  Impression des transferts : pastille d'état d'un envoi, état du
//  PC atelier (agent d'impression) et libellé des imprimantes.
// ─────────────────────────────────────────────────────────────
import { Hourglass, Printer, PrinterCheck, TriangleAlert, Ban, MonitorCheck, MonitorOff } from 'lucide-react';
import { IMPRESSION_LABELS, IMPRESSION_CLASS } from '../constants.js';
import { fmtDateTime, fmtRelative, plural } from '../format.js';

const ICONES = { EN_FILE: Hourglass, ENVOYE: Printer, IMPRIME: PrinterCheck, ERREUR: TriangleAlert, ANNULE: Ban };

// « A · Printer_1 (n° …017) » si l'agent a déclaré ses imprimantes, sinon « Imprimante A ».
export function libelleImprimante(poste, code) {
  const p = poste?.imprimantes?.find((i) => i.code === code);
  return p ? `${code} · ${p.libelle}` : `Imprimante ${code}`;
}

// Pastille d'un envoi : état et imprimante ; heure et message au survol.
export function ImpressionBadge({ impression }) {
  const Icone = ICONES[impression.statut] || Hourglass;
  const quand = impression.imprimeAt || impression.envoyeAt || impression.createdAt;
  const titre = [
    `${IMPRESSION_LABELS[impression.statut] || impression.statut} · imprimante ${impression.imprimante} · ${plural(impression.quantite, 'transfert')}`,
    quand ? fmtDateTime(quand) : null,
    impression.message,
  ].filter(Boolean).join('\n');
  return (
    <span className={`badge ${IMPRESSION_CLASS[impression.statut] || ''}`} title={titre}>
      <Icone />{IMPRESSION_LABELS[impression.statut] || impression.statut}
      {impression.statut !== 'ANNULE' && ` · ${impression.imprimante}`}
    </span>
  );
}

// État du PC atelier : en ligne, hors ligne (depuis…), ou agent pas encore installé.
export function PosteStatut({ poste }) {
  if (!poste) return null;
  if (!poste.connu) {
    return <span className="badge" title="Aucun signe de vie de l’agent d’impression pour l’instant"><MonitorOff />Agent d’impression non installé</span>;
  }
  const vu = `Dernier signe de vie : ${fmtDateTime(poste.derniereVue)}${poste.version ? ` · agent ${poste.version}` : ''}`;
  return poste.enLigne
    ? <span className="badge badge-success" title={vu}><MonitorCheck />{poste.nom} en ligne</span>
    : <span className="badge badge-warning" title={vu}><MonitorOff />{poste.nom} hors ligne · {fmtRelative(poste.derniereVue)}</span>;
}
