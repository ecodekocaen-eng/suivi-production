// ─────────────────────────────────────────────────────────────
//  Routage de l'application + protection des routes
// ─────────────────────────────────────────────────────────────
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CommandeDetail from './pages/CommandeDetail.jsx';
import Stats from './pages/Stats.jsx';
import Clients from './pages/Clients.jsx';
import Produits from './pages/Produits.jsx';
import Users from './pages/Users.jsx';

// N'autorise l'accès qu'aux utilisateurs connectés (option adminOnly).
function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

// Barre de navigation + conteneur commun.
function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const onLogout = async () => { await logout(); navigate('/login'); };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">☕ Suivi production <span>ECODEKO</span></Link>
        <nav>
          <Link to="/">Tableau</Link>
          <Link to="/statistiques">Statistiques</Link>
          {user?.role === 'ADMIN' && <Link to="/clients">Clients</Link>}
          {user?.role === 'ADMIN' && <Link to="/produits">Produits</Link>}
          {user?.role === 'ADMIN' && <Link to="/utilisateurs">Utilisateurs</Link>}
          <span className="user">👤 {user?.nom} {user?.role === 'ADMIN' && <em>(admin)</em>}</span>
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
      <Route path="/statistiques" element={<Protected><Stats /></Protected>} />
      <Route path="/clients" element={<Protected adminOnly><Clients /></Protected>} />
      <Route path="/produits" element={<Protected adminOnly><Produits /></Protected>} />
      <Route path="/utilisateurs" element={<Protected adminOnly><Users /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
