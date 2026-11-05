// ─────────────────────────────────────────────────────────────
//  Champs d'une commande (client, planning, prix), communs à la saisie
//  manuelle et à la commande préparée depuis une demande client.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { CalendarDays, ClipboardList, Euro, Flame, RotateCcw, StickyNote } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS, ATELIERS } from '../constants.js';
import { addJoursOuvres } from '../format.js';

const PRIX_ESAT = [{ v: '0.2', label: '0,20 €' }, { v: '0.3', label: '0,30 €' }];

// Délai de sortie proposé par défaut après la date de commande.
export const JOURS_OUVRES_SORTIE = 10;

// `suggestions` : clients à proposer en plus de ceux de l'application.
export default function ChampsCommande({ form, setForm, edition = false, suggestions = [] }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api.get('/clients/names').then((d) => setClients(d.clients)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Date de commande → date de sortie automatique, à la création.
  const onDateCommande = (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, dateCommande: v, dateSortieTexte: !edition && v ? addJoursOuvres(v, JOURS_OUVRES_SORTIE) : f.dateSortieTexte }));
  };

  const togglePrix = (v) => setForm((f) => ({ ...f, prixEsat: f.prixEsat === v ? '' : v }));
  const prixAutre = form.prixEsat && !PRIX_ESAT.some((p) => Number(p.v) === Number(form.prixEsat));

  return (
    <>
      <section className="form-section">
        <h3 className="form-section-title"><ClipboardList />Commande</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Client <span className="req">*</span></span>
            <input list="clients-suggest" value={form.client} onChange={set('client')}
                   placeholder="Tapez les premières lettres…" autoComplete="off" required data-autofocus />
            <datalist id="clients-suggest">
              {[...new Set([...clients, ...suggestions])].map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="field">
            <span className="field-label">Nom de la commande</span>
            <input value={form.nom} onChange={set('nom')} placeholder="ex : Réassort été, Congrès 2026…" />
          </label>
          {!edition && (
            <label className="field">
              <span className="field-label">Référence <span className="req">*</span></span>
              <input value={form.reference} onChange={set('reference')} required className="mono" />
              <span className="field-hint">Numérotée automatiquement — modifiable</span>
            </label>
          )}
          {!edition && (
            <label className="field">
              <span className="field-label">Statut de départ</span>
              <select value={form.statut} onChange={set('statut')}>
                {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">Atelier</span>
            <input list="ateliers-suggest" value={form.atelier} onChange={set('atelier')} placeholder="LETTRAGE…" />
            <datalist id="ateliers-suggest">
              {ATELIERS.map((a) => <option key={a} value={a} />)}
            </datalist>
          </label>
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-title"><CalendarDays />Planning et prix</h3>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Date de commande</span>
            <input type="date" value={form.dateCommande} onChange={onDateCommande} />
          </label>
          <div className="field">
            <label className="field-label" htmlFor="sortie">Date de sortie</label>
            <input id="sortie" value={form.dateSortieTexte} onChange={set('dateSortieTexte')} placeholder="JJ/MM/AAAA, ASAP…" />
            <span className="row">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setForm((f) => ({ ...f, dateSortieTexte: 'ASAP' }))}>
                <Flame />ASAP
              </button>
              {form.dateCommande && (
                <button type="button" className="btn btn-ghost btn-xs"
                        onClick={() => setForm((f) => ({ ...f, dateSortieTexte: addJoursOuvres(f.dateCommande, JOURS_OUVRES_SORTIE) }))}>
                  <RotateCcw />+{JOURS_OUVRES_SORTIE} jours ouvrés
                </button>
              )}
            </span>
          </div>
          <div className="field">
            <span className="field-label"><Euro size={14} />Prix ESAT (par mug)</span>
            <div className="choice-group">
              {PRIX_ESAT.map((p) => (
                <button key={p.v} type="button" className={`choice${Number(form.prixEsat) === Number(p.v) && form.prixEsat !== '' ? ' is-active' : ''}`}
                        aria-pressed={Number(form.prixEsat) === Number(p.v) && form.prixEsat !== ''} onClick={() => togglePrix(p.v)}>
                  {p.label}
                </button>
              ))}
              {prixAutre && (
                <button type="button" className="choice is-active" aria-pressed="true" onClick={() => togglePrix(form.prixEsat)}
                        title="Prix existant — cliquer pour le retirer">
                  {Number(form.prixEsat).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </button>
              )}
            </div>
          </div>
          {isAdmin && (
            <label className="field">
              <span className="field-label">Prix de vente (€ / mug) <span className="admin-tag">admin</span></span>
              <input value={form.prixVente} onChange={set('prixVente')} placeholder="2,50" inputMode="decimal" />
            </label>
          )}
        </div>
      </section>
    </>
  );
}

export function ChampNotes({ form, setForm }) {
  return (
    <section className="form-section">
      <h3 className="form-section-title"><StickyNote />Notes</h3>
      <textarea rows="3" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Informations utiles pour l'atelier…" aria-label="Notes" />
    </section>
  );
}
