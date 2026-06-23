// Badge coloré affichant le libellé d'un statut.
import { STATUT_LABELS, STATUT_CLASS } from '../constants.js';

export default function StatutBadge({ statut }) {
  return (
    <span className={`badge ${STATUT_CLASS[statut] || ''}`}>
      {STATUT_LABELS[statut] || statut}
    </span>
  );
}
