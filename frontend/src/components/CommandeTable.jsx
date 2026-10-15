// ─────────────────────────────────────────────────────────────
//  Liste des commandes : tableau triable (ordinateur) ou cartes (mobile).
//  Statut modifiable sur place ; un clic sur la ligne ouvre la fiche.
// ─────────────────────────────────────────────────────────────
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, Paperclip, Package, CalendarClock } from 'lucide-react';
import { StatutSelect, Echeance } from './Statut.jsx';
import Thumb, { imageProduit } from './Thumb.jsx';
import { fmtDate, fmtNumber, echeance } from '../format.js';

// En-tête de colonne triable.
function Th({ label, col, sortBy, sortDir, onSort, className = '' }) {
  const actif = sortBy === col;
  const Icone = actif ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={className} aria-sort={actif ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort${actif ? ' is-active' : ''}`} onClick={() => onSort(col)}>
        {label}<Icone />
      </button>
    </th>
  );
}

const estNouvelle = (c) => !c.ouverteAt && !c.supprime;
const sortie = (c) => c.dateSortieTexte || (c.dateLivraison ? fmtDate(c.dateLivraison) : '—');
// « ASAP » / « URGENT » : la puce d'échéance suffit, inutile de répéter le texte.
const texteSortie = (c) => (echeance(c)?.type === 'asap' ? null : sortie(c));

export default function CommandeTable({ commandes, produitsByNom = {}, sortBy, sortDir, onSort, onStatutChange, compact = false }) {
  const navigate = useNavigate();
  const ouvrir = (c) => navigate(`/commandes/${c.id}`);
  const tri = { sortBy, sortDir, onSort };

  return (
    <div className="orders-list">
      {/* Ordinateur / tablette : tableau */}
      <div className="table-wrap orders-table-wrap">
        <table className={`table orders-table${compact ? ' is-compact' : ''}`}>
          <thead>
            <tr>
              <Th label="Réf." col="reference" className="col-ref" {...tri} />
              <Th label="Client · commande" col="client" className="col-client" {...tri} />
              <Th label="Visuel · produit" col="designation" className="col-produit" {...tri} />
              <Th label="Qté" col="quantite" className="col-qte num" {...tri} />
              <Th label="Statut" col="statut" className="col-statut" {...tri} />
              <Th label="Commandée" col="dateCommande" className="col-date col-cmd" {...tri} />
              <Th label="Sortie" col="dateLivraison" className="col-date" {...tri} />
              <th className="col-files center" aria-label="Fichiers"><Paperclip size={14} /></th>
              <th className="col-go" aria-label="Ouvrir" />
            </tr>
          </thead>
          <tbody>
            {commandes.map((c) => {
              const prod = produitsByNom[c.typeMug];
              return (
                <tr
                  key={c.id}
                  className={`is-clickable${c.supprime ? ' is-deleted' : ''}${estNouvelle(c) ? ' is-new' : ''}`}
                  onClick={() => ouvrir(c)}
                >
                  <td className="col-ref">
                    {/* Vrai lien : accessible au clavier (Tab + Entrée) et ouvrable dans un nouvel onglet. */}
                    <Link to={`/commandes/${c.id}`} className="ref ref-link" onClick={(e) => e.stopPropagation()}>
                      {estNouvelle(c) && <span className="new-dot" title="Commande jamais ouverte" />}
                      {c.reference}
                    </Link>
                  </td>
                  <td className="col-client">
                    <span className="cell-main cell-trunc" title={c.client}>{c.client}</span>
                    <span className="cell-sub cell-trunc" title={c.nom || ''}>
                      {c.supprime ? 'Dans la corbeille' : (c.nom || '—')}
                    </span>
                  </td>
                  <td className="col-produit">
                    <div className="cell-flex">
                      <Thumb src={imageProduit(prod)} alt={c.typeMug || ''} size={34} />
                      <div>
                        <span className="cell-main cell-trunc" title={c.designation}>{c.designation || '—'}</span>
                        <span className="cell-sub cell-trunc">{c.typeMug || 'Type non précisé'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="col-qte num"><span className="qty">{fmtNumber(c.quantite)}</span></td>
                  <td className="col-statut" onClick={(e) => e.stopPropagation()}>
                    <StatutSelect value={c.statut} onChange={(s) => onStatutChange(c, s)} disabled={c.supprime} />
                  </td>
                  <td className="col-date col-cmd muted">{fmtDate(c.dateCommande)}</td>
                  <td className="col-date">
                    <div className="date-cell">
                      {texteSortie(c) && <span>{texteSortie(c)}</span>}
                      <Echeance commande={c} />
                    </div>
                  </td>
                  <td className="col-files center">
                    {c._count?.fichiers > 0 && (
                      <span className="files-count" title={`${c._count.fichiers} fichier(s)`}><Paperclip />{c._count.fichiers}</span>
                    )}
                  </td>
                  <td className="col-go"><span className="go"><ChevronRight /></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile : cartes */}
      <div className="order-cards">
        {commandes.map((c) => {
          const prod = produitsByNom[c.typeMug];
          return (
            <div key={c.id} className={`order-card${estNouvelle(c) ? ' is-new' : ''}`} onClick={() => ouvrir(c)}
                 role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') ouvrir(c); }}>
              <div className="order-card-top">
                <span className="ref">
                  {estNouvelle(c) && <span className="new-dot" />}
                  {c.reference}
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <StatutSelect value={c.statut} onChange={(s) => onStatutChange(c, s)} disabled={c.supprime} />
                </span>
              </div>
              <div>
                <span className="cell-main">{c.client}</span>
                <span className="cell-sub">{[c.nom, c.designation].filter(Boolean).join(' · ')}</span>
              </div>
              <div className="order-card-foot">
                <span className="meta">
                  <span><Thumb src={imageProduit(prod)} alt="" size={22} />{c.typeMug || 'Type non précisé'}</span>
                  <span><Package />{fmtNumber(c.quantite)} mugs</span>
                  {c._count?.fichiers > 0 && <span><Paperclip />{c._count.fichiers}</span>}
                </span>
                <span className="meta">
                  {texteSortie(c) && <span><CalendarClock />{texteSortie(c)}</span>}
                  <Echeance commande={c} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
