// ─────────────────────────────────────────────────────────────
//  Fenêtre « Nouvelle expédition » (admins) : départ de l'atelier (étiquettes
//  Chronopost sur la Zebra), de l'ESAT (PDF à imprimer là-bas) ou palette / autre
//  transporteur (étiquette reçue en PDF, importée). Destinataire prérempli par la
//  dernière étiquette Chronopost du même client ; un poids par carton. Expéditeur
//  imprimé : l'atelier, ou un expéditeur particulier proposé d'après le client
//  (ex. OBJETRAMA) — jamais l'ESAT.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Truck, Printer, FileDown, Upload, Package, MapPin, LoaderCircle, TriangleAlert, Info, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../ui/Modal.jsx';
import { api } from '../api.js';
import { useToast } from '../ui/feedback.jsx';
import { fmtNumber, plural } from '../format.js';
import { faiteParEcodeko } from '../constants.js';

const DEPARTS = [
  { v: 'ATELIER', label: 'Atelier', sous: 'Chronopost · sur la Zebra', Icone: Printer },
  { v: 'ESAT', label: 'ESAT', sous: 'Chronopost · PDF à imprimer', Icone: FileDown },
  { v: 'AUTRE', label: 'Palette / autre', sous: 'Importer l’étiquette reçue', Icone: Upload },
];
const COLIS_MAX = 30;
const POIDS_MAX = 30;
const TAILLE_IMPORT_MAX = 4 * 1024 * 1024;
const ADRESSE = { nom: '', contact: '', adresse1: '', adresse2: '', cp: '', ville: '', pays: 'FR', telephone: '', email: '' };

const nombre = (v) => Number(String(v).replace(',', '.'));
const kg = (n) => `${fmtNumber(Math.round(n * 100) / 100)} kg`;
const adresseComplete = (a) => Boolean(a.nom && a.adresse1 && a.cp && a.ville && a.telephone);

export default function ExpeditionModal({ commande, onClose, onCreated }) {
  const toast = useToast();
  const [depart, setDepart] = useState(faiteParEcodeko(commande) ? 'ATELIER' : 'ESAT');
  const [chrono, setChrono] = useState(null); // réglages Chronopost (mode, adresses de départ)
  const [dest, setDest] = useState(null);
  const [expediteur, setExpediteur] = useState('atelier');
  const [expediteurPropose, setExpediteurPropose] = useState('atelier');
  const [nbColis, setNbColis] = useState('1');
  const [poidsCommun, setPoidsCommun] = useState('');
  const [poidsDifferents, setPoidsDifferents] = useState(false);
  const [poids, setPoids] = useState(['']);
  const [reference, setReference] = useState(commande.reference);
  const [autre, setAutre] = useState({ transporteur: '', nbColis: '1', suivi: '' });
  const [fichier, setFichier] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    api.get('/chronopost').then((d) => setChrono(d.reglages)).catch(() => setChrono({ etat: 'inconnu' }));
    api.get(`/commandes/${commande.id}/expeditions/destinataire`)
      .then((d) => {
        setDest({ ...ADRESSE, ...d.destinataire });
        setExpediteur(d.expediteur || 'atelier');
        setExpediteurPropose(d.expediteur || 'atelier');
      })
      .catch(() => setDest({ ...ADRESSE, nom: commande.client }));
  }, [commande.id, commande.client]);

  const n = Math.min(COLIS_MAX, Math.max(1, Number.parseInt(nbColis, 10) || 1));
  // Un poids par carton : le même pour tous, ou saisi carton par carton.
  const listePoids = poidsDifferents ? poids.slice(0, n) : Array(n).fill(poidsCommun);
  const total = listePoids.reduce((s, p) => s + (nombre(p) || 0), 0);
  const changerNb = (v) => {
    setNbColis(v);
    const m = Math.min(COLIS_MAX, Math.max(1, Number.parseInt(v, 10) || 1));
    setPoids((p) => Array.from({ length: m }, (_, i) => p[i] ?? poidsCommun));
  };
  const basculerPoids = (oui) => {
    setPoidsDifferents(oui);
    if (oui) setPoids(Array.from({ length: n }, (_, i) => poids[i] || poidsCommun));
  };
  const champ = (k) => (e) => { setErreur(null); setDest((d) => ({ ...d, [k]: e.target.value })); };

  const chronopost = depart !== 'AUTRE';
  const arrete = chronopost && chrono && chrono.etat !== 'test' && chrono.etat !== 'reel';
  const essai = chronopost && chrono?.etat === 'test';
  // Expéditeurs possibles : l'atelier (habituel) et les expéditeurs particuliers des réglages.
  const atelier = chrono?.expediteurs?.atelier;
  const particuliers = chrono?.expediteurs?.particuliers || [];
  const expediteurs = [{ id: 'atelier', adresse: atelier }, ...particuliers.map((p) => ({ id: p.id, adresse: p }))];
  const choisi = expediteurs.find((x) => x.id === expediteur)?.adresse;
  const departIncomplet = chronopost && atelier && (!adresseComplete(atelier) || (choisi && !adresseComplete(choisi)));

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (!chronopost) {
      if (!fichier) { setErreur('Ajoutez l’étiquette reçue, en PDF.'); return; }
      if (fichier.size > TAILLE_IMPORT_MAX) { setErreur('PDF trop lourd : 4 Mo au plus.'); return; }
      setBusy(true);
      try {
        const { expedition } = await api.multipart('POST', `/commandes/${commande.id}/expeditions/import`,
          { transporteur: autre.transporteur, nbColis: autre.nbColis, suivi: autre.suivi }, fichier, 'fichier');
        toast.success('Étiquette importée : l’ESAT peut l’imprimer depuis la fiche');
        onCreated(expedition);
      } catch (err) { setErreur(err.message); setBusy(false); }
      return;
    }
    const valeurs = listePoids.map(nombre);
    if (valeurs.some((p) => !Number.isFinite(p) || p < 0.1 || p > POIDS_MAX)) {
      setErreur(`Indiquez le poids de ${n > 1 ? 'chaque carton' : 'du carton'} : de 0,1 à ${POIDS_MAX} kg.`);
      return;
    }
    setBusy(true);
    try {
      const { expedition } = await api.post(`/commandes/${commande.id}/expeditions/chronopost`, {
        depart, destinataire: dest, colis: valeurs, reference, expediteur,
      });
      toast.success(depart === 'ATELIER'
        ? <>{plural(n, 'étiquette')} {n > 1 ? 'envoyées' : 'envoyée'} <strong>sur la Zebra</strong></>
        : <>{plural(n, 'étiquette')} {n > 1 ? 'prêtes' : 'prête'} : PDF à imprimer à l’ESAT</>);
      onCreated(expedition);
    } catch (err) { setErreur(err.message); setBusy(false); }
  };

  const libelleBouton = chronopost
    ? `Créer ${n > 1 ? `les ${n} étiquettes` : 'l’étiquette'}${depart === 'ATELIER' ? ' et imprimer' : ''}`
    : 'Importer l’étiquette';

  return (
    <Modal
      title="Nouvelle expédition"
      description={`${commande.reference} · ${commande.client}`}
      icon={<Truck />}
      size="lg"
      onClose={onClose}
      onSubmit={envoyer}
      busy={busy}
      footer={(
        <>
          {chronopost && <span className="footer-info"><strong>{plural(n, 'carton')}</strong>{total > 0 && <> · {kg(total)}</>}</span>}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy || arrete || !dest}>
            {busy ? <LoaderCircle className="spin" /> : (chronopost ? <Printer /> : <Upload />)}{libelleBouton}
          </button>
        </>
      )}
    >
      <section className="form-section">
        <h3 className="form-section-title"><Truck />Départ</h3>
        <div className="choice-group expe-departs" role="radiogroup" aria-label="Départ">
          {DEPARTS.map((d) => (
            <button type="button" key={d.v} role="radio" aria-checked={depart === d.v}
                    className={`choice expe-depart${depart === d.v ? ' is-active' : ''}`}
                    onClick={() => { setErreur(null); setDepart(d.v); }}>
              <d.Icone />
              <span><strong>{d.label}</strong><span className="cell-sub">{d.sous}</span></span>
            </button>
          ))}
        </div>
        {arrete && (
          <div className="alert alert-warning">
            <TriangleAlert />
            <span>Chronopost est arrêté. Réglez-le dans <Link to="/chronopost">Administration › Chronopost</Link>.</span>
          </div>
        )}
        {essai && (
          <div className="alert alert-info">
            <FlaskConical />
            <span>Mode Test : étiquette « SPECIMEN » sur le compte d’essai de Chronopost, rien n’est facturé ni expédié.</span>
          </div>
        )}
        {chronopost && atelier && (
          <label className="field expe-expediteur">
            <span className="field-label">Expéditeur sur l’étiquette</span>
            <select value={expediteur} onChange={(e) => { setErreur(null); setExpediteur(e.target.value); }}>
              {expediteurs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id === 'atelier' ? `Atelier · ${x.adresse?.nom || 'à régler'}` : x.adresse.nom}{x.adresse?.ville ? ` (${x.adresse.ville})` : ''}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {expediteurPropose !== 'atelier' && expediteur === expediteurPropose
                ? <>Choisi automatiquement pour le client {commande.client}.</>
                : 'L’ESAT n’apparaît jamais comme expéditeur.'}
            </span>
          </label>
        )}
        {departIncomplet && !arrete && (
          <div className="alert alert-warning">
            <TriangleAlert />
            <span>Adresse de l’expéditeur à compléter (avec le téléphone) dans <Link to="/chronopost">Administration › Chronopost</Link>.</span>
          </div>
        )}
      </section>

      {chronopost ? (
        <>
          <section className="form-section">
            <h3 className="form-section-title"><MapPin />Destinataire</h3>
            {!dest ? <p className="muted small">Chargement…</p> : (
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Société ou nom <span className="req">*</span></span>
                  <input value={dest.nom} onChange={champ('nom')} required maxLength={35} data-autofocus />
                </label>
                <label className="field">
                  <span className="field-label">Contact</span>
                  <input value={dest.contact} onChange={champ('contact')} maxLength={35} placeholder="Personne à joindre" />
                </label>
                <label className="field field-full">
                  <span className="field-label">Adresse <span className="req">*</span></span>
                  <input value={dest.adresse1} onChange={champ('adresse1')} required placeholder="N° et rue" />
                </label>
                <label className="field field-full">
                  <span className="field-label">Complément</span>
                  <input value={dest.adresse2} onChange={champ('adresse2')} placeholder="Bâtiment, étage, zone…" />
                </label>
                <label className="field">
                  <span className="field-label">Code postal <span className="req">*</span></span>
                  <input value={dest.cp} onChange={champ('cp')} required inputMode="numeric" maxLength={5} pattern="\d{5}" title="5 chiffres" />
                </label>
                <label className="field">
                  <span className="field-label">Ville <span className="req">*</span></span>
                  <input value={dest.ville} onChange={champ('ville')} required maxLength={30} />
                </label>
                <label className="field">
                  <span className="field-label">Téléphone</span>
                  <input value={dest.telephone} onChange={champ('telephone')} inputMode="tel" placeholder="Pour le livreur" />
                </label>
                <label className="field">
                  <span className="field-label">E-mail</span>
                  <input type="email" value={dest.email} onChange={champ('email')} />
                </label>
              </div>
            )}
            <p className="field-hint"><Info />Livraison en France. L’adresse est retenue pour les prochaines étiquettes de ce client.</p>
          </section>

          <section className="form-section">
            <h3 className="form-section-title"><Package />Cartons</h3>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Nombre de cartons <span className="req">*</span></span>
                <input type="number" min="1" max={COLIS_MAX} value={nbColis} onChange={(e) => changerNb(e.target.value)} required />
              </label>
              {!poidsDifferents && (
                <label className="field">
                  <span className="field-label">Poids par carton (kg) <span className="req">*</span></span>
                  <input inputMode="decimal" value={poidsCommun} onChange={(e) => { setErreur(null); setPoidsCommun(e.target.value); }}
                         placeholder="ex : 12,5" required />
                </label>
              )}
              <label className="field">
                <span className="field-label">Référence sur l’étiquette</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={35} className="mono" />
              </label>
            </div>
            {n > 1 && (
              <label className="check-line">
                <input type="checkbox" checked={poidsDifferents} onChange={(e) => basculerPoids(e.target.checked)} />
                Poids différent selon le carton
              </label>
            )}
            {poidsDifferents && (
              <div className="expe-poids">
                {Array.from({ length: n }, (_, i) => (
                  <label className="field" key={i}>
                    <span className="field-label">Carton {i + 1} (kg)</span>
                    <input inputMode="decimal" value={poids[i] ?? ''} required
                           onChange={(e) => { setErreur(null); setPoids((p) => p.map((x, j) => (j === i ? e.target.value : x))); }} />
                  </label>
                ))}
              </div>
            )}
            <p className="field-hint"><Info />{depart === 'ATELIER'
              ? 'Une étiquette par carton, imprimée sur la Zebra de l’atelier (Chrono 13).'
              : 'Une étiquette par carton, dans un PDF à imprimer à l’ESAT sur une imprimante normale (Chrono 13).'}</p>
          </section>
        </>
      ) : (
        <section className="form-section">
          <h3 className="form-section-title"><Upload />Étiquette reçue</h3>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Transporteur</span>
              <input value={autre.transporteur} onChange={(e) => setAutre((a) => ({ ...a, transporteur: e.target.value }))}
                     placeholder="Palette, Geodis, Schenker…" maxLength={60} data-autofocus />
            </label>
            <label className="field">
              <span className="field-label">Nombre de colis ou palettes</span>
              <input type="number" min="1" value={autre.nbColis} onChange={(e) => setAutre((a) => ({ ...a, nbColis: e.target.value }))} />
            </label>
            <label className="field">
              <span className="field-label">N° de suivi</span>
              <input value={autre.suivi} onChange={(e) => setAutre((a) => ({ ...a, suivi: e.target.value }))} placeholder="Facultatif" />
            </label>
            <label className="field field-full">
              <span className="field-label">Étiquette en PDF <span className="req">*</span></span>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => { setErreur(null); setFichier(e.target.files?.[0] || null); }} />
              <span className="field-hint">4 Mo au plus. L’ESAT l’imprime depuis la fiche de la commande.</span>
            </label>
          </div>
        </section>
      )}

      {erreur && <div className="alert alert-error"><TriangleAlert /><span>{erreur}</span></div>}
    </Modal>
  );
}
