// ─────────────────────────────────────────────────────────────
//  Gestion du catalogue produits (types de mug) — réservé ADMIN.
//  Nom + prix d'achat + miniature.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Thumb from '../components/Thumb.jsx';

const emptyForm = { nom: '', prixAchat: '', image: null };

export default function Produits() {
  const [produits, setProduits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const load = async () => setProduits((await api.get('/produits')).produits);
  useEffect(() => { load(); }, []);

  const creer = async (e) => {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      await api.multipart('POST', '/produits', { nom: form.nom, prixAchat: form.prixAchat }, form.image);
      setForm(emptyForm);
      if (fileRef.current) fileRef.current.value = '';
      setMsg('Produit créé.');
      load();
    } catch (err) { setError(err.message); }
  };

  const maj = async (id, fields, file = null) => {
    setError(null);
    try {
      await api.multipart('PATCH', `/produits/${id}`, fields, file);
      load();
    } catch (err) { setError(err.message); }
  };

  const supprimer = async (p) => {
    if (!window.confirm(`Supprimer le produit « ${p.nom} » ?`)) return;
    await api.del(`/produits/${p.id}`);
    load();
  };

  return (
    <>
      <h1 className="page-title">Produits (types de mug)</h1>
      <p className="muted">Catalogue utilisé pour les lignes de commande : nom, prix d'achat et miniature.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-info">{msg}</div>}

      <div className="card">
        <h2>Ajouter un produit</h2>
        <form onSubmit={creer} className="produit-form">
          <label>Nom *<input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required /></label>
          <label>Prix d'achat (€)
            <input value={form.prixAchat} onChange={(e) => setForm({ ...form, prixAchat: e.target.value })} placeholder="0.45" />
          </label>
          <label>Miniature
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => setForm({ ...form, image: e.target.files[0] || null })} />
          </label>
          <button className="btn btn-primary">Créer</button>
        </form>
      </div>

      <div className="card">
        <h2>Catalogue ({produits.length})</h2>
        <div className="table-wrap no-clip">
          <table className="orders">
            <thead>
              <tr><th>Miniature</th><th>Nom</th><th className="num">Prix d'achat</th><th>Actif</th><th>Compté en mugs</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {produits.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.image
                      ? <Thumb src={`/api/produits/${p.id}/image`} alt={p.nom} size={46} />
                      : <span className="muted">—</span>}
                  </td>
                  <td className="strong">{p.nom}</td>
                  <td className="num">{p.prixAchat != null ? `${p.prixAchat} €` : '—'}</td>
                  <td>{p.actif ? '✅' : '🚫'}</td>
                  <td title={p.compteMugs !== false ? 'Compté dans la quantité de mugs' : 'Accessoire : non compté dans la quantité de mugs'}>
                    {p.compteMugs !== false ? '✅' : '➖ accessoire'}
                  </td>
                  <td className="produit-actions">
                    <label className="btn btn-ghost btn-xs">
                      📷 Photo
                      <input type="file" accept="image/*" hidden
                             onChange={(e) => e.target.files[0] && maj(p.id, {}, e.target.files[0])} />
                    </label>
                    <button className="btn btn-ghost btn-xs"
                            onClick={() => { const v = prompt('Prix d\'achat (€) :', p.prixAchat ?? ''); if (v !== null) maj(p.id, { prixAchat: v }); }}>
                      💶 Prix
                    </button>
                    <button className={`btn btn-xs ${p.actif ? 'btn-ghost' : 'btn-primary'}`}
                            onClick={() => maj(p.id, { actif: !p.actif })}>
                      {p.actif ? 'Désactiver' : 'Activer'}
                    </button>
                    <button className="btn btn-ghost btn-xs"
                            title="Un accessoire (étiquette…) n'est pas compté dans la quantité de mugs de la commande"
                            onClick={() => maj(p.id, { compteMugs: !(p.compteMugs !== false) })}>
                      {p.compteMugs !== false ? '➖ Accessoire' : '☕ Compter en mugs'}
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => supprimer(p)}>Suppr.</button>
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
