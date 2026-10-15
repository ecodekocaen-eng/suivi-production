// ─────────────────────────────────────────────────────────────
//  Petits composants d'interface partagés par toutes les pages.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, Search, X } from 'lucide-react';
import { initiales } from '../format.js';

// Titre de l'onglet du navigateur.
export function usePageTitle(titre) {
  useEffect(() => {
    document.title = titre ? `${titre} · Suivi production ECO'DEKO` : "Suivi production ECO'DEKO";
  }, [titre]);
}

// Valeur mémorisée dans le navigateur (préférences d'affichage).
// `store` : localStorage (par défaut, durable) ou sessionStorage (onglet).
export function useStoredState(cle, initial, store = 'local') {
  const s = () => (store === 'session' ? window.sessionStorage : window.localStorage);
  const [valeur, setValeur] = useState(() => {
    try {
      const brut = s().getItem(cle);
      return brut != null ? JSON.parse(brut) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { s().setItem(cle, JSON.stringify(valeur)); } catch { /* navigation privée : on ignore */ }
  }, [cle, valeur]); // eslint-disable-line react-hooks/exhaustive-deps
  return [valeur, setValeur];
}

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <>
      {back && (
        <Link to={back.to} className="back-link no-print"><ArrowLeft />{back.label}</Link>
      )}
      <div className="page-header">
        <div className="page-heading">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </>
  );
}

export function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      {title && <div className="empty-title">{title}</div>}
      {text && <div className="empty-text">{text}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }) {
  return <div className="loading-page"><LoaderCircle className="spin" size={20} />{label}</div>;
}

export function Switch({ checked, onChange, label, disabled = false, title }) {
  return (
    <label className="switch" title={title}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      {label && <span>{label}</span>}
    </label>
  );
}

// Choix exclusif sous forme de boutons accolés.
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'is-active' : ''}
                aria-pressed={value === o.value} onClick={() => onChange(o.value)} title={o.title}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ nom, large = false }) {
  return <span className={`avatar${large ? ' avatar-lg' : ''}`} aria-hidden="true">{initiales(nom)}</span>;
}

// Champ de recherche avec icône, bouton d'effacement et raccourci clavier affiché.
export function SearchInput({ value, onChange, placeholder = 'Rechercher…', raccourci, inputRef, className = '' }) {
  return (
    <div className={`input-group search ${className}`}>
      <Search />
      <input ref={inputRef} type="search" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      <span className="input-suffix">
        {value
          ? <button type="button" className="btn btn-ghost btn-icon btn-xs" onClick={() => onChange('')} aria-label="Effacer"><X /></button>
          : raccourci && <span className="kbd" title="Raccourci clavier">{raccourci}</span>}
      </span>
    </div>
  );
}
