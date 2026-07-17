// ─────────────────────────────────────────────────────────────
//  Bibliothèque des réglages de production par visuel.
//  Recherche + création/modification (clé = visuel) + suppression.
//  Accessible et modifiable par tout utilisateur connecté.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { fmtDate, fmtTemps } from '../format.js';

const emptyForm = { visuel: '', temperature: '', tempsSecondes: '', note: '' };

export default function Reglages() {
  const [reglages, setReglages] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  // Anti-rebond : la recherche (qui interroge la base) n'est lancée que
  // 350 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    setReglages((await api.get(`/reglages${qs}`)).reglages);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const enregistrer = async (e) => {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      await api.post('/reglages', form);
      setMsg(`Réglage « ${form.visuel.trim()} » enregistré.`);
      setForm(emptyForm);
      load();
    } catch (err) { setError(err.message); }
  };

  const modifier = (r) => {
    setForm({
      visuel: r.visuel,
      temperature: r.temperature ?? '',
      tempsSecondes: r.tempsSecondes ?? '',
      note: r.note ?? '',
    });
    setMsg(null); setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const supprimer = async (r) => {
    if (!window.confirm(`Supprimer le réglage du visuel « ${r.visuel} » ?`)) return;
    await api.del(`/reglages/${r.id}`);
    load();
  };

  return (
    <>
      <h1 className="page-title">Réglages de production</h1>
      <p className="muted">
        Température et temps de presse par visuel. Renseignés une fois, ils sont
        retrouvés automatiquement sur chaque nouvelle commande du même visuel.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-info">{msg}</div>}

      <div className="card">
        <h2>{form.visuel && reglages.some((r) => r.visuel === form.visuel) ? 'Modifier le réglage' : 'Ajouter / modifier un réglage'}</h2>
        <form onSubmit={enregistrer} className="reglage-form">
          <label className="reglage-form-visuel">Visuel *
            <input value={form.visuel} onChange={set('visuel')} placeholder="Logo Mairie de Caen" required />
          </label>
          <label>Température (°C)
            <input type="number" value={form.temperature} onChange={set('temperature')} placeholder="200" />
          </label>
          <label>Temps de presse (s)
            <input type="number" value={form.tempsSecondes} onChange={set('tempsSecondes')} placeholder="60" />
          </label>
          <label className="reglage-form-note">Note
            <input value={form.note} onChange={set('note')} placeholder="astuce, pression, sens de pose…" />
          </label>
          <div className="reglage-form-actions">
            <button className="btn btn-primary">Enregistrer</button>
            {form.visuel && <button type="button" className="btn btn-ghost" onClick={() => setForm(emptyForm)}>Vider</button>}
          </div>
        </form>
        <p className="hint">Astuce : saisir un visuel déjà présent met à jour son réglage.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Bibliothèque ({reglages.length})</h2>
          <input type="search" placeholder="Rechercher un visuel…" value={searchInput}
                 onChange={(e) => setSearchInput(e.target.value)} style={{ maxWidth: 260 }} />
        </div>
        <div className="table-wrap no-clip">
          <table className="orders">
            <thead>
              <tr>
                <th>Visuel</th>
                <th className="num">Température</th>
                <th className="num">Temps de presse</th>
                <th>Note</th>
                <th>Dernière utilisation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reglages.length === 0 && (
                <tr><td colSpan="6" className="empty-cell">Aucun réglage enregistré.</td></tr>
              )}
              {reglages.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.visuel}</td>
                  <td className="num">{r.temperature != null ? `${r.temperature} °C` : '—'}</td>
                  <td className="num">{fmtTemps(r.tempsSecondes)}</td>
                  <td>{r.note || '—'}</td>
                  <td>{r.derniere
                    ? <span className="muted"><span className="mono">{r.derniere.reference}</span> · {fmtDate(r.derniere.date)}</span>
                    : <span className="muted">—</span>}</td>
                  <td className="produit-actions">
                    <button className="btn btn-ghost btn-xs" onClick={() => modifier(r)}>Modifier</button>
                    <button className="btn btn-danger btn-xs" onClick={() => supprimer(r)}>Suppr.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
