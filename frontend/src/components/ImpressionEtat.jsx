// ─────────────────────────────────────────────────────────────
//  Impression des transferts : pastille d'état d'un envoi, état du
//  PC atelier (agent d'impression) et libellé des imprimantes.
// ─────────────────────────────────────────────────────────────
import { Hourglass, Printer, PrinterCheck, TriangleAlert, Ban, MonitorCheck, MonitorOff } from 'lucide-react';
import { IMPRESSION_LABELS, IMPRESSION_CLASS, IMPRIMANTE_NUMEROS } from '../constants.js';
import { fmtDateTime, fmtRelative, plural } from '../format.js';

const ICONES = { EN_FILE: Hourglass, ENVOYE: Printer, IMPRIME: PrinterCheck, ERREUR: TriangleAlert, ANNULE: Ban };

// « Imprimante 1 » : les codes A et B ne sont jamais affichés.
export const nomImprimante = (code) => `Imprimante ${IMPRIMANTE_NUMEROS[code] ?? code}`;

// « 1 · Printer_1 » si l'agent a déclaré ses imprimantes, sinon « Imprimante 1 ».
export function libelleImprimante(poste, code) {
  const p = poste?.imprimantes?.find((i) => i.code === code);
  return p ? `${IMPRIMANTE_NUMEROS[code] ?? code} · ${p.libelle}` : nomImprimante(code);
}

// Derniers envois par clé (ligne, visuel) : ceux du lot le plus récent, soit
// deux quand un visuel a été réparti sur les deux imprimantes.
// `envois` va du plus récent au plus ancien.
export function derniersEnvoisPar(envois, cle) {
  const parCle = new Map();
  for (const e of envois) {
    const liste = parCle.get(cle(e));
    if (!liste) parCle.set(cle(e), [e]);
    else if (liste[0].lot === e.lot) liste.push(e);
  }
  return parCle;
}

// Pastille d'un envoi : état et imprimante ; heure et message au survol.
export function ImpressionBadge({ impression }) {
  const Icone = ICONES[impression.statut] || Hourglass;
  const quand = impression.imprimeAt || impression.envoyeAt || impression.createdAt;
  const titre = [
    `${IMPRESSION_LABELS[impression.statut] || impression.statut} · ${nomImprimante(impression.imprimante)} · ${plural(impression.quantite, 'transfert')}`,
    quand ? fmtDateTime(quand) : null,
    impression.message,
  ].filter(Boolean).join('\n');
  return (
    <span className={`badge ${IMPRESSION_CLASS[impression.statut] || ''}`} title={titre}>
      <Icone />{IMPRESSION_LABELS[impression.statut] || impression.statut}
      {impression.statut !== 'ANNULE' && ` · Imp. ${IMPRIMANTE_NUMEROS[impression.imprimante] ?? impression.imprimante}`}
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
