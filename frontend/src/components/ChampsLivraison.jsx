// ─────────────────────────────────────────────────────────────
//  Partie « Livraison » du formulaire de commande (facultative) : adresse de
//  livraison et expéditeur, repris par la fenêtre d'étiquette d'expédition.
//  « Lire le bon de commande (PDF) » remplit l'adresse depuis le PDF du client
//  (bonCommande.js) et propose de joindre ce PDF aux documents de la commande.
//  Expéditeur : selon le client (automatique), l'atelier, un expéditeur
//  particulier, ou un autre — gardé en mémoire si on coche la case (admins).
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { Truck, FileText, LoaderCircle, Info, TriangleAlert, MapPin, Send } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { lireBonDeCommande } from '../bonCommande.js';

export const ADRESSE = { nom: '', contact: '', adresse1: '', adresse2: '', cp: '', ville: '', pays: 'FR', telephone: '', email: '' };
const CHAMPS = [
  { k: 'nom', label: 'Société ou nom', max: 35 },
  { k: 'contact', label: 'Contact', max: 35 },
  { k: 'adresse1', label: 'Adresse', full: true },
  { k: 'adresse2', label: 'Complément', full: true },
  { k: 'cp', label: 'Code postal', max: 5 },
  { k: 'ville', label: 'Ville', max: 30 },
  { k: 'telephone', label: 'Téléphone' },
  { k: 'email', label: 'E-mail' },
];

const vide = (a) => !a || Object.entries(a).every(([k, v]) => k === 'pays' || !String(v ?? '').trim());
const complete = (a) => Boolean(a?.nom && a.adresse1 && a.cp && a.ville && a.telephone);
// Même comparaison que le serveur (chronopost/reglages.js › cleClient).
const cleClient = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const motsClients = (texte) => String(texte || '').split(/[,;\n]/).map(cleClient).filter((m) => m.length >= 3);

// État du formulaire d'après la livraison enregistrée (fiche) ; vide pour une nouvelle commande.
export function livraisonInitiale(l) {
  const exp = l?.expediteur;
  return {
    ouvert: Boolean(l && (!vide(l.destinataire) || exp || l.refClient)),
    destinataire: { ...ADRESSE, ...(l?.destinataire || {}) },
    expediteur: exp ? exp.id : '',
    autre: { ...ADRESSE, ...(exp?.id === 'commande' ? exp.adresse : {}) },
    memoriser: false,
    refClient: l?.refClient || '',
    source: l?.source || '',
    pdf: null,
    joindre: true,
    lecture: null,
  };
}

// Corps de PUT /commandes/:id/expeditions/livraison.
export function payloadLivraison(l) {
  let expediteur = l.expediteur || null;
  if (l.expediteur === 'autre') expediteur = { adresse: l.autre, memoriser: l.memoriser };
  else if (l.expediteur === 'commande') expediteur = { adresse: l.autre, memoriser: false };
  return { destinataire: vide(l.destinataire) ? null : l.destinataire, expediteur, refClient: l.refClient, source: l.source };
}

export const livraisonRemplie = (l) => !vide(l.destinataire) || Boolean(l.expediteur) || Boolean(String(l.refClient || '').trim());

// Erreur à montrer avant d'enregistrer, ou null.
export function verifierLivraison(l) {
  const d = l.destinataire;
  if (!vide(d) && d.cp && (!d.pays || /^(FR|FRANCE)$/i.test(d.pays)) && !/^\d{5}$/.test(String(d.cp).replace(/\s/g, ''))) {
    return 'Livraison : le code postal doit avoir 5 chiffres.';
  }
  if ((l.expediteur === 'autre' || l.expediteur === 'commande') && !complete(l.autre)) {
    return 'Expéditeur : société, adresse, code postal, ville et téléphone.';
  }
  return null;
}

function Adresse({ valeur, onChange, prefixe }) {
  return (
    <div className="form-grid">
      {CHAMPS.map((c) => (
        <label className={`field${c.full ? ' field-full' : ''}`} key={c.k}>
          <span className="field-label">{c.label}</span>
          <input value={valeur[c.k] || ''} maxLength={c.max} name={`${prefixe}-${c.k}`}
                 inputMode={c.k === 'cp' ? 'numeric' : (c.k === 'telephone' ? 'tel' : undefined)}
                 onChange={(e) => onChange({ ...valeur, [c.k]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

export default function ChampsLivraison({ livraison, setLivraison, form, setForm }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [expediteurs, setExpediteurs] = useState(null);
  const [lecture, setLecture] = useState(null); // { enCours } | { erreur }
  const fichierRef = useRef(null);
  const set = (maj) => setLivraison((l) => ({ ...l, ...maj }));

  useEffect(() => {
    api.get('/chronopost/expediteurs').then((d) => setExpediteurs(d.expediteurs)).catch(() => setExpediteurs([]));
  }, []);

  // Expéditeur que choisira l'étiquette en « automatique » : le particulier du client, sinon l'atelier.
  const atelier = expediteurs?.find((e) => e.id === 'atelier');
  const particuliers = (expediteurs || []).filter((e) => e.id !== 'atelier');
  const cle = cleClient(form.client);
  const auto = (cle && particuliers.find((p) => motsClients(p.clients).some((m) => cle.includes(m)))) || atelier;

  const lire = async (fichier) => {
    if (!fichier) return;
    setLecture({ enCours: true });
    try {
      const { lignesDuPdf } = await import('../pdf.js');
      const r = lireBonDeCommande(await lignesDuPdf(fichier));
      set({ ouvert: true, pdf: fichier, joindre: true, source: fichier.name });
      if (!r) {
        setLecture({ erreur: `Aucune adresse de livraison trouvée dans « ${fichier.name} » : saisissez-la à la main.` });
        return;
      }
      set({ destinataire: { ...ADRESSE, ...r.destinataire }, refClient: r.refClient || livraison.refClient, lecture: { nom: fichier.name, format: r.format, sur: r.sur } });
      setLecture(null);
      // Client et nom de la commande, s'ils ne sont pas encore remplis.
      if (r.client) {
        const noms = await api.get('/clients/names').then((d) => d.clients).catch(() => []);
        const connu = noms.find((n) => cleClient(n).includes(cleClient(r.client))) || r.client;
        setForm((f) => (f.client ? f : { ...f, client: connu }));
      }
      if (r.refClient) setForm((f) => (f.nom ? f : { ...f, nom: `${r.refClient} · ${r.destinataire.nom}`.slice(0, 80) }));
    } catch (err) {
      setLecture({ erreur: `PDF illisible : ${err.message}` });
    }
  };

  return (
    <section className="form-section">
      <h3 className="form-section-title"><Truck />Livraison
        <button type="button" className="btn btn-secondary btn-xs titre-action" onClick={() => fichierRef.current?.click()} disabled={lecture?.enCours}>
          {lecture?.enCours ? <LoaderCircle className="spin" /> : <FileText />}Lire le bon de commande (PDF)
        </button>
        <input ref={fichierRef} type="file" accept="application/pdf,.pdf" hidden
               onChange={(e) => { lire(e.target.files?.[0]); e.target.value = ''; }} />
      </h3>

      {lecture?.erreur && <div className="alert alert-warning"><TriangleAlert /><span>{lecture.erreur}</span></div>}
      {livraison.lecture && !lecture?.erreur && (
        <div className={`alert ${livraison.lecture.sur ? 'alert-info' : 'alert-warning'}`}>
          {livraison.lecture.sur ? <Info /> : <TriangleAlert />}
          <span>
            {livraison.lecture.sur
              ? <>Adresse remplie depuis « {livraison.lecture.nom} » (bon {livraison.lecture.format}).</>
              : <>Adresse lue au mieux dans « {livraison.lecture.nom} » : vérifiez chaque champ.</>}
          </span>
        </div>
      )}

      {!livraison.ouvert ? (
        <p className="field-hint">
          Facultatif : l’adresse de livraison et l’expéditeur, repris par l’étiquette d’expédition.{' '}
          <button type="button" className="lien" onClick={() => set({ ouvert: true })}>Saisir l’adresse</button>
        </p>
      ) : (
        <>
          {livraison.pdf && (
            <label className="check-line">
              <input type="checkbox" checked={livraison.joindre} onChange={(e) => set({ joindre: e.target.checked })} />
              Joindre « {livraison.pdf.name} » aux documents de la commande
            </label>
          )}
          <div className="sous-titre"><MapPin />Adresse de livraison</div>
          <Adresse valeur={livraison.destinataire} prefixe="livraison" onChange={(v) => set({ destinataire: v })} />

          <div className="form-grid">
            <label className="field">
              <span className="field-label"><Send size={14} />Expéditeur sur l’étiquette</span>
              <select value={livraison.expediteur} onChange={(e) => set({ expediteur: e.target.value })}>
                <option value="">Selon le client (automatique)</option>
                {atelier && <option value="atelier">Atelier · {atelier.nom || 'à régler'}{atelier.ville ? ` (${atelier.ville})` : ''}</option>}
                {particuliers.map((p) => <option key={p.id} value={p.id}>{p.nom}{p.ville ? ` (${p.ville})` : ''}</option>)}
                {livraison.expediteur === 'commande' && <option value="commande">Propre à cette commande · {livraison.autre.nom}</option>}
                <option value="autre">Autre expéditeur…</option>
              </select>
              <span className="field-hint">
                {livraison.expediteur === '' && auto ? `Ce sera ${auto.id === 'atelier' ? `l’atelier (${auto.nom || 'à régler'})` : auto.nom}, d’après le client. ` : ''}
                L’ESAT n’apparaît jamais comme expéditeur.
              </span>
            </label>
            <label className="field">
              <span className="field-label">N° de commande du client</span>
              <input value={livraison.refClient} onChange={(e) => set({ refClient: e.target.value })} maxLength={60} className="mono" placeholder="ex. OBJ871848" />
            </label>
          </div>

          {(livraison.expediteur === 'autre' || livraison.expediteur === 'commande') && (
            <>
              <div className="sous-titre"><Send />Expéditeur</div>
              <Adresse valeur={livraison.autre} prefixe="expediteur" onChange={(v) => set({ autre: v })} />
              {isAdmin && livraison.expediteur === 'autre' && (
                <label className="check-line">
                  <input type="checkbox" checked={livraison.memoriser} onChange={(e) => set({ memoriser: e.target.checked })} />
                  Garder cet expéditeur en mémoire{form.client ? ` pour les prochaines commandes de ${form.client}` : ''}
                </label>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
