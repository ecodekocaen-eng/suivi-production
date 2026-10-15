// ─────────────────────────────────────────────────────────────
//  Gestion des utilisateurs (réservée ADMIN) + journal d'audit.
//  Création, rôle, accès facturation, activation, nom, nouveau mot de
//  passe et suppression.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { UserPlus, Pencil, Trash, KeyRound, LoaderCircle, WandSparkles, ScrollText, UserCog, Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_LABELS } from '../constants.js';
import { fmtDate, fmtDateTime, fmtRelative } from '../format.js';
import { PageHeader, Avatar, Switch, Loading, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import Modal from '../ui/Modal.jsx';

const ROLES = [
  { value: 'OPERATEUR', label: 'Opérateur', aide: 'Production : tableau, fiches, réglages, statistiques.' },
  { value: 'COMPTABLE', label: 'Comptable', aide: 'Facturation ESAT uniquement.' },
  { value: 'ADMIN', label: 'Administrateur', aide: 'Tout, y compris prix de vente, clients, produits et comptes.' },
];

// Mot de passe lisible (sans caractères ambigus) pour un nouveau compte.
function genererMotDePasse() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const tab = new Uint32Array(12);
  crypto.getRandomValues(tab);
  return [...tab].map((n) => alphabet[n % alphabet.length]).join('');
}

function ChampMotDePasse({ value, onChange, requis = false, placeholder }) {
  const [voir, setVoir] = useState(false);
  return (
    <span className="input-group">
      <KeyRound />
      <input type={voir ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} required={requis}
             minLength={6} autoComplete="new-password" placeholder={placeholder} style={{ paddingRight: '5.2rem' }} />
      <span className="input-suffix">
        <button type="button" className="btn btn-ghost btn-icon btn-xs" onClick={() => setVoir((v) => !v)}
                title={voir ? 'Masquer' : 'Afficher'} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
          {voir ? <EyeOff /> : <Eye />}
        </button>
        <button type="button" className="btn btn-ghost btn-icon btn-xs" onClick={() => { onChange(genererMotDePasse()); setVoir(true); }}
                title="Générer un mot de passe" aria-label="Générer un mot de passe"><WandSparkles /></button>
      </span>
    </span>
  );
}

function UserModal({ compte = null, onClose, onSaved }) {
  const edition = !!compte;
  const [form, setForm] = useState({ email: '', nom: compte?.nom || '', password: '', role: 'OPERATEUR' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (edition) {
        const patch = { nom: form.nom };
        if (form.password) patch.password = form.password;
        await api.patch(`/users/${compte.id}`, patch);
        onSaved(form.password ? 'Compte modifié — nouveau mot de passe enregistré' : 'Compte modifié');
      } else {
        await api.post('/users', form);
        onSaved(`Compte « ${form.email} » créé`);
      }
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title={edition ? 'Modifier le compte' : 'Nouvel utilisateur'}
      description={edition ? compte.email : 'Le mot de passe est à transmettre à la personne ; elle se connectera avec son e-mail.'}
      icon={edition ? <UserCog /> : <UserPlus />}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle className="spin" />}{edition ? 'Enregistrer' : 'Créer le compte'}</button>
        </>
      )}
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stack">
        {!edition && (
          <label className="field">
            <span className="field-label">E-mail <span className="req">*</span></span>
            <input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required placeholder="prenom@exemple.fr" />
          </label>
        )}
        <label className="field">
          <span className="field-label">Nom <span className="req">*</span></span>
          <input value={form.nom} onChange={(e) => set('nom')(e.target.value)} required placeholder="Prénom Nom" />
        </label>
        <div className="field">
          <span className="field-label">{edition ? 'Nouveau mot de passe' : <>Mot de passe <span className="req">*</span></>}</span>
          <ChampMotDePasse value={form.password} onChange={set('password')} requis={!edition}
                           placeholder={edition ? 'Laisser vide pour ne pas le changer' : '6 caractères minimum'} />
        </div>
        {!edition && (
          <div className="field">
            <span className="field-label">Rôle</span>
            <div className="stack" style={{ gap: '.4rem' }}>
              {ROLES.map((r) => (
                <label key={r.value} className={`choice${form.role === r.value ? ' is-active' : ''}`}
                       style={{ height: 'auto', padding: '.6rem .8rem', justifyContent: 'flex-start', gap: '.6rem' }}>
                  <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={() => set('role')(r.value)} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '.15rem', textAlign: 'left' }}>
                    <span>{r.label}</span>
                    <span className="field-hint" style={{ fontWeight: 500 }}>{r.aide}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Users() {
  usePageTitle('Utilisateurs');
  const { user: current } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [users, setUsers] = useState(null);
  const [logs, setLogs] = useState([]);
  const [modal, setModal] = useState(null); // { compte } | { nouveau: true }

  const load = async () => {
    setUsers((await api.get('/users')).users);
    api.get('/users/logs').then((d) => setLogs(d.logs)).catch(() => {});
  };
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const majUser = async (u, patch, message) => {
    try {
      await api.patch(`/users/${u.id}`, patch);
      toast.success(message);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const supprimer = async (u) => {
    const ok = await confirmer({
      title: 'Supprimer définitivement ce compte ?',
      message: <>Le compte « {u.email} » sera supprimé. Cette action est irréversible — pour suspendre l’accès, désactivez plutôt le compte.</>,
      confirmLabel: 'Supprimer le compte',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/users/${u.id}`);
      toast.success(`Compte « ${u.email} » supprimé`);
      load();
    } catch (err) { toast.error(err.message); }
  };

  if (!users) return <><PageHeader title="Utilisateurs" /><Loading /></>;

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes d’accès à l’application et leurs droits."
        actions={<button className="btn btn-primary" onClick={() => setModal({ nouveau: true })}><UserPlus />Nouvel utilisateur</button>}
      />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Utilisateur</th><th>Rôle</th><th>Accès facturation</th><th>Actif</th><th>Créé le</th><th className="num" aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === current.id;
                return (
                  <tr key={u.id} className={u.actif ? '' : 'is-muted'}>
                    <td>
                      <div className="user-cell">
                        <Avatar nom={u.nom} />
                        <div style={{ minWidth: 0 }}>
                          <span className="cell-main">{u.nom}{isSelf && <span className="you-tag">vous</span>}</span>
                          <span className="cell-sub">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select className="role-select" value={u.role} disabled={isSelf} aria-label={`Rôle de ${u.nom}`}
                              title={isSelf ? 'Vous ne pouvez pas modifier votre propre rôle' : undefined}
                              onChange={(e) => majUser(u, { role: e.target.value }, `${u.nom} : rôle « ${ROLE_LABELS[e.target.value]} »`)}>
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td>
                      {u.role === 'ADMIN' || u.role === 'COMPTABLE'
                        ? <span className="badge" title="Accès inclus dans le rôle">Inclus</span>
                        : <Switch checked={u.accesFacturation} title="Donner / retirer l'accès au module facturation"
                                  onChange={(v) => majUser(u, { accesFacturation: v }, v ? `Accès facturation donné à ${u.nom}` : `Accès facturation retiré à ${u.nom}`)} />}
                    </td>
                    <td>
                      <Switch checked={u.actif} disabled={isSelf}
                              title={isSelf ? 'Vous ne pouvez pas désactiver votre propre compte' : (u.actif ? 'Désactiver le compte' : 'Activer le compte')}
                              onChange={(v) => majUser(u, { actif: v }, v ? `Compte de ${u.nom} activé` : `Compte de ${u.nom} désactivé`)} />
                    </td>
                    <td className="muted nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="num nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ compte: u })}><Pencil />Modifier</button>
                      {!isSelf && (
                        <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => supprimer(u)}
                                title="Supprimer le compte" aria-label={`Supprimer le compte de ${u.nom}`}><Trash /></button>
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
        <div className="card-header">
          <h2 className="card-title"><ScrollText />Journal des comptes</h2>
          <span className="card-subtitle">Créations, modifications et suppressions (100 dernières)</span>
        </div>
        <div className="card-body">
          {logs.length === 0 ? <p className="muted small">Aucun événement enregistré pour l’instant.</p> : (
            <ul className="timeline">
              {logs.map((l) => (
                <li key={l.id} className="timeline-item">
                  <span className={`timeline-dot${l.action === 'USER_SUPPRIME' ? ' is-danger' : l.action === 'USER_CREE' ? ' is-status' : ''}`}>
                    {l.action === 'USER_SUPPRIME' ? <Trash /> : l.action === 'USER_CREE' ? <UserPlus /> : <Pencil />}
                  </span>
                  <div className="timeline-text">
                    <div className="timeline-desc">{l.detail || l.action}</div>
                    <div className="timeline-meta" title={fmtDateTime(l.createdAt)}>{fmtRelative(l.createdAt)}{l.user && ` · par ${l.user.nom}`}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modal && (
        <UserModal
          compte={modal.compte || null}
          onClose={() => setModal(null)}
          onSaved={(message) => { setModal(null); toast.success(message); load(); }}
        />
      )}
    </>
  );
}
