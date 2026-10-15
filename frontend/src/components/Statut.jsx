// ─────────────────────────────────────────────────────────────
//  Affichage des statuts (pastille, sélecteur, icône) et de l'échéance.
//  Chaque statut a sa couleur ET son icône (lisible sans les couleurs).
// ─────────────────────────────────────────────────────────────
import { Hourglass, Printer, Cog, CircleCheck, Truck, Flame, CalendarClock, TriangleAlert } from 'lucide-react';
import { STATUTS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import { echeance } from '../format.js';

export const STATUT_ICONS = {
  'En attente': Hourglass,
  'Impression OK': Printer,
  'En cours de prod': Cog,
  'Terminé': CircleCheck,
  'Expédié': Truck,
};

export function StatutIcon({ statut, ...props }) {
  const Icone = STATUT_ICONS[statut] || Hourglass;
  return <Icone {...props} />;
}

export function StatutBadge({ statut, large = false }) {
  return (
    <span className={`status ${STATUT_CLASS[statut] || 'st-attente'}${large ? ' status-lg' : ''}`}>
      <StatutIcon statut={statut} />
      {STATUT_LABELS[statut] || statut}
    </span>
  );
}

// Sélecteur de statut en forme de pastille colorée (changement en un geste).
export function StatutSelect({ value, onChange, disabled = false }) {
  return (
    <span className={`status-select ${STATUT_CLASS[value] || 'st-attente'}`}>
      <StatutIcon statut={value} />
      <select value={value} disabled={disabled} aria-label="Statut de la commande"
              onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()}>
        {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
      </select>
    </span>
  );
}

const ECHEANCE_ICONS = { late: TriangleAlert, today: CalendarClock, soon: CalendarClock, asap: Flame };

// Puce d'échéance : « Retard 3 j », « Aujourd'hui », « J-2 », « ASAP ».
export function Echeance({ commande }) {
  const e = echeance(commande);
  if (!e) return null;
  const Icone = ECHEANCE_ICONS[e.type];
  return <span className={`due due-${e.type}`} title={e.titre}><Icone />{e.label}</span>;
}
