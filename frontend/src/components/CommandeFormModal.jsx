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
import ChampsLivraison, { livraisonInitiale, payloadLivraison, livraisonRemplie, verifierLivraison } from './ChampsLivraison.jsx';
import LignesEditor, { ligneVide, totauxLignes } from './LignesEditor.jsx';
import { envoyerFichiers, verifierTailles } from '../televersement.js';

const ENVOIS_SIMULTANES = 4;

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
const empreinte = (form, lignes, livraison) => JSON.stringify({
  form: { ...form, reference: undefined },
  lignes: lignes.map((l) => ({ ...l, files: (l.files || []).map((f) => f.name) })),
  livraison: { ...payloadLivraison(livraison), pdf: livraison.pdf?.name || null },
});

export default function CommandeFormModal({ commande = null, onClose, onSaved }) {
  const edition = !!commande;
  const toast = useToast();
  const confirmer = useConfirm();

  const [form, setForm] = useState(() => formInitial(commande));
  const [lignes, setLignes] = useState(() => lignesInitiales(commande));
  const [livraison, setLivraison] = useState(() => livraisonInitiale(commande?.livraison));
  const [produits, setProduits] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { ligne, total, percent } pendant l'upload
  const depart = useRef(empreinte(formInitial(commande), lignesInitiales(commande), livraisonInitiale(commande?.livraison)));
  const livraisonDepart = useRef(JSON.stringify(payloadLivraison(livraisonInitiale(commande?.livraison))));

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
  const modifie = empreinte(form, lignes, livraison) !== depart.current;

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
    const joindre = livraison.pdf && livraison.joindre ? [livraison.pdf] : [];
    if (joindre.length) await verifierTailles(joindre);

    const { commande: creee } = await api.post('/commandes', { ...form, lignes: payloadLignes });

    // Livraison et bon de commande : la commande existe déjà, un échec ici est signalé sans l'annuler.
    const problemes = [];
    if (livraisonRemplie(livraison)) {
      await api.put(`/commandes/${creee.id}/expeditions/livraison`, payloadLivraison(livraison))
        .catch((err) => problemes.push(`l’adresse de livraison n’a pas été enregistrée (${err.message})`));
    }
    if (joindre.length) {
      await envoyerFichiers({ commandeId: creee.id, categorie: 'document', files: joindre })
        .catch((err) => problemes.push(`le bon de commande n’a pas été joint (${err.message})`));
    }
    if (problemes.length) toast.error(`Commande ${creee.reference} créée, mais ${problemes.join(' et ')}. Complétez-la depuis la fiche.`);

    // Upload des visuels sur leur ligne respective (créées dans le même ordre), à
    // plusieurs à la fois. La commande existe déjà : un envoi en échec n'arrête pas
    // les autres, et sa ligne reste signalée sans visuel dans le tableau.
    const creees = creee.lignes || [];
    const envois = utiles.map((l, i) => ({ files: l.files, ligne: creees[i] })).filter((e) => e.files.length && e.ligne);
    const avancement = envois.map(() => 0);
    const echecs = [];
    let termines = 0;
    let suivant = 0;
    const afficher = () => setProgress({
      ligne: termines, total: envois.length, percent: Math.round(avancement.reduce((s, p) => s + p, 0) / envois.length),
    });
    const envoyerLaSuite = async () => {
      while (suivant < envois.length) {
        const n = suivant;
        suivant += 1;
        try {
          await envoyerFichiers({
            commandeId: creee.id,
            ligneId: envois[n].ligne.id,
            files: envois[n].files,
            onProgress: (percent) => { avancement[n] = percent; afficher(); },
          });
        } catch (err) {
          echecs.push(err.message);
        }
        avancement[n] = 100;
        termines += 1;
        afficher();
      }
    };
    await Promise.all(Array.from({ length: ENVOIS_SIMULTANES }, envoyerLaSuite));
    if (echecs.length > 0) {
      toast.error(`Commande ${creee.reference} créée, mais ${echecs.length} envoi${echecs.length > 1 ? 's ont' : ' a'} échoué : ${echecs[0]}. Ajoutez ces visuels depuis la fiche.`);
    }
    onSaved(creee);
  };

  const enregistrer = async () => {
    await api.patch(`/commandes/${commande.id}`, { ...form, lignes: lignes.map(({ files, ...l }) => l) });
    if (JSON.stringify(payloadLivraison(livraison)) !== livraisonDepart.current) {
      await api.put(`/commandes/${commande.id}/expeditions/livraison`, payloadLivraison(livraison));
    }
    if (livraison.pdf && livraison.joindre) {
      await envoyerFichiers({ commandeId: commande.id, categorie: 'document', files: [livraison.pdf] });
    }
    onSaved();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const pbLivraison = verifierLivraison(livraison);
    if (pbLivraison) { setError(pbLivraison); return; }
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

      <ChampsLivraison livraison={livraison} setLivraison={setLivraison} form={form} setForm={setForm} />

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
