// Page de connexion.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, CircleAlert, LoaderCircle } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { usePageTitle } from '../ui/bits.jsx';
import logo from '../assets/logo-ecodeko.png';

export default function Login() {
  usePageTitle('Connexion');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [voir, setVoir] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <form className="card login-card" onSubmit={onSubmit}>
          <img src={logo} alt="ECO'DEKO — Objets et textiles promotionnels" className="login-logo" />
          <h1 className="login-title">Suivi de production</h1>
          <p className="login-sub">Connectez-vous pour accéder au tableau de suivi.</p>

          {error && <div className="alert alert-error" role="alert"><CircleAlert />{error}</div>}

          <label className="field">
            <span className="field-label">Adresse e-mail</span>
            <span className="input-group">
              <Mail />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     autoComplete="username" placeholder="vous@exemple.fr" required autoFocus />
            </span>
          </label>

          <label className="field">
            <span className="field-label">Mot de passe</span>
            <span className="input-group">
              <Lock />
              <input type={voir ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                     autoComplete="current-password" required style={{ paddingRight: '2.75rem' }} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm input-btn"
                      onClick={() => setVoir((v) => !v)}
                      aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      title={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {voir ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </label>

          <button className="btn btn-primary btn-lg btn-block" disabled={busy} style={{ marginTop: '.35rem' }}>
            {busy ? <><LoaderCircle className="spin" />Connexion…</> : 'Se connecter'}
          </button>
        </form>
        <p className="login-foot">ECO'DEKO · Objets et textiles promotionnels</p>
      </div>
    </div>
  );
}
