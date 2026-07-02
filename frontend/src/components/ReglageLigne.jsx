// ─────────────────────────────────────────────────────────────
//  Réglage de production d'un visuel, affiché sur une ligne de commande.
//  Montre le réglage connu (température / temps / note) ou permet de le
//  saisir en un clic. Éditable par tout utilisateur connecté.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { api } from '../api.js';
import { fmtTemps } from '../format.js';

export default function ReglageLigne({ visuel, reglage, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [temperature, setTemperature] = useState(reglage?.temperature ?? '');
  const [tempsSecondes, setTempsSecondes] = useState(reglage?.tempsSecondes ?? '');
  const [note, setNote] = useState(reglage?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const v = (visuel || '').trim();
  if (!v) return null; // pas de réglage possible sans visuel

  const ouvrir = () => {
    setTemperature(reglage?.temperature ?? '');
    setTempsSecondes(reglage?.tempsSecondes ?? '');
    setNote(reglage?.note ?? '');
    setError(null);
    setEditing(true);
  };

  const enregistrer = async () => {
    setBusy(true); setError(null);
    try {
      await api.post('/reglages', { visuel: v, temperature, tempsSecondes, note });
      setEditing(false);
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="reglage reglage-edit">
        <div className="reglage-fields">
          <label>Température (°C)
            <input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="200" />
          </label>
          <label>Temps de presse (s)
            <input type="number" value={tempsSecondes} onChange={(e) => setTempsSecondes(e.target.value)} placeholder="60" />
          </label>
          <label className="reglage-note">Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="astuce, pression, sens de pose…" />
          </label>
        </div>
        {error && <span className="reglage-err">{error}</span>}
        <div className="reglage-actions">
          <button className="btn btn-primary btn-xs" onClick={enregistrer} disabled={busy}>Enregistrer</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setEditing(false)} disabled={busy}>Annuler</button>
        </div>
      </div>
    );
  }

  if (reglage) {
    return (
      <div className="reglage reglage-known">
        <span className="reglage-tag">🌡️ réglage</span>
        <span className="reglage-val">{reglage.temperature != null ? `${reglage.temperature} °C` : '—'}</span>
        <span className="reglage-sep">·</span>
        <span className="reglage-val">{reglage.tempsSecondes != null ? fmtTemps(reglage.tempsSecondes) : '—'}</span>
        {reglage.note && <span className="reglage-note-txt">— {reglage.note}</span>}
        <button className="btn btn-ghost btn-xs reglage-modif" onClick={ouvrir}>Modifier</button>
      </div>
    );
  }

  return (
    <div className="reglage reglage-empty">
      <span className="muted">Aucun réglage enregistré pour ce visuel.</span>
      <button className="btn btn-ghost btn-xs" onClick={ouvrir}>+ Enregistrer le réglage</button>
    </div>
  );
}
