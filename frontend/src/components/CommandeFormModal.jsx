// ─────────────────────────────────────────────────────────────
//  Fenêtre de création OU de modification d'une commande.
//  - Création : référence auto, date du jour, sortie à +10 jours ouvrés,
//    visuels joints par ligne (envoyés après création, avec progression)
//  - Modification : mêmes champs + suivi (rebut, transport, facturation) ;
//    les lignes gardent leur identité (et donc leurs visuels)
//  - Fermer une saisie en cours demande confirmation (pas de perte par erreur)
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Layers, Truck, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { addJoursOuvres, aujourdhuiISO, fmtNumber } from '../format.js';
import Modal from '../ui/Modal.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import ChampsCommande, { ChampNotes, JOURS_OUVRES_SORTIE } from './ChampsCommande.jsx';
import LignesEditor, { ligneVide, totauxLignes } from './LignesEditor.jsx';
import { envoyerFichiers, verifierTailles } from '../televersement.js';

// Convertit une date ISO en valeur pour <input type="date"> (yyyy-mm-dd).
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

function formInitial(commande) {
  if (!commande) {
    const jour = aujourdhuiISO();
    return {
      reference: '', client: '', nom: '', statut: 'En attente',
      dateCommande: jour, dateSortieTexte: addJoursOuvres(jour, JOURS_OUVRES_SORTIE),
      prixEsat: '', prixVente: '', atelier: '', notes: '',
    };
  }
  return {
    client: commande.client || '',
    nom: commande.nom || '',
    dateCommande: toDateInput(commande.dateCommande),
    dateSortieTexte: commande.dateSortieTexte || '',
    prixEsat: commande.prixEsat != null ? String(commande.prixEsat) : '',
    prixVente: commande.prixVente != null ? String(commande.prixVente) : '',
    atelier: commande.atelier || '',
    rebut: commande.rebut ?? 0,
    noteTransport: commande.noteTransport || '',
    aFacturer: commande.aFacturer || '',
    notes: commande.notes || '',
  };
}

function lignesInitiales(commande) {
  if (!commande) return [ligneVide()];
  // Lignes existantes, ou une ligne dérivée de l'en-tête (commandes importées).
  return commande.lignes?.length
    ? commande.lignes.map((l) => ({
        id: l.id, // conserve l'identité (et donc les visuels rattachés)
        typeMug: l.typeMug || '', visuel: l.visuel || '',
        quantite: l.quantite ?? '', commentaire: l.commentaire || '', lien: l.lien || '',
      }))
    : [{ typeMug: commande.typeMug || '', visuel: commande.designation || '',
         quantite: commande.quantite ?? '', commentaire: '', lien: '' }];
}

// Empreinte de la saisie (hors référence auto), pour détecter une modification.
const empreinte = (form, lignes) => JSON.stringify({
  form: { ...form, reference: undefined },
  lignes: lignes.map((l) => ({ ...l, files: (l.files || []).map((f) => f.name) })),
});

export default function CommandeFormModal({ commande = null, onClose, onSaved }) {
  const edition = !!commande;
  const toast = useToast();
  const confirmer = useConfirm();

  const [form, setForm] = useState(() => formInitial(commande));
  const [lignes, setLignes] = useState(() => lignesInitiales(commande));
  const [produits, setProduits] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { ligne, total, percent } pendant l'upload
  const depart = useRef(empreinte(formInitial(commande), lignesInitiales(commande)));

  useEffect(() => {
    api.get('/produits').then((d) => setProduits(d.produits)).catch(() => {});
    // Préremplit la référence avec la prochaine valeur de la séquence (modifiable).
    if (!edition) {
      api.get('/commandes/next-reference')
        .then((d) => setForm((f) => ({ ...f, reference: f.reference || d.reference })))
        .catch(() => {});
    }
  }, [edition]);

  const produitsByNom = useMemo(() => Object.fromEntries(produits.map((p) => [p.nom, p])), [produits]);
  const { mugs } = totauxLignes(lignes, produitsByNom);
  const modifie = empreinte(form, lignes) !== depart.current;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fermer = async () => {
    if (busy) return;
    if (modifie && !(await confirmer({
      title: 'Abandonner la saisie ?',
      message: edition ? 'Vos modifications ne seront pas enregistrées.' : 'La commande ne sera pas créée et la saisie sera perdue.',
      confirmLabel: 'Abandonner',
      cancelLabel: 'Continuer la saisie',
      tone: 'danger',
    }))) return;
    onClose();
  };

  const creer = async () => {
    // Lignes significatives (avec contenu OU fichiers).
    const utiles = lignes
      .map((l) => ({ ...l, files: l.files || [] }))
      .filter((l) => l.typeMug || l.visuel || l.quantite || l.commentaire || l.lien || l.files.length);

    // Pour une ligne « fichiers seuls », on donne un visuel par défaut (1er nom de fichier)
    // afin de préserver l'ordre côté serveur.
    const payloadLignes = utiles.map((l) => ({
      typeMug: l.typeMug,
      quantite: l.quantite,
      commentaire: l.commentaire,
      lien: l.lien,
      visuel: l.visuel || l.files[0]?.name || '',
    }));

    // Fichier trop gros : on le signale AVANT de créer la commande.
    await verifierTailles(utiles.flatMap((l) => l.files));

    const { commande: creee } = await api.post('/commandes', { ...form, lignes: payloadLignes });

    // Upload des visuels sur leur ligne respective (créées dans le même ordre).
    // La commande existe déjà : en cas d'échec d'envoi, on ne la recrée pas.
    try {
      const creees = creee.lignes || [];
      const total = utiles.filter((l) => l.files.length).length;
      let n = 0;
      for (let i = 0; i < utiles.length; i += 1) {
        if (utiles[i].files.length && creees[i]) {
          n += 1;
          const ligne = n;
          await envoyerFichiers({
            commandeId: creee.id,
            ligneId: creees[i].id,
            files: utiles[i].files,
            onProgress: (percent) => setProgress({ ligne, total, percent }),
          });
        }
      }
    } catch (err) {
      toast.error(`Commande ${creee.reference} créée, mais l’envoi des visuels a échoué : ${err.message}. Ajoutez-les depuis la fiche.`);
    }
    onSaved(creee);
  };

  const enregistrer = async () => {
    await api.patch(`/commandes/${commande.id}`, { ...form, lignes: lignes.map(({ files, ...l }) => l) });
    onSaved();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (edition) await enregistrer(); else await creer();
    } catch (err) {
      setError(err.message);
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal
      size="lg"
      title={edition ? `Modifier la commande ${commande.reference}` : 'Nouvelle commande'}
      description={edition ? commande.client : 'Renseignez le client, le planning et les lignes à produire.'}
      icon={<ClipboardList />}
      onClose={fermer}
      onSubmit={submit}
      busy={busy}
      footer={(
        <>
          <div className="footer-info">
            {progress ? (
              <div style={{ minWidth: 240 }}>
                Envoi des visuels ({progress.ligne}/{progress.total}) — {progress.percent} %
                <div className="progress"><div className="progress-bar" style={{ width: `${progress.percent}%` }} /></div>
              </div>
            ) : (
              <span>Total : <strong className="tnum">{fmtNumber(mugs)}</strong> mug{mugs > 1 ? 's' : ''} · {lignes.length} ligne{lignes.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={fermer} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <LoaderCircle className="spin" />}
            {busy ? (progress ? 'Envoi des visuels…' : 'Enregistrement…') : (edition ? 'Enregistrer' : 'Créer la commande')}
          </button>
        </>
      )}
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <ChampsCommande form={form} setForm={setForm} edition={edition} />

      {edition && (
        <section className="form-section">
          <h3 className="form-section-title"><Truck />Suivi</h3>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Rebut (mugs)</span>
              <input type="number" min="0" value={form.rebut} onChange={set('rebut')} />
            </label>
            <label className="field">
              <span className="field-label">Note transport</span>
              <input value={form.noteTransport} onChange={set('noteTransport')} placeholder="CHRONO, récup…" />
            </label>
            <label className="field">
              <span className="field-label">À facturer / arrêt</span>
              <input value={form.aFacturer} onChange={set('aFacturer')} />
            </label>
          </div>
        </section>
      )}

      <section className="form-section">
        <h3 className="form-section-title"><Layers />Lignes de production</h3>
        <LignesEditor lignes={lignes} onChange={setLignes} produits={produits} allowFiles={!edition} />
      </section>

      <ChampNotes form={form} setForm={setForm} />
    </Modal>
  );
}
