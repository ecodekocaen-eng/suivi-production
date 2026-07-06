// ─────────────────────────────────────────────────────────────
//  Routage de l'application + protection des routes par rôle.
//  Le rôle COMPTABLE (comptable de l'ESAT) n'accède qu'à la facturation.
// ─────────────────────────────────────────────────────────────
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CommandeDetail from './pages/CommandeDetail.jsx';
import Stats from './pages/Stats.jsx';
import Clients from './pages/Clients.jsx';
import Produits from './pages/Produits.jsx';
import Reglages from './pages/Reglages.jsx';
import Facturation from './pages/Facturation.jsx';
import ReleveDetail from './pages/ReleveDetail.jsx';
import Users from './pages/Users.jsx';

// Page d'accueil selon le rôle.
const homeFor = (user) => (user?.role === 'COMPTABLE' ? '/facturation' : '/');

// Accès au module facturation : ADMIN, COMPTABLE, ou option par compte.
const peutFacturer = (user) =>
  user?.role === 'ADMIN' || user?.role === 'COMPTABLE' || user?.accesFacturation;

// N'autorise l'accès qu'aux rôles listés (par défaut : rôles de production),
// ou selon un prédicat `allow` (prioritaire s'il est fourni).
function Protected({ children, roles = ['ADMIN', 'OPERATEUR'], allow = null }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const autorise = allow ? allow(user) : roles.includes(user.role);
  if (!autorise) return <Navigate to={homeFor(user)} replace />;
  return <Layout>{children}</Layout>;
}

// Barre de navigation + conteneur commun.
function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const onLogout = async () => { await logout(); navigate('/login'); };
  const isAdmin = user?.role === 'ADMIN';
  const isComptable = user?.role === 'COMPTABLE';

  return (
    <>
      <header className="topbar">
        <Link to={homeFor(user)} className="brand">☕ Suivi production <span>ECODEKO</span></Link>
        <nav>
          {!isComptable && <Link to="/">Tableau</Link>}
          {!isComptable && <Link to="/reglages">Réglages</Link>}
          {!isComptable && <Link to="/statistiques">Statistiques</Link>}
          {peutFacturer(user) && <Link to="/facturation">Facturation</Link>}
          {isAdmin && <Link to="/clients">Clients</Link>}
          {isAdmin && <Link to="/produits">Produits</Link>}
          {isAdmin && <Link to="/utilisateurs">Utilisateurs</Link>}
          <span className="user">👤 {user?.nom} {isAdmin && <em>(admin)</em>}{isComptable && <em>(comptable)</em>}</span>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}>Déconnexion</button>
        </nav>
      </header>
      <main className="container">{children}</main>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/commandes/:id" element={<Protected><CommandeDetail /></Protected>} />
      <Route path="/reglages" element={<Protected><Reglages /></Protected>} />
      <Route path="/statistiques" element={<Protected><Stats /></Protected>} />
      <Route path="/facturation" element={<Protected allow={peutFacturer}><Facturation /></Protected>} />
      <Route path="/facturation/releves/:id" element={<Protected allow={peutFacturer}><ReleveDetail /></Protected>} />
      <Route path="/clients" element={<Protected roles={['ADMIN']}><Clients /></Protected>} />
      <Route path="/produits" element={<Protected roles={['ADMIN']}><Produits /></Protected>} />
      <Route path="/utilisateurs" element={<Protected roles={['ADMIN']}><Users /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
