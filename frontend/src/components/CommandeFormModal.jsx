// ─────────────────────────────────────────────────────────────
//  Modale de création d'une commande.
//  - Autocomplétion du client (clients existants)
//  - Date de sortie calculée à +10 jours ouvrés de la date de commande
//  - Prix ESAT via deux boutons (0,20 € / 0,30 €)
//  - Lignes multiples (type de mug · visuel · quantité · commentaire)
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS } from '../constants.js';
import { addJoursOuvres } from '../format.js';
import LignesEditor, { ligneVide } from './LignesEditor.jsx';

const empty = {
  reference: '', client: '', nom: '', statut: 'En attente',
  dateCommande: '', dateSortieTexte: '', prixEsat: '', prixVente: '', atelier: '', notes: '',
};

export default function CommandeFormModal({ onClose, onCreated }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [form, setForm] = useState(empty);
  const [lignes, setLignes] = useState([ligneVide()]);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { ligne, total, percent } pendant l'upload

  useEffect(() => {
    api.get('/clients/names').then((d) => setClients(d.clients)).catch(() => {});
    // Préremplit la référence avec la prochaine valeur de la séquence (modifiable).
    api.get('/commandes/next-reference').then((d) => setForm((f) => ({ ...f, reference: d.reference }))).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Date de commande → date de sortie automatique (+10 jours ouvrés).
  const onDateCommande = (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, dateCommande: v, dateSortieTexte: v ? addJoursOuvres(v, 10) : f.dateSortieTexte }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Lignes significatives (avec contenu OU fichiers).
      const meaningful = lignes
        .map((l) => ({ ...l, files: l.files || [] }))
        .filter((l) => l.typeMug || l.visuel || l.quantite || l.commentaire || l.files.length);

      // Pour une ligne "fichiers seuls", on donne un visuel par défaut (1er nom de fichier)
      // afin de préserver l'ordre côté serveur.
      const payloadLignes = meaningful.map((l) => ({
        typeMug: l.typeMug,
        quantite: l.quantite,
        commentaire: l.commentaire,
        visuel: l.visuel || l.files[0]?.name || '',
      }));

      const { commande } = await api.post('/commandes', { ...form, lignes: payloadLignes });

      // Upload des visuels sur leur ligne respective (créées dans le même ordre).
      const createdLignes = commande.lignes || [];
      const aUploader = meaningful.filter((l) => l.files.length).length;
      let done = 0;
      for (let i = 0; i < meaningful.length; i += 1) {
        const files = meaningful[i].files;
        if (files.length && createdLignes[i]) {
          done += 1;
          await api.uploadWithProgress(
            `/commandes/${commande.id}/fichiers/ligne/${createdLignes[i].id}`,
            files,
            (percent) => setProgress({ ligne: done, total: aUploader, percent }),
          );
        }
      }
      onCreated(commande);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvelle commande</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>Référence *
              <input value={form.reference} onChange={set('reference')} required />
              <small className="field-hint">Auto (séquence) — modifiable</small>
            </label>

            <label>Client *
              <input list="clients-suggest" value={form.client} onChange={set('client')}
                     placeholder="Tapez les premières lettres…" autoComplete="off" required />
              <datalist id="clients-suggest">
                {clients.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>

            <label>Nom de la commande
              <input value={form.nom} onChange={set('nom')} placeholder="ex : Réassort été, Congrès 2026…" />
              <small className="field-hint">Libellé libre pour vous y retrouver</small>
            </label>

            <label>Statut
              <select value={form.statut} onChange={set('statut')}>
                {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
              </select>
            </label>

            <label>Date de commande<input type="date" value={form.dateCommande} onChange={onDateCommande} /></label>

            <label>Date de sortie (texte)
              <input value={form.dateSortieTexte} onChange={set('dateSortieTexte')} placeholder="ASAP, 12/06/2026…" />
              <small className="field-hint">Auto : +10 jours ouvrés (modifiable)</small>
            </label>

            <label>Atelier<input value={form.atelier} onChange={set('atelier')} placeholder="LETTRAGE…" /></label>

            <label>Prix ESAT
              <div className="esat-buttons">
                <button type="button"
                        className={`btn btn-sm ${form.prixEsat === '0.2' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setForm({ ...form, prixEsat: form.prixEsat === '0.2' ? '' : '0.2' })}>0,20 €</button>
                <button type="button"
                        className={`btn btn-sm ${form.prixEsat === '0.3' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setForm({ ...form, prixEsat: form.prixEsat === '0.3' ? '' : '0.3' })}>0,30 €</button>
              </div>
            </label>

            {isAdmin && (
              <label>Prix de vente (€ / unité)
                <input value={form.prixVente} onChange={set('prixVente')} placeholder="2.50" />
              </label>
            )}
          </div>

          {/* Lignes multiples (sous atelier / prix ESAT), avec upload de visuels par ligne */}
          <LignesEditor lignes={lignes} onChange={setLignes} allowFiles />

          <label className="full">Notes générales<textarea rows="2" value={form.notes} onChange={set('notes')} /></label>

          {progress && (
            <div className="upload-status">
              <span className="muted">Envoi des visuels (ligne {progress.ligne}/{progress.total}) — {progress.percent}%</span>
              <div className="progress"><div className="progress-bar" style={{ width: `${progress.percent}%` }} /></div>
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? (progress ? 'Envoi des visuels…' : 'Création…') : 'Créer'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}
