// ─────────────────────────────────────────────────────────────
//  Gestion des utilisateurs (réservée ADMIN) + journal d'audit.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtDate, fmtDateTime } from '../format.js';

const emptyForm = { email: '', nom: '', password: '', role: 'OPERATEUR' };

export default function Users() {
  const { user: current } = useAuth();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setUsers((await api.get('/users')).users);
    api.get('/users/logs').then((d) => setLogs(d.logs)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const creer = async (e) => {
    e.preventDefault();
    setError(null); setMsg(null);
    try {
      await api.post('/users', form);
      setForm(emptyForm);
      setMsg('Utilisateur créé.');
      load();
    } catch (err) { setError(err.message); }
  };

  const majUser = async (id, patch) => {
    setError(null);
    try {
      await api.patch(`/users/${id}`, patch);
      load();
    } catch (err) { setError(err.message); }
  };

  const supprimer = async (u) => {
    if (!window.confirm(`Supprimer définitivement le compte « ${u.email} » ? Cette action est irréversible.`)) return;
    setError(null); setMsg(null);
    try {
      await api.del(`/users/${u.id}`);
      setMsg(`Compte « ${u.email} » supprimé.`);
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h1 className="page-title">Utilisateurs</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {msg && <div className="alert alert-info">{msg}</div>}

      <div className="card">
        <h2>Ajouter un utilisateur</h2>
        <form onSubmit={creer} className="user-form">
          <input placeholder="Email" type="email" value={form.email} onChange={set('email')} required />
          <input placeholder="Nom" value={form.nom} onChange={set('nom')} required />
          <input placeholder="Mot de passe (min. 6)" type="text" value={form.password} onChange={set('password')} required />
          <select value={form.role} onChange={set('role')}>
            <option value="OPERATEUR">Opérateur</option>
            <option value="COMPTABLE">Comptable (facturation ESAT)</option>
            <option value="ADMIN">Admin</option>
          </select>
          <button className="btn btn-primary">Créer</button>
        </form>
      </div>

      <div className="card">
        <h2>Comptes ({users.length})</h2>
        <div className="table-wrap">
          <table className="orders">
            <thead>
              <tr><th>Email</th><th>Nom</th><th>Rôle</th><th>Actif</th><th>Créé le</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === current.id;
                return (
                  <tr key={u.id}>
                    <td className="mono">{u.email}</td>
                    <td>{u.nom}</td>
                    <td>
                      <select value={u.role} disabled={isSelf}
                              onChange={(e) => majUser(u.id, { role: e.target.value })}>
                        <option value="OPERATEUR">Opérateur</option>
                        <option value="COMPTABLE">Comptable</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                    <td>{u.actif ? '✅' : '🚫'}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td className="user-actions">
                      {isSelf ? <span className="muted">vous</span> : (
                        <>
                          <button className={`btn btn-sm ${u.actif ? 'btn-danger' : 'btn-primary'}`}
                                  onClick={() => majUser(u.id, { actif: !u.actif })}>
                            {u.actif ? 'Désactiver' : 'Activer'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => supprimer(u)}>Supprimer</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Journal des comptes</h2>
        <p className="muted">Trace des créations, modifications et suppressions de comptes (100 dernières).</p>
        {logs.length === 0 ? <p className="muted">Aucun événement enregistré pour l'instant.</p> : (
          <ul className="history">
            {logs.map((l) => (
              <li key={l.id}>
                <span className="hist-date">{fmtDateTime(l.createdAt)}</span>
                <span className="hist-desc">{l.detail || l.action}</span>
                {l.user && <span className="hist-user">— par {l.user.nom}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
