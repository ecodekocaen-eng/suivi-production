// ─────────────────────────────────────────────────────────────
//  Réglage de presse d'un visuel, affiché sur une ligne de commande.
//  Montre le réglage connu (température / temps / note) ou permet de le
//  saisir en un clic. Éditable par tout utilisateur connecté.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Thermometer, Timer, Plus, Pencil, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { fmtTemps } from '../format.js';
import { useToast } from '../ui/feedback.jsx';

export default function ReglageLigne({ visuel, reglage, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [temperature, setTemperature] = useState('');
  const [tempsSecondes, setTempsSecondes] = useState('');
  const [note, setNote] = useState('');
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

  const enregistrer = async (e) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post('/reglages', { visuel: v, temperature, tempsSecondes, note });
      setEditing(false);
      toast.success(`Réglage presse de « ${v} » enregistré`);
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="press press-edit">
        <div className="press-fields">
          <label className="field">
            <span className="field-label"><Thermometer size={14} />Température (°C)</span>
            <input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="200" autoFocus />
          </label>
          <label className="field">
            <span className="field-label"><Timer size={14} />Temps de presse (s)</span>
            <input type="number" value={tempsSecondes} onChange={(e) => setTempsSecondes(e.target.value)} placeholder="60" />
          </label>
          <label className="field">
            <span className="field-label">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Astuce, pression, sens de pose…"
                   onKeyDown={(e) => { if (e.key === 'Enter') enregistrer(e); }} />
          </label>
        </div>
        {error && <span className="text-danger small">{error}</span>}
        <div className="press-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={enregistrer} disabled={busy}>
            {busy && <LoaderCircle className="spin" />}Enregistrer le réglage
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>Annuler</button>
        </div>
      </div>
    );
  }

  if (reglage) {
    return (
      <div className="press press-known">
        <span className="press-tag">Réglage presse</span>
        <span className="press-val"><Thermometer />{reglage.temperature != null ? `${reglage.temperature} °C` : '—'}</span>
        <span className="press-val"><Timer />{reglage.tempsSecondes != null ? fmtTemps(reglage.tempsSecondes) : '—'}</span>
        {reglage.note && <span className="press-note">« {reglage.note} »</span>}
        <button type="button" className="btn btn-ghost btn-xs press-action" onClick={ouvrir}><Pencil />Modifier</button>
      </div>
    );
  }

  return (
    <div className="press press-empty">
      <Thermometer size={16} />
      <span>Aucun réglage presse enregistré pour ce visuel.</span>
      <button type="button" className="btn btn-secondary btn-xs press-action" onClick={ouvrir}><Plus />Ajouter le réglage</button>
    </div>
  );
}
