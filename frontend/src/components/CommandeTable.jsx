// ─────────────────────────────────────────────────────────────
//  Tableau des commandes : colonnes triables, statut inline, lien fiche.
// ─────────────────────────────────────────────────────────────
import { useNavigate } from 'react-router-dom';
import { STATUTS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import { fmtDate } from '../format.js';

// En-tête de colonne triable.
function Th({ label, col, sortBy, sortDir, onSort, className }) {
  const active = sortBy === col;
  const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th className={className} onClick={() => onSort(col)} style={{ cursor: 'pointer' }} title="Trier">
      {label}{arrow}
    </th>
  );
}

export default function CommandeTable({ commandes, sortBy, sortDir, onSort, onStatutChange }) {
  const navigate = useNavigate();

  return (
    <div className="table-wrap">
      <table className="orders">
        <thead>
          <tr>
            <Th label="Référence" col="reference" {...{ sortBy, sortDir, onSort }} />
            <Th label="Client" col="client" {...{ sortBy, sortDir, onSort }} />
            <Th label="Désignation" col="designation" {...{ sortBy, sortDir, onSort }} />
            <Th label="Type" col="typeMug" {...{ sortBy, sortDir, onSort }} />
            <Th label="Qté" col="quantite" className="num" {...{ sortBy, sortDir, onSort }} />
            <Th label="Statut" col="statut" {...{ sortBy, sortDir, onSort }} />
            <Th label="Commande" col="dateCommande" {...{ sortBy, sortDir, onSort }} />
            <Th label="Livraison" col="dateLivraison" {...{ sortBy, sortDir, onSort }} />
            <th className="num">📎</th>
            <th className="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {commandes.length === 0 && (
            <tr><td colSpan="10" className="empty-cell">Aucune commande.</td></tr>
          )}
          {commandes.map((c) => (
            <tr
              key={c.id}
              className={`row-click ${c.supprime ? 'row-deleted' : ''} ${!c.ouverteAt && !c.supprime ? 'row-new' : ''}`}
              onClick={() => navigate(`/commandes/${c.id}`)}
            >
              <td className="mono">
                {!c.ouverteAt && !c.supprime && <span className="new-dot" title="Commande jamais ouverte">●</span>}
                {c.reference}
              </td>
              <td className="strong">{c.client}</td>
              <td>{c.designation}</td>
              <td>{c.typeMug || '—'}</td>
              <td className="num">{c.quantite}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <select
                  className={`status-select ${STATUT_CLASS[c.statut] || ''}`}
                  value={c.statut}
                  onChange={(e) => onStatutChange(c, e.target.value)}
                >
                  {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
                </select>
              </td>
              <td>{fmtDate(c.dateCommande)}</td>
              <td>{c.dateSortieTexte || fmtDate(c.dateLivraison)}</td>
              <td className="num">{c._count?.fichiers > 0 ? c._count.fichiers : ''}</td>
              <td className="col-action">
                <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/commandes/${c.id}`); }}>Ouvrir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
