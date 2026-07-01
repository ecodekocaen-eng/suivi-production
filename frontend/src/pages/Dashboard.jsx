// ─────────────────────────────────────────────────────────────
//  Tableau de bord : indicateurs, filtres, recherche, tri, pagination.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import CommandeTable from '../components/CommandeTable.jsx';
import CommandeFormModal from '../components/CommandeFormModal.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], total: 0, totalPages: 1, counts: {} });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // État des filtres / tri / pagination.
  const [filters, setFilters] = useState({
    search: '', statut: '', page: 1, pageSize: 20,
    sortBy: 'dateCommande', sortDir: 'desc', inclureSupprimees: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.search) qs.set('search', filters.search);
    if (filters.statut) qs.set('statut', filters.statut);
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

  // Tri : clic sur une colonne → bascule asc/desc.
  const onSort = (col) => setFilters((f) => ({
    ...f,
    sortBy: col,
    sortDir: f.sortBy === col && f.sortDir === 'asc' ? 'desc' : 'asc',
    page: 1,
  }));

  // Changement de statut inline (avec confirmation si Expédiée).
  const onStatutChange = async (commande, statut) => {
    if (statut === 'Expédié' && commande.statut !== 'Expédié') {
      const ok = window.confirm(
        'Passer cette commande à « Expédiée » supprimera définitivement tous ses visuels du serveur.\n\nConfirmer ?'
      );
      if (!ok) return;
    }
    await api.patch(`/commandes/${commande.id}/statut`, { statut });
    load();
  };

  const setField = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Tableau de suivi</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle commande</button>
      </div>

      {/* Indicateurs par statut */}
      <div className="stats">
        {STATUTS.map((s) => (
          <button
            key={s}
            className={`stat-card ${STATUT_CLASS[s]} ${filters.statut === s ? 'active' : ''}`}
            onClick={() => setField('statut', filters.statut === s ? '' : s)}
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
          value={filters.search}
          onChange={(e) => setField('search', e.target.value)}
        />
        <select value={filters.statut} onChange={(e) => setField('statut', e.target.value)}>
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
        </select>
        {user?.role === 'ADMIN' && (
          <label className="check">
            <input type="checkbox" checked={filters.inclureSupprimees}
                   onChange={(e) => setField('inclureSupprimees', e.target.checked)} />
            Voir la corbeille
          </label>
        )}
      </div>

      <p className="muted">{data.total} commande(s){loading ? ' — chargement…' : ''}</p>

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
