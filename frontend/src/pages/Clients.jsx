// ─────────────────────────────────────────────────────────────
//  Gestion des clients (ADMIN) : fusion des variantes + nettoyage.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtNumber } from '../format.js';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [selection, setSelection] = useState(new Set());
  const [cible, setCible] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [filtre, setFiltre] = useState('');

  const load = async () => setClients((await api.get('/clients')).clients);
  useEffect(() => { load(); }, []);

  const toggle = (nom) => {
    const s = new Set(selection);
    s.has(nom) ? s.delete(nom) : s.add(nom);
    setSelection(s);
    // Pré-remplit la cible avec le 1er nom sélectionné (le plus fréquent).
    if (!cible && s.size > 0) setCible([...s][0]);
  };

  const fusionner = async () => {
    setError(null); setMsg(null);
    try {
      const { updated } = await api.post('/clients/merge', { from: [...selection], to: cible });
      setMsg(`Fusion effectuée : ${updated} commande(s) réattribuée(s) à « ${cible} ».`);
      setSelection(new Set()); setCible('');
      load();
    } catch (err) { setError(err.message); }
  };

  const nettoyer = async () => {
    setError(null); setMsg(null);
    try {
      const { updated } = await api.post('/clients/normalize');
      setMsg(`Espaces nettoyés sur ${updated} commande(s).`);
      load();
    } catch (err) { setError(err.message); }
  };

  const visibles = clients.filter((c) => c.client.toLowerCase().includes(filtre.toLowerCase()));

  return (
    <>
      <h1 className="page-title">Clients</h1>
      <p className="muted">Fusionnez les variantes d'orthographe (ex : « PUBLI SOUVENIR » et « PUBLI SOUVENIRS »).</p>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-info">{msg}</div>}

      {/* Barre d'action de fusion */}
      <div className="merge-bar">
        <span><strong>{selection.size}</strong> sélectionné(s)</span>
        <span>→ fusionner vers :</span>
        <input list="clients-list" value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Nom canonique" />
        <datalist id="clients-list">
          {clients.map((c) => <option key={c.client} value={c.client} />)}
        </datalist>
        <button className="btn btn-primary btn-sm" disabled={selection.size === 0 || !cible.trim()} onClick={fusionner}>
          Fusionner
        </button>
        <button className="btn btn-ghost btn-sm" disabled={selection.size === 0} onClick={() => { setSelection(new Set()); setCible(''); }}>
          Effacer
        </button>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={nettoyer} title="Supprime espaces superflus partout">
          🧹 Nettoyer les espaces
        </button>
      </div>

      <div className="filters">
        <input type="search" placeholder="Filtrer les clients…" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        <span className="muted">{visibles.length} client(s)</span>
      </div>

      <div className="table-wrap">
        <table className="orders">
          <thead>
            <tr><th></th><th>Client</th><th className="num">Commandes</th><th className="num">Mugs</th></tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.client} className={selection.has(c.client) ? 'row-selected' : ''}>
                <td><input type="checkbox" checked={selection.has(c.client)} onChange={() => toggle(c.client)} /></td>
                <td className="strong">{c.client}</td>
                <td className="num">{fmtNumber(c.commandes)}</td>
                <td className="num">{fmtNumber(c.quantite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
