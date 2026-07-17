// ─────────────────────────────────────────────────────────────
//  Tableau de bord : indicateurs (= filtres multi-statuts), recherche,
//  tri, pagination.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import CommandeTable from '../components/CommandeTable.jsx';
import CommandeFormModal from '../components/CommandeFormModal.jsx';

// Statuts affichés par défaut (les commandes « en cours »).
const DEFAUT_STATUTS = ['En attente', 'Impression OK', 'En cours de prod'];

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1, counts: {} });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [filters, setFilters] = useState({
    search: '', statuts: DEFAUT_STATUTS, page: 1, pageSize: 20,
    sortBy: 'dateCommande', sortDir: 'desc', inclureSupprimees: false,
  });

  // Champ de recherche découplé du filtre : anti-rebond de 350 ms pour ne
  // lancer qu'une requête une fois la frappe terminée (au lieu d'une par touche).
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.search) qs.set('search', filters.search);
    // On envoie le filtre seulement si une partie des statuts est sélectionnée.
    if (filters.statuts.length > 0 && filters.statuts.length < STATUTS.length) {
      qs.set('statut', filters.statuts.join(','));
    }
    qs.set('page', filters.page);
    qs.set('pageSize', filters.pageSize);
    qs.set('sortBy', filters.sortBy);
    qs.set('sortDir', filters.sortDir);
    if (filters.inclureSupprimees) qs.set('inclureSupprimees', 'true');
    try {
      setData(await api.get(`/commandes?${qs.toString()}`));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const onSort = (col) => setFilters((f) => ({
    ...f,
    sortBy: col,
    sortDir: f.sortBy === col && f.sortDir === 'asc' ? 'desc' : 'asc',
    page: 1,
  }));

  const onStatutChange = async (commande, statut) => {
    await api.patch(`/commandes/${commande.id}/statut`, { statut });
    load();
  };

  const setField = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  // Active/désactive un statut dans le filtre (multi-sélection).
  const toggleStatut = (s) => setFilters((f) => {
    const statuts = f.statuts.includes(s) ? f.statuts.filter((x) => x !== s) : [...f.statuts, s];
    return { ...f, statuts, page: 1 };
  });

  const tousAffiches = filters.statuts.length === 0 || filters.statuts.length === STATUTS.length;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Tableau de suivi</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle commande</button>
      </div>

      {/* Indicateurs = filtres multi-statuts (cliquez pour afficher/masquer) */}
      <div className="stats">
        {STATUTS.map((s) => (
          <button
            key={s}
            className={`stat-card ${STATUT_CLASS[s]} ${filters.statuts.includes(s) ? 'active' : ''}`}
            onClick={() => toggleStatut(s)}
            title="Cliquer pour afficher / masquer ce statut"
          >
            <span className="stat-num">{data.counts?.[s] ?? 0}</span>
            <span className="stat-label">{STATUT_LABELS[s]}</span>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="filters">
        <input
          type="search" placeholder="Rechercher (référence, client, désignation…)"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <span className="filter-presets">
          <button className="btn btn-ghost btn-sm" onClick={() => setField('statuts', DEFAUT_STATUTS)}>Actifs</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setField('statuts', [])}>Tout</button>
        </span>
        {user?.role === 'ADMIN' && (
          <label className="check">
            <input type="checkbox" checked={filters.inclureSupprimees}
                   onChange={(e) => setField('inclureSupprimees', e.target.checked)} />
            Voir la corbeille
          </label>
        )}
      </div>

      <p className="muted">
        {data.total} commande(s){loading ? ' — chargement…' : ''}
        {!tousAffiches && ` · filtre : ${filters.statuts.map((s) => STATUT_LABELS[s]).join(', ')}`}
        {data.items.some((c) => !c.ouverteAt && !c.supprime) && (
          <span> · <span className="new-dot">●</span> jamais ouverte</span>
        )}
      </p>

      <CommandeTable
        commandes={data.items}
        sortBy={filters.sortBy}
        sortDir={filters.sortDir}
        onSort={onSort}
        onStatutChange={onStatutChange}
      />

      {/* Pagination */}
      <div className="pagination">
        <button className="btn btn-ghost btn-sm" disabled={filters.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Précédent</button>
        <span className="muted">Page {filters.page} / {data.totalPages || 1}</span>
        <button className="btn btn-ghost btn-sm" disabled={filters.page >= data.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Suivant →</button>
        <select value={filters.pageSize} onChange={(e) => setField('pageSize', Number(e.target.value))}>
          {[20, 50, 100].map((n) => <option key={n} value={n}>{n}/page</option>)}
        </select>
      </div>

      {showModal && (
        <CommandeFormModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); load(); }}
        />
      )}
    </>
  );
}
