// ─────────────────────────────────────────────────────────────
//  Routage de l'application + protection des routes par rôle.
//  Le rôle COMPTABLE (comptable de l'ESAT) n'accède qu'à la facturation.
//  Mise en page : barre latérale (repliable, en tiroir sur mobile).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';

// Vrai quand l'écran correspond à la requête média (suivi des redimensionnements).
function useMedia(requete) {
  const [ok, setOk] = useState(() => window.matchMedia(requete).matches);
  useEffect(() => {
    const mq = window.matchMedia(requete);
    const maj = () => setOk(mq.matches);
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, [requete]);
  return ok;
}
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  ClipboardList, Thermometer, ChartColumn, Receipt, Building, Coffee, UserCog,
  LogOut, PanelLeftClose, PanelLeftOpen, Menu,
} from 'lucide-react';
import { useAuth } from './auth.jsx';
import { ROLE_LABELS } from './constants.js';
import { Avatar, Loading, useStoredState } from './ui/bits.jsx';
import marque from './assets/marque-ecodeko.png';
import mot from './assets/mot-ecodeko.png';
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
function Protected({ children, roles = ['ADMIN', 'OPERATEUR'], allow = null, wide = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  const autorise = allow ? allow(user) : roles.includes(user.role);
  if (!autorise) return <Navigate to={homeFor(user)} replace />;
  return <Layout wide={wide}>{children}</Layout>;
}

// Entrées du menu, groupées par section et filtrées selon le rôle.
function sectionsPour(user) {
  const production = user?.role !== 'COMPTABLE';
  const admin = user?.role === 'ADMIN';
  return [
    {
      titre: 'Production',
      liens: production ? [
        { to: '/', label: 'Tableau de suivi', icon: ClipboardList, actif: (p) => p === '/' || p.startsWith('/commandes') },
        { to: '/reglages', label: 'Réglages presse', icon: Thermometer },
      ] : [],
    },
    {
      titre: 'Pilotage',
      liens: [
        ...(production ? [{ to: '/statistiques', label: 'Statistiques', icon: ChartColumn }] : []),
        ...(peutFacturer(user) ? [{ to: '/facturation', label: 'Facturation ESAT', icon: Receipt }] : []),
      ],
    },
    {
      titre: 'Administration',
      liens: admin ? [
        { to: '/clients', label: 'Clients', icon: Building },
        { to: '/produits', label: 'Produits', icon: Coffee },
        { to: '/utilisateurs', label: 'Utilisateurs', icon: UserCog },
      ] : [],
    },
  ].filter((s) => s.liens.length > 0);
}

// Barre latérale + zone de contenu.
function Layout({ children, wide }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [replieChoisi, setReplie] = useStoredState('menu-replie', false);
  // Écran moyen (portable) : menu replié d'office pour laisser la place au tableau.
  const ecranMoyen = useMedia('(min-width: 1025px) and (max-width: 1280px)');
  const replie = replieChoisi || ecranMoyen;
  const [tiroir, setTiroir] = useState(false);

  // Le tiroir mobile se referme à chaque changement de page.
  useEffect(() => { setTiroir(false); window.scrollTo(0, 0); }, [pathname]);

  const onLogout = async () => { await logout(); navigate('/login'); };
  const accueil = homeFor(user);

  return (
    <div className={`app${replie ? ' is-collapsed' : ''}${tiroir ? ' is-drawer-open' : ''}`}>
      <aside className="sidebar" aria-label="Navigation principale">
        <Link to={accueil} className="sidebar-brand" title="Suivi de production ECO'DEKO">
          <img src={marque} className="brand-mark" alt="" />
          <span className="brand-text">
            <img src={mot} className="brand-word" alt="ECO'DEKO" />
            <span className="brand-sub">Suivi de production</span>
          </span>
        </Link>

        <nav className="sidebar-nav">
          {sectionsPour(user).map((s) => (
            <div className="nav-section" key={s.titre}>
              <div className="nav-section-title">{s.titre}</div>
              {s.liens.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/'}
                  title={replie ? l.label : undefined}
                  className={({ isActive }) => `nav-link${(l.actif ? l.actif(pathname) : isActive) ? ' active' : ''}`}
                >
                  <l.icon />
                  <span className="nav-label">{l.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip" title={`${user?.nom} · ${ROLE_LABELS[user?.role] || ''}`}>
            <Avatar nom={user?.nom} />
            <span className="user-meta">
              <span className="user-name">{user?.nom}</span>
              <span className="user-role">{ROLE_LABELS[user?.role] || user?.role}</span>
            </span>
          </div>
          <div className="sidebar-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout} title="Se déconnecter">
              <LogOut /><span className="btn-label">Déconnexion</span>
            </button>
            {!ecranMoyen && (
              <button type="button" className="btn btn-ghost btn-sm btn-icon sidebar-collapse"
                      onClick={() => setReplie((v) => !v)}
                      title={replie ? 'Déplier le menu' : 'Replier le menu'}
                      aria-label={replie ? 'Déplier le menu' : 'Replier le menu'}>
                {replie ? <PanelLeftOpen /> : <PanelLeftClose />}
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="drawer-backdrop" onClick={() => setTiroir(false)} />

      <div className="main">
        <header className="mobile-bar">
          <button type="button" className="btn btn-ghost btn-icon" onClick={() => setTiroir(true)} aria-label="Ouvrir le menu">
            <Menu />
          </button>
          <Link to={accueil} className="row" aria-label="Accueil">
            <img src={marque} className="brand-mark" alt="" />
            <img src={mot} className="brand-word" alt="ECO'DEKO" />
          </Link>
        </header>
        <main className={`page${wide ? ' is-wide' : ''}`}>{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected wide><Dashboard /></Protected>} />
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
