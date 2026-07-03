// ─────────────────────────────────────────────────────────────
//  Facturation ESAT (rôles ADMIN et COMPTABLE).
//  Sélection manuelle des commandes à facturer → création d'un relevé
//  (imprimable + CSV). Historique des relevés + apurement de l'historique.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { STATUTS, STATUT_LABELS } from '../constants.js';
import { fmtDate, fmtEuro, fmtNumber } from '../format.js';

export default function Facturation() {
  const navigate = useNavigate();
  const [commandes, setCommandes] = useState([]);
  const [releves, setReleves] = useState([]);
  const [selection, setSelection] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [statutF, setStatutF] = useState('');
  const [libelle, setLibelle] = useState('');
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
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
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  // Filtrage côté client (recherche + statut).
  const filtrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return commandes.filter((c) => {
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
  const toggleToutes = () => setSelection((s) => {
    const n = new Set(s);
    if (toutesFiltreesCochees) filtrees.forEach((c) => n.delete(c.id));
    else filtrees.forEach((c) => n.add(c.id));
    return n;
  });

  // Récapitulatif de la sélection.
  const sel = useMemo(() => {
    const rows = commandes.filter((c) => selection.has(c.id));
    return {
      n: rows.length,
      mugs: rows.reduce((s, c) => s + (c.quantite || 0), 0),
      total: Math.round(rows.reduce((s, c) => s + (c.montant || 0), 0) * 100) / 100,
      sansPrix: rows.filter((c) => c.prixEsat == null).length,
    };
  }, [commandes, selection]);

  const creerReleve = async () => {
    if (sel.n === 0) return;
    if (sel.sansPrix > 0 && !window.confirm(
      `${sel.sansPrix} commande(s) sélectionnée(s) n'ont pas de prix ESAT (comptées à 0 €). Créer le relevé quand même ?`)) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const d = await api.post('/facturation/releves', { commandeIds: [...selection], libelle });
      navigate(`/facturation/releves/${d.releve.id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const exclure = async () => {
    if (sel.n === 0) return;
    if (!window.confirm(
      `Marquer ${sel.n} commande(s) comme DÉJÀ facturée(s), sans créer de relevé ?\n` +
      'À utiliser pour l\'historique facturé avant la mise en place du module.')) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      const d = await api.post('/facturation/exclure', { commandeIds: [...selection] });
      setMsg(`${d.count} commande(s) marquée(s) comme déjà facturée(s).`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const annulerReleve = async (r) => {
    if (!window.confirm(`Annuler le relevé ${r.numero} ? Ses commandes redeviendront « à facturer ».`)) return;
    setError(null); setMsg(null);
    try {
      await api.del(`/facturation/releves/${r.id}`);
      setMsg(`Relevé ${r.numero} annulé.`);
      await load();
    } catch (e) { setError(e.message); }
  };

  return (
    <>
      <h1 className="page-title">Facturation ESAT</h1>
      <p className="muted">
        Cochez les commandes produites, puis créez un relevé : il fige les montants
        (quantité × prix ESAT) et sert de base à la facture de l'ESAT. Une commande
        facturée ne réapparaît plus dans la liste.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-info">{msg}</div>}

      {/* Barre de sélection */}
      <div className="card factu-bar">
        <div className="factu-recap">
          <span><strong>{sel.n}</strong> commande(s)</span>
          <span><strong>{fmtNumber(sel.mugs)}</strong> mugs</span>
          <span className="factu-total"><strong>{fmtEuro(sel.total)}</strong></span>
          {sel.sansPrix > 0 && <span className="factu-warn">⚠ {sel.sansPrix} sans prix ESAT</span>}
        </div>
        <div className="factu-actions">
          <input placeholder="Libellé du relevé (ex : Juin 2026)" value={libelle}
                 onChange={(e) => setLibelle(e.target.value)} />
          <button className="btn btn-primary" onClick={creerReleve} disabled={busy || sel.n === 0}>
            Créer le relevé
          </button>
          <button className="btn btn-ghost" onClick={exclure} disabled={busy || sel.n === 0}
                  title="Pour l'historique déjà facturé avant l'application">
            Déjà facturé (sans relevé)
          </button>
        </div>
      </div>

      {/* Commandes à facturer */}
      <div className="card">
        <div className="card-head">
          <h2>À facturer ({filtrees.length}{filtrees.length !== commandes.length ? ` / ${commandes.length}` : ''})</h2>
          <div className="factu-filtres">
            <input type="search" placeholder="Rechercher (réf, client, visuel…)" value={search}
                   onChange={(e) => setSearch(e.target.value)} />
            <select value={statutF} onChange={(e) => setStatutF(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="orders">
            <thead>
              <tr>
                <th><input type="checkbox" checked={toutesFiltreesCochees} onChange={toggleToutes}
                           title="Tout cocher / décocher (lignes filtrées)" /></th>
                <th>Référence</th>
                <th>Client</th>
                <th>Désignation</th>
                <th className="num">Qté</th>
                <th className="num">Prix ESAT</th>
                <th className="num">Montant</th>
                <th>Statut</th>
                <th>Commande</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 && (
                <tr><td colSpan="9" className="empty-cell">Aucune commande à facturer.</td></tr>
              )}
              {filtrees.map((c) => (
                <tr key={c.id} className={selection.has(c.id) ? 'row-selected' : ''}
                    onClick={() => toggle(c.id)} style={{ cursor: 'pointer' }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selection.has(c.id)} onChange={() => toggle(c.id)} />
                  </td>
                  <td className="mono">{c.reference}</td>
                  <td className="strong">{c.client}</td>
                  <td>{c.designation}</td>
                  <td className="num">{fmtNumber(c.quantite)}</td>
                  <td className="num">{c.prixEsat != null ? fmtEuro(c.prixEsat) : <span className="factu-warn">—</span>}</td>
                  <td className="num strong">{fmtEuro(c.montant)}</td>
                  <td>{STATUT_LABELS[c.statut] || c.statut}</td>
                  <td>{fmtDate(c.dateCommande)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historique des relevés */}
      <div className="card">
        <h2>Relevés ({releves.length})</h2>
        {releves.length === 0 ? <p className="muted">Aucun relevé pour l'instant.</p> : (
          <div className="table-wrap">
            <table className="orders">
              <thead>
                <tr><th>Numéro</th><th>Libellé</th><th className="num">Commandes</th><th className="num">Total</th><th>Établi le</th><th>Par</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {releves.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.numero}</td>
                    <td>{r.libelle || '—'}</td>
                    <td className="num">{r._count?.commandes ?? '—'}</td>
                    <td className="num strong">{fmtEuro(r.total)}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td>{r.creePar?.nom || '—'}</td>
                    <td className="user-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/facturation/releves/${r.id}`)}>Ouvrir</button>
                      <button className="btn btn-danger btn-xs" onClick={() => annulerReleve(r)}>Annuler</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
