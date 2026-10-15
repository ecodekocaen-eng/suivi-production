// ─────────────────────────────────────────────────────────────
//  Tableau de suivi : pipeline des statuts (= filtres), recherche,
//  tri, pagination. Filtres conservés pendant la session (retour depuis
//  une fiche) ; tri, densité et taille de page mémorisés durablement.
//  Raccourcis : « / » recherche, « N » nouvelle commande.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, Rows3, Rows4, Trash, Inbox, SearchX, LoaderCircle, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUTS_EN_COURS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import { fmtNumber, plural } from '../format.js';
import { PageHeader, EmptyState, Segmented, SearchInput, usePageTitle, useStoredState } from '../ui/bits.jsx';
import { useToast } from '../ui/feedback.jsx';
import { StatutIcon } from '../components/Statut.jsx';
import CommandeTable from '../components/CommandeTable.jsx';
import CommandeFormModal from '../components/CommandeFormModal.jsx';
import ChargeEsat from '../components/ChargeEsat.jsx';

const memeSelection = (a, b) => a.length === b.length && a.every((s) => b.includes(s));

const compactParDefaut = () => { try { return localStorage.getItem('table-compact') === '1'; } catch { return false; } };

export default function Dashboard() {
  usePageTitle('Tableau de suivi');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState({ items: [], total: 0, totalPages: 1, counts: {} });
  const [loading, setLoading] = useState(true);
  const [charge, setCharge] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [produitsByNom, setProduitsByNom] = useState({});
  // Incrémenté quand la charge change (statut, nouvelle commande) : l'indicateur se recalcule.
  const [versionCharge, setVersionCharge] = useState(0);
  const majCharge = () => setVersionCharge((v) => v + 1);
  const searchRef = useRef(null);

  const [prefs, setPrefs] = useStoredState('tableau-prefs', {
    sortBy: 'dateCommande', sortDir: 'desc', pageSize: 20, compact: compactParDefaut(),
  });
  const [filters, setFilters] = useStoredState('tableau-filtres', {
    search: '', statuts: STATUTS_EN_COURS, page: 1, inclureSupprimees: false,
  }, 'session');

  // Champ de recherche découplé du filtre : anti-rebond de 350 ms pour ne
  // lancer qu'une requête une fois la frappe terminée (au lieu d'une par touche).
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, setFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filters.search) qs.set('search', filters.search);
    // On envoie le filtre seulement si une partie des statuts est sélectionnée.
    if (filters.statuts.length > 0 && filters.statuts.length < STATUTS.length) {
      qs.set('statut', filters.statuts.join(','));
    }
    qs.set('page', filters.page);
    qs.set('pageSize', prefs.pageSize);
    qs.set('sortBy', prefs.sortBy);
    qs.set('sortDir', prefs.sortDir);
    if (isAdmin && filters.inclureSupprimees) qs.set('inclureSupprimees', 'true');
    try {
      setData(await api.get(`/commandes?${qs.toString()}`));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setCharge(true);
    }
  }, [filters, prefs.pageSize, prefs.sortBy, prefs.sortDir, isAdmin, toast]);

  useEffect(() => { load(); }, [load]);

  // Page mémorisée devenue hors limites (commandes passées à un autre statut…) : retour page 1.
  useEffect(() => {
    if (!loading && data.items.length === 0 && data.total > 0 && filters.page > 1) {
      setFilters((f) => ({ ...f, page: 1 }));
    }
  }, [loading, data.items.length, data.total, filters.page, setFilters]);

  // Catalogue produits : miniatures dans la colonne « Visuel · produit ».
  useEffect(() => {
    api.get('/produits')
      .then((d) => setProduitsByNom(Object.fromEntries(d.produits.map((p) => [p.nom, p]))))
      .catch(() => {});
  }, []);

  // Raccourcis clavier (ignorés pendant la saisie ou si une fenêtre est ouverte).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('has-modal')) return;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowModal(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onSort = (col) => setPrefs((p) => ({
    ...p, sortBy: col, sortDir: p.sortBy === col && p.sortDir === 'asc' ? 'desc' : 'asc',
  }));
  const setPage = (page) => setFilters((f) => ({ ...f, page }));

  // Changement de statut immédiat (affichage optimiste), annulable depuis la notification.
  const onStatutChange = async (commande, statut) => {
    const avant = commande.statut;
    if (statut === avant) return;
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === commande.id ? { ...x, statut, ouverteAt: x.ouverteAt || new Date().toISOString() } : x)) }));
    try {
      await api.patch(`/commandes/${commande.id}/statut`, { statut });
      toast.success(<><strong>{commande.reference}</strong> → {STATUT_LABELS[statut]}</>, {
        action: {
          label: 'Annuler',
          icon: <Undo2 />,
          onClick: async () => {
            try {
              await api.patch(`/commandes/${commande.id}/statut`, { statut: avant });
              toast(`${commande.reference} : statut « ${STATUT_LABELS[avant]} » rétabli`);
            } catch (err) { toast.error(err.message); }
            load();
            majCharge();
          },
        },
      });
    } catch (err) {
      toast.error(err.message);
    }
    load();
    majCharge();
  };

  // Active/désactive un statut dans le filtre (multi-sélection).
  const toggleStatut = (s) => setFilters((f) => {
    const statuts = f.statuts.includes(s) ? f.statuts.filter((x) => x !== s) : [...f.statuts, s];
    return { ...f, statuts, page: 1 };
  });

  const preset = filters.statuts.length === 0 || filters.statuts.length === STATUTS.length
    ? 'tout'
    : memeSelection(filters.statuts, STATUTS_EN_COURS) ? 'en-cours' : null;

  const enCours = useMemo(
    () => STATUTS_EN_COURS.reduce((s, st) => s + (data.counts?.[st] || 0), 0),
    [data.counts],
  );
  const nouvelles = data.items.filter((c) => !c.ouverteAt && !c.supprime).length;
  const debut = data.total === 0 ? 0 : (filters.page - 1) * prefs.pageSize + 1;
  const fin = Math.min(filters.page * prefs.pageSize, data.total);

  const onCreated = (commande) => {
    setShowModal(false);
    load();
    majCharge();
    toast.success(<>Commande <strong>{commande.reference}</strong> créée</>, {
      action: { label: 'Ouvrir', onClick: () => navigate(`/commandes/${commande.id}`) },
    });
  };

  return (
    <>
      <PageHeader
        title="Tableau de suivi"
        subtitle={charge ? `${plural(enCours, 'commande')} en cours de production` : 'Chargement…'}
        actions={(
          <button className="btn btn-primary" onClick={() => setShowModal(true)} title="Nouvelle commande (raccourci : N)">
            <Plus />Nouvelle commande
          </button>
        )}
      />

      {/* Indicateur de charge de l'ESAT : réservé aux administrateurs. */}
      {isAdmin && <ChargeEsat version={versionCharge} />}

      {/* Pipeline des statuts = filtres (cliquer pour afficher / masquer) */}
      <div className="pipeline" role="group" aria-label="Filtrer par statut">
        {STATUTS.map((s) => {
          const on = filters.statuts.includes(s);
          return (
            <button key={s} type="button" className={`pipe ${STATUT_CLASS[s]}${on ? ' is-on' : ''}`}
                    onClick={() => toggleStatut(s)} aria-pressed={on}
                    title={on ? 'Masquer ce statut' : 'Afficher ce statut'}>
              <span className="pipe-top">
                <span className="pipe-icon"><StatutIcon statut={s} /></span>
                <span className="pipe-check"><Check strokeWidth={3} /></span>
              </span>
              <span className="pipe-count">{fmtNumber(data.counts?.[s] ?? 0)}</span>
              <span className="pipe-label">{STATUT_LABELS[s]}</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="toolbar">
          <SearchInput
            inputRef={searchRef}
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Rechercher (réf., client, visuel…)"
            raccourci="/"
          />
          <Segmented
            label="Préréglages de statuts"
            value={preset}
            onChange={(v) => setFilters((f) => ({ ...f, statuts: v === 'tout' ? [] : STATUTS_EN_COURS, page: 1 }))}
            options={[
              { value: 'en-cours', label: 'En cours', title: 'En attente, Impression OK, En cours de prod' },
              { value: 'tout', label: 'Tout', title: 'Tous les statuts' },
            ]}
          />
          <span className="spacer" />
          <span className="toolbar-info">
            {loading && <LoaderCircle className="spin" size={15} />}
            <span><strong>{fmtNumber(data.total)}</strong> commande{data.total > 1 ? 's' : ''}</span>
            {nouvelles > 0 && <span className="badge badge-brand"><span className="new-dot" />{nouvelles} nouvelle{nouvelles > 1 ? 's' : ''}</span>}
          </span>
          {isAdmin && (
            <button type="button" className={`btn btn-sm btn-secondary${filters.inclureSupprimees ? ' is-on' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, inclureSupprimees: !f.inclureSupprimees, page: 1 }))}
                    aria-pressed={filters.inclureSupprimees}
                    title="Afficher aussi les commandes mises à la corbeille">
              <Trash />Corbeille
            </button>
          )}
          <button type="button" className={`btn btn-sm btn-secondary btn-icon btn-densite${prefs.compact ? ' is-on' : ''}`}
                  onClick={() => setPrefs((p) => ({ ...p, compact: !p.compact }))} aria-pressed={prefs.compact}
                  title={prefs.compact ? 'Vue confortable' : 'Vue compacte : plus de lignes à l’écran'}
                  aria-label="Vue compacte">
            {prefs.compact ? <Rows4 /> : <Rows3 />}
          </button>
        </div>

        {charge && data.items.length === 0 ? (
          filters.search ? (
            <EmptyState
              icon={<SearchX />}
              title="Aucun résultat"
              text={<>Aucune commande ne correspond à « {filters.search} » avec les statuts sélectionnés.</>}
              action={<button className="btn btn-secondary btn-sm" onClick={() => setSearchInput('')}>Effacer la recherche</button>}
            />
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="Aucune commande ici"
              text={preset === 'en-cours'
                ? 'Aucune commande en cours : tout est terminé ou expédié.'
                : 'Aucune commande pour les statuts sélectionnés.'}
              action={<button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}><Plus />Nouvelle commande</button>}
            />
          )
        ) : (
          <CommandeTable
            commandes={data.items}
            produitsByNom={produitsByNom}
            sortBy={prefs.sortBy}
            sortDir={prefs.sortDir}
            onSort={onSort}
            onStatutChange={onStatutChange}
            compact={prefs.compact}
          />
        )}

        {data.total > 0 && (
          <div className="pager">
            <span className="tnum">{fmtNumber(debut)}–{fmtNumber(fin)} sur {fmtNumber(data.total)}</span>
            <div className="pager-controls">
              <select value={prefs.pageSize} aria-label="Commandes par page"
                      onChange={(e) => { setPrefs((p) => ({ ...p, pageSize: Number(e.target.value) })); setPage(1); }}>
                {[20, 50, 100].map((n) => <option key={n} value={n}>{n} par page</option>)}
              </select>
              <button className="btn btn-secondary btn-sm btn-icon" disabled={filters.page <= 1}
                      onClick={() => setPage(filters.page - 1)} aria-label="Page précédente"><ChevronLeft /></button>
              <span className="pager-page">Page {filters.page} / {data.totalPages || 1}</span>
              <button className="btn btn-secondary btn-sm btn-icon" disabled={filters.page >= data.totalPages}
                      onClick={() => setPage(filters.page + 1)} aria-label="Page suivante"><ChevronRight /></button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <CommandeFormModal onClose={() => setShowModal(false)} onSaved={onCreated} />
      )}
    </>
  );
}
