// ─────────────────────────────────────────────────────────────
//  Facturation ESAT (rôles ADMIN et COMPTABLE).
//  Sélection manuelle des commandes à facturer → création d'un relevé
//  (imprimable + CSV). Historique des relevés + apurement de l'historique.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, FileStack, TriangleAlert, CheckCheck, X, ChevronRight, Trash, Inbox, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { STATUTS, STATUT_LABELS } from '../constants.js';
import { fmtDate, fmtEuro, fmtNumber, plural } from '../format.js';
import { PageHeader, EmptyState, SearchInput, Loading, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import { StatutBadge } from '../components/Statut.jsx';

export default function Facturation() {
  usePageTitle('Facturation ESAT');
  const navigate = useNavigate();
  const toast = useToast();
  const confirmer = useConfirm();
  const [onglet, setOnglet] = useState('a-facturer');
  const [commandes, setCommandes] = useState(null);
  const [releves, setReleves] = useState([]);
  const [selection, setSelection] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [statutF, setStatutF] = useState('');
  const [libelle, setLibelle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [c, r] = await Promise.all([
      api.get('/facturation/commandes'),
      api.get('/facturation/releves'),
    ]);
    setCommandes(c.commandes);
    setReleves(r.releves);
    setSelection(new Set());
  };
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtrage côté client (recherche + statut).
  const filtrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (commandes || []).filter((c) => {
      if (statutF && c.statut !== statutF) return false;
      if (!q) return true;
      return [c.reference, c.client, c.designation].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [commandes, search, statutF]);

  const toggle = (id) => setSelection((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toutesFiltreesCochees = filtrees.length > 0 && filtrees.every((c) => selection.has(c.id));
  const certainesCochees = filtrees.some((c) => selection.has(c.id));
  const toggleToutes = () => setSelection((s) => {
    const n = new Set(s);
    if (toutesFiltreesCochees) filtrees.forEach((c) => n.delete(c.id));
    else filtrees.forEach((c) => n.add(c.id));
    return n;
  });

  // Récapitulatif de la sélection.
  const sel = useMemo(() => {
    const rows = (commandes || []).filter((c) => selection.has(c.id));
    return {
      n: rows.length,
      mugs: rows.reduce((s, c) => s + (c.quantite || 0), 0),
      total: Math.round(rows.reduce((s, c) => s + (c.montant || 0), 0) * 100) / 100,
      sansPrix: rows.filter((c) => c.prixEsat == null).length,
    };
  }, [commandes, selection]);

  const creerReleve = async () => {
    if (sel.n === 0) return;
    if (sel.sansPrix > 0 && !(await confirmer({
      title: 'Créer le relevé malgré tout ?',
      message: `${plural(sel.sansPrix, 'commande sélectionnée n’a', 'commandes sélectionnées n’ont')} pas de prix ESAT : elles seront comptées à 0 €.`,
      confirmLabel: 'Créer le relevé',
    }))) return;
    setBusy(true);
    try {
      const d = await api.post('/facturation/releves', { commandeIds: [...selection], libelle });
      toast.success(`Relevé ${d.releve.numero} créé`);
      navigate(`/facturation/releves/${d.releve.id}`);
    } catch (e) { toast.error(e.message); setBusy(false); }
  };

  const exclure = async () => {
    if (sel.n === 0) return;
    const ok = await confirmer({
      title: `Marquer ${plural(sel.n, 'commande')} comme déjà facturée${sel.n > 1 ? 's' : ''} ?`,
      message: 'Aucun relevé ne sera créé. À utiliser pour l’historique facturé avant la mise en place du module.',
      confirmLabel: 'Marquer déjà facturé',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = await api.post('/facturation/exclure', { commandeIds: [...selection] });
      toast.success(`${plural(d.count, 'commande')} marquée${d.count > 1 ? 's' : ''} comme déjà facturée${d.count > 1 ? 's' : ''}`);
      await load();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const annulerReleve = async (r) => {
    const ok = await confirmer({
      title: `Annuler le relevé ${r.numero} ?`,
      message: 'Ses commandes redeviendront « à facturer ».',
      confirmLabel: 'Annuler le relevé',
      cancelLabel: 'Garder',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/facturation/releves/${r.id}`);
      toast.success(`Relevé ${r.numero} annulé`);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  if (!commandes) {
    return (
      <>
        <PageHeader title="Facturation ESAT" />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Facturation ESAT"
        subtitle="Cochez les commandes produites puis créez un relevé : il fige les montants (quantité × prix ESAT) et sert de base à la facture de l’ESAT."
      />

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={onglet === 'a-facturer'}
                className={`tab${onglet === 'a-facturer' ? ' is-active' : ''}`} onClick={() => setOnglet('a-facturer')}>
          <Receipt />À facturer <span className="tab-count">{commandes.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={onglet === 'releves'}
                className={`tab${onglet === 'releves' ? ' is-active' : ''}`} onClick={() => setOnglet('releves')}>
          <FileStack />Relevés <span className="tab-count">{releves.length}</span>
        </button>
      </div>

      {onglet === 'a-facturer' ? (
        <>
          <div className="card">
            <div className="toolbar">
              <SearchInput value={search} onChange={setSearch} placeholder="Rechercher (réf., client, visuel…)" />
              <select value={statutF} onChange={(e) => setStatutF(e.target.value)} style={{ width: 'auto', height: 38 }} aria-label="Filtrer par statut">
                <option value="">Tous les statuts</option>
                {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
              </select>
              <span className="spacer" />
              <span className="toolbar-info">
                {filtrees.length !== commandes.length
                  ? <span><strong>{filtrees.length}</strong> / {commandes.length} commandes</span>
                  : <span><strong>{commandes.length}</strong> commande{commandes.length > 1 ? 's' : ''} à facturer</span>}
              </span>
            </div>

            {filtrees.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title={commandes.length === 0 ? 'Tout est facturé' : 'Aucun résultat'}
                text={commandes.length === 0 ? 'Aucune commande n’attend de facturation.' : 'Aucune commande ne correspond à ces filtres.'}
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input type="checkbox" checked={toutesFiltreesCochees} onChange={toggleToutes}
                               ref={(el) => { if (el) el.indeterminate = certainesCochees && !toutesFiltreesCochees; }}
                               aria-label="Tout cocher / décocher (lignes filtrées)" />
                      </th>
                      <th>Réf.</th>
                      <th>Client · visuel</th>
                      <th className="num">Qté</th>
                      <th className="num">Prix ESAT</th>
                      <th className="num">Montant</th>
                      <th>Statut</th>
                      <th>Commandée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrees.map((c) => (
                      <tr key={c.id} className={`is-clickable${selection.has(c.id) ? ' is-selected' : ''}`} onClick={() => toggle(c.id)}>
                        <td className="col-check" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selection.has(c.id)} onChange={() => toggle(c.id)}
                                 aria-label={`Sélectionner ${c.reference}`} />
                        </td>
                        <td><span className="ref">{c.reference}</span></td>
                        <td>
                          <span className="cell-main">{c.client}</span>
                          <span className="cell-sub">{c.designation}</span>
                        </td>
                        <td className="num tnum">{fmtNumber(c.quantite)}</td>
                        <td className="num tnum">
                          {c.prixEsat != null ? fmtEuro(c.prixEsat) : <span className="badge badge-warning" title="Sans prix ESAT : compté à 0 €"><TriangleAlert />aucun</span>}
                        </td>
                        <td className="num tnum strong">{fmtEuro(c.montant)}</td>
                        <td><StatutBadge statut={c.statut} /></td>
                        <td className="muted nowrap">{fmtDate(c.dateCommande)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Barre de sélection flottante */}
          {sel.n > 0 && (
            <div className="selection-bar" role="region" aria-label="Sélection">
              <div className="sel-stats">
                <span><strong>{sel.n}</strong> commande{sel.n > 1 ? 's' : ''}</span>
                <span><strong>{fmtNumber(sel.mugs)}</strong> mugs</span>
                <span className="sel-total">{fmtEuro(sel.total)}</span>
                {sel.sansPrix > 0 && <span className="sel-warn"><TriangleAlert />{sel.sansPrix} sans prix ESAT</span>}
              </div>
              <div className="sel-actions">
                <input placeholder="Libellé du relevé (ex : Juin 2026)" value={libelle}
                       onChange={(e) => setLibelle(e.target.value)} aria-label="Libellé du relevé" />
                <button className="btn btn-primary" onClick={creerReleve} disabled={busy}>
                  {busy ? <LoaderCircle className="spin" /> : <Receipt />}Créer le relevé
                </button>
                <button className="btn btn-secondary" onClick={exclure} disabled={busy}
                        title="Pour l'historique déjà facturé avant l'application">
                  <CheckCheck />Déjà facturé
                </button>
                <button className="btn btn-ghost btn-icon" onClick={() => setSelection(new Set())}
                        title="Vider la sélection" aria-label="Vider la sélection"><X /></button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          {releves.length === 0 ? (
            <EmptyState icon={<FileStack />} title="Aucun relevé pour l’instant"
                        text="Les relevés créés depuis l’onglet « À facturer » apparaîtront ici." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Numéro</th><th>Libellé</th><th className="num">Commandes</th><th className="num">Total</th>
                    <th>Établi le</th><th>Par</th><th className="num" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {releves.map((r) => (
                    <tr key={r.id} className="is-clickable" onClick={() => navigate(`/facturation/releves/${r.id}`)}>
                      <td><span className="ref">{r.numero}</span></td>
                      <td>{r.libelle || <span className="muted">—</span>}</td>
                      <td className="num tnum">{r._count?.commandes ?? '—'}</td>
                      <td className="num tnum strong">{fmtEuro(r.total)}</td>
                      <td className="nowrap">{fmtDate(r.createdAt)}</td>
                      <td>{r.creePar?.nom || '—'}</td>
                      <td className="num nowrap" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-danger-ghost btn-sm" onClick={() => annulerReleve(r)}><Trash />Annuler</button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/facturation/releves/${r.id}`)}
                                aria-label={`Ouvrir ${r.numero}`}><ChevronRight /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
