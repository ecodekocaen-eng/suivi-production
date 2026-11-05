// ─────────────────────────────────────────────────────────────
//  Base de données des modèles (ex. mugs Heula) :
//   - demande client : on dépose son PDF, Excel ou CSV, les références et
//     quantités sont lues dans le navigateur, retrouvées dans la base, et la
//     commande est créée avec le bon fichier d'impression sur chaque ligne ;
//   - la base elle-même : vignettes, recherche, import par glisser-déposer (ADMIN).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database, FileSearch, FileText, TriangleAlert, CircleCheck, Pencil, Trash, Upload, LoaderCircle,
  ExternalLink, X, RotateCcw, SearchX, PackagePlus, ArrowRight, Check, ImagePlus, Layers,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { addJoursOuvres, aujourdhuiISO, plural, fmtNumber, fmtSize } from '../format.js';
import { PageHeader, EmptyState, Loading, SearchInput, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import Modal from '../ui/Modal.jsx';
import ChampsCommande, { ChampNotes, JOURS_OUVRES_SORTIE } from '../components/ChampsCommande.jsx';
import { envoyerFichiers, deposerFichierModele } from '../televersement.js';
import { analyserDemande, analyserTableau, lireNomFichier, modelesProches, normRef, cleRef, dossierRef } from '../demandePrix.js';

const ACCEPT_MODELES = 'application/pdf,image/jpeg,image/png,image/webp,image/gif';
const TYPES_TABLEUR = {
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const ACCEPT_DEMANDES = ['.pdf', 'application/pdf', ...Object.keys(TYPES_TABLEUR).map((e) => `.${e}`), ...Object.values(TYPES_TABLEUR)].join(',');
const TYPE_PAR_DEFAUT = 'MUG BLANC';
const SANS_CLIENT = '__sans_client__'; // valeur du filtre, jamais un nom de client
const typeTableur = (fichier) => TYPES_TABLEUR[fichier.name.match(/\.(csv|xlsx?)$/i)?.[1].toLowerCase()];

// Lit une demande : texte du PDF, ou 1re feuille Excel / CSV où des lignes sont reconnues.
async function lireDemande(fichier, references) {
  if (!typeTableur(fichier)) {
    const { lignesDuPdf } = await import('../pdf.js');
    return analyserDemande(await lignesDuPdf(fichier));
  }
  const { feuillesDuTableur } = await import('../tableur.js');
  const analyses = (await feuillesDuTableur(fichier)).map((feuille) => analyserTableau(feuille, references));
  return analyses.find((a) => a.lignes.length > 0) || { lignes: [] };
}

const version = (m) => encodeURIComponent(m.updatedAt || '');
const urlApercu = (m) => `/api/modeles/${m.id}/apercu?v=${version(m)}`;
const urlFichier = (m) => `/api/modeles/${m.id}/fichier?v=${version(m)}`;
// Tri naturel : 104HE-2 avant 104HE-10.
const parReference = (a, b) => a.reference.localeCompare(b.reference, 'fr', { numeric: true });
const estFichierModele = (f) => ACCEPT_MODELES.split(',').includes(f?.type);

// Ajoute (ou remplace) un modèle dans la base : fichier d'impression, vignette
// générée dans le navigateur, puis inscription. Renvoie le modèle enregistré.
async function enregistrerModele({ reference, nom, client, typeMug, fichier }) {
  const chemin = await deposerFichierModele(reference, fichier);
  let apercu = null;
  try {
    const { vignette } = await import('../pdf.js');
    apercu = { pathname: await deposerFichierModele(reference, new File([await vignette(fichier)], 'apercu.jpg', { type: 'image/jpeg' })) };
  } catch (err) {
    console.warn('Vignette impossible :', fichier.name, err);
  }
  const { modele } = await api.post('/modeles', {
    reference, nom, client, typeMug, fichier: { pathname: chemin, nom: fichier.name.normalize('NFC') }, apercu,
  });
  return modele;
}

// Refait la vignette d'un modèle à partir de son fichier d'impression déjà en base.
async function creerApercu(modele) {
  const reponse = await fetch(urlFichier(modele), { credentials: 'include' });
  if (!reponse.ok) throw new Error(`fichier illisible (erreur ${reponse.status})`);
  const fichier = new File([await reponse.blob()], modele.fichierNom || 'modele', { type: modele.fichierType });
  const { vignette } = await import('../pdf.js');
  const pathname = await deposerFichierModele(modele.reference, new File([await vignette(fichier)], 'apercu.jpg', { type: 'image/jpeg' }));
  return (await api.patch(`/modeles/${modele.id}`, { apercu: { pathname } })).modele;
}

function BoutonApercu({ modele, onCree }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const creer = async () => {
    setBusy(true);
    try {
      onCree(await creerApercu(modele));
    } catch (err) {
      toast.error(`${modele.reference} : aperçu impossible, ${err.message}`);
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn-secondary btn-xs modele-creer-apercu" onClick={creer} disabled={busy}>
      {busy ? <LoaderCircle className="spin" /> : <ImagePlus />}{busy ? 'Création…' : 'Créer l’aperçu'}
    </button>
  );
}

// Petit bouton « Ajouter le fichier » (sélecteur de fichier caché).
function BoutonFichier({ onFichier, busy, libelle = 'Ajouter le fichier' }) {
  const inputRef = useRef(null);
  return (
    <>
      <input ref={inputRef} type="file" accept={ACCEPT_MODELES} hidden
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFichier(f); }} />
      <button type="button" className="btn btn-secondary btn-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <LoaderCircle className="spin" /> : <Upload />}{busy ? 'Ajout…' : libelle}
      </button>
    </>
  );
}

// Zone de dépôt (cliquer ou glisser-déposer).
function ZoneDepot({ accept, multiple = false, onFichiers, busy = false, titre, aide, icone }) {
  const inputRef = useRef(null);
  const [survol, setSurvol] = useState(false);
  const deposer = (liste) => { if (liste?.length) onFichiers([...liste]); };
  return (
    <div
      className={`dropzone dropzone-large${survol ? ' is-over' : ''}`}
      role="button" tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); if (!busy) deposer(e.dataTransfer.files); }}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} hidden
             onChange={(e) => { deposer(e.target.files); e.target.value = ''; }} />
      <span className="dropzone-icon">{busy ? <LoaderCircle className="spin" /> : icone}</span>
      <span className="dropzone-text"><strong>{titre}</strong><span>{aide}</span></span>
    </div>
  );
}

function Apercu({ modele, className = '' }) {
  const [erreur, setErreur] = useState(false);
  if (!modele?.apercuChemin || erreur) {
    return <span className={`modele-sans-apercu ${className}`}><FileText /></span>;
  }
  return <img className={className} src={urlApercu(modele)} alt="" loading="lazy" onError={() => setErreur(true)} />;
}

// ── Demande client (PDF, Excel, CSV) → commande ──────────────

function AnalyseDemande({ modeles, produits, isAdmin, onModeleAjoute }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [demande, setDemande] = useState(null); // le fichier du client
  const [lecture, setLecture] = useState(false);
  const [analyse, setAnalyse] = useState(null);
  const [form, setForm] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [busy, setBusy] = useState(false);
  // Visuels manquants ajoutés depuis la demande : { [cle de ligne]: 'en-cours' | 'ok' }.
  const [ajouts, setAjouts] = useState({});
  const [survol, setSurvol] = useState(null);

  const parCle = useMemo(() => new Map(modeles.map((m) => [cleRef(m.reference), m])), [modeles]);
  // Le modèle d'une ligne : celui de même référence, ou le modèle proche qu'on a choisi.
  const modeleDe = (l) => parCle.get(cleRef(l.choix ?? l.reference));
  const clientsConnus = useMemo(
    () => [...new Set([...modeles.map((m) => m.client), analyse?.societe].filter(Boolean))].sort(),
    [modeles, analyse],
  );

  const lire = async ([fichier]) => {
    if (!fichier) return;
    const tableur = Boolean(typeTableur(fichier));
    if (!tableur && fichier.type !== 'application/pdf' && !/\.pdf$/i.test(fichier.name)) {
      toast.error('Déposez la demande en PDF, Excel ou CSV.');
      return;
    }
    setLecture(true);
    try {
      const resultat = await lireDemande(fichier, modeles.map((m) => m.reference));
      if (resultat.lignes.length === 0) {
        toast.error(tableur
          ? 'Aucune ligne trouvée dans ce fichier : il faut une colonne de références et une colonne de quantités.'
          : 'Aucune ligne « [référence] désignation … quantité » trouvée dans ce PDF.');
        return;
      }
      // Client : celui des modèles retrouvés (ex. HEULA), sinon la société de la demande.
      const clientsModeles = resultat.lignes.map((l) => modeleDe(l)?.client).filter(Boolean);
      const client = clientsModeles.sort((a, b) => clientsModeles.filter((c) => c === b).length - clientsModeles.filter((c) => c === a).length)[0]
        || resultat.societe || '';
      setDemande(fichier);
      setAnalyse(resultat);
      setAjouts({});
      // Mêmes valeurs de départ qu'une commande saisie à la main.
      const jour = aujourdhuiISO();
      setForm({
        reference: '',
        client,
        nom: resultat.numero ? `${resultat.type} ${resultat.numero}` : fichier.name.replace(/\.[a-z0-9]+$/i, ''),
        statut: 'En attente',
        atelier: '',
        dateCommande: jour,
        dateSortieTexte: resultat.dateExpedition || addJoursOuvres(jour, JOURS_OUVRES_SORTIE),
        prixEsat: '',
        prixVente: '',
        notes: '',
      });
      api.get('/commandes/next-reference')
        .then((d) => setForm((f) => (f ? { ...f, reference: f.reference || d.reference } : f)))
        .catch(() => {});
      setLignes(resultat.lignes.map((l, i) => ({
        ...l,
        cle: `${i}-${l.reference}`,
        typeMug: modeleDe(l)?.typeMug || (produits.includes(TYPE_PAR_DEFAUT) ? TYPE_PAR_DEFAUT : ''),
      })));
    } catch (err) {
      toast.error(`Lecture du fichier impossible : ${err.message}`);
    } finally {
      setLecture(false);
    }
  };

  const recommencer = () => { setDemande(null); setAnalyse(null); setLignes([]); setAjouts({}); };
  const majLigne = (cle, champ, valeur) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)));
  const retirerLigne = (cle) => setLignes((ls) => ls.filter((l) => l.cle !== cle));

  // Visuel absent : on dépose son fichier d'impression ici, il entre dans la base
  // de données (référence et désignation de la demande) et la ligne le reprend.
  const ajouterFichier = async (ligne, fichier) => {
    if (!estFichierModele(fichier)) {
      toast.error('Fichier d’impression attendu : PDF ou image (JPG, PNG, WEBP, GIF).');
      return;
    }
    setAjouts((a) => ({ ...a, [ligne.cle]: 'en-cours' }));
    try {
      const modele = await enregistrerModele({
        reference: ligne.reference,
        nom: ligne.designation || ligne.reference,
        client: form.client,
        typeMug: ligne.typeMug,
        fichier,
      });
      onModeleAjoute(modele);
      setAjouts((a) => ({ ...a, [ligne.cle]: 'ok' }));
      toast.success(<><strong>{ligne.reference}</strong> ajouté à la base de données</>);
    } catch (err) {
      setAjouts((a) => { const { [ligne.cle]: _, ...reste } = a; return reste; });
      toast.error(`${ligne.reference} : ${err.message}`);
    }
  };
  const glisser = (ligne, actif) => (e) => {
    if (!isAdmin || modeleDe(ligne)?.fichierChemin) return;
    // Passage d'une cellule à l'autre de la même ligne : on reste « au-dessus ».
    if (!actif && e.currentTarget.contains(e.relatedTarget)) return;
    e.preventDefault();
    setSurvol(actif ? ligne.cle : null);
  };
  const deposerSurLigne = (ligne) => (e) => {
    if (!isAdmin || modeleDe(ligne)?.fichierChemin) return;
    e.preventDefault();
    setSurvol(null);
    const fichier = e.dataTransfer.files?.[0];
    if (fichier && ajouts[ligne.cle] !== 'en-cours') ajouterFichier(ligne, fichier);
  };

  const avecFichier = modeles.filter((m) => m.fichierChemin);
  const prochesDe = (l) => modelesProches(l.reference, avecFichier);
  const trouvees = lignes.filter((l) => modeleDe(l)?.fichierChemin);
  const manquantes = lignes.filter((l) => !modeleDe(l)?.fichierChemin);
  const aVerifier = manquantes.filter((l) => prochesDe(l).length > 0).length;
  const absentes = manquantes.length - aVerifier;
  const total = lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0);

  const creer = async () => {
    if (!form.client.trim()) { toast.error('Indiquez le client.'); return; }
    setBusy(true);
    try {
      const { commande, fichiers } = await api.post('/modeles/commande', {
        ...form,
        numero: analyse.numero,
        type: analyse.numero ? analyse.type : null,
        lignes: lignes.map(({ reference, choix, designation, quantite, typeMug }) => ({ reference: choix ?? reference, designation, quantite, typeMug })),
      });
      // La demande du client rejoint les documents de la commande. Selon le poste, un CSV
      // arrive sans type ou en texte brut : on lui donne celui que le serveur attend.
      const type = typeTableur(demande);
      const piece = type ? new File([demande], demande.name, { type }) : demande;
      try {
        await envoyerFichiers({ commandeId: commande.id, categorie: 'document', files: [piece] });
      } catch (err) {
        toast.error(`Commande créée, mais la demande n’a pas pu être jointe : ${err.message}`);
      }
      toast.success(<>Commande <strong>{commande.reference}</strong> créée · {plural(fichiers, 'fichier')} d’impression associé{fichiers > 1 ? 's' : ''}</>);
      navigate(`/commandes/${commande.id}`);
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (!analyse) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><FileSearch />Demande client</h2>
          <span className="card-subtitle">La commande est préparée avec le bon fichier d’impression sur chaque ligne</span>
        </div>
        <div className="card-body">
          <ZoneDepot
            accept={ACCEPT_DEMANDES}
            onFichiers={lire}
            busy={lecture}
            icone={<FileSearch />}
            titre={lecture ? 'Lecture de la demande…' : 'Déposez la demande (PDF, Excel ou CSV)'}
            aide="Les références et les quantités sont lues automatiquement, puis retrouvées dans la base de données."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title"><FileSearch />{analyse.numero ? `${analyse.type} ${analyse.numero}` : demande.name}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={recommencer} disabled={busy}><RotateCcw />Autre fichier</button>
      </div>
      <div className="card-body stack">
        <div className="demande-resume">
          {analyse.societe && <span className="badge">{analyse.societe}</span>}
          <span className="badge">{plural(lignes.length, 'ligne')} · {fmtNumber(total)} mugs</span>
          <span className="badge badge-success"><CircleCheck />{plural(trouvees.length, 'modèle trouvé', 'modèles trouvés')}</span>
          {aVerifier > 0 && <span className="badge badge-warning"><TriangleAlert />{aVerifier} à vérifier</span>}
          {absentes > 0 && <span className="badge badge-warning"><TriangleAlert />{absentes} absent{absentes > 1 ? 's' : ''} de la base</span>}
          {analyse.dateExpedition && <span className="badge">Expédition demandée : {analyse.dateExpedition}</span>}
        </div>

        <ChampsCommande form={form} setForm={setForm} suggestions={clientsConnus} />

        <section className="form-section">
          <h3 className="form-section-title"><Layers />Lignes de production</h3>
          <div className="table-wrap">
            <table className="table demande-table">
              <thead>
                <tr>
                  <th className="col-apercu" aria-label="Aperçu" />
                  <th>Réf.</th>
                  <th>Modèle</th>
                  <th>Type de mug</th>
                  <th className="num">Qté</th>
                  <th aria-label="Retirer" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => {
                  const m = modeleDe(l);
                  const ok = Boolean(m?.fichierChemin);
                  const proches = ok ? [] : prochesDe(l);
                  const enCours = ajouts[l.cle] === 'en-cours';
                  return (
                    <tr key={l.cle} className={`${ok ? '' : 'is-missing'}${survol === l.cle ? ' is-drop' : ''}`}
                        onDragOver={glisser(l, true)} onDragLeave={glisser(l, false)} onDrop={deposerSurLigne(l)}>
                      <td className="col-apercu">
                        {ok || (proches.length > 0 && !enCours && survol !== l.cle)
                          ? (
                            <a href={urlFichier(ok ? m : proches[0])} target="_blank" rel="noopener noreferrer" title="Ouvrir le fichier d’impression">
                              <Apercu modele={ok ? m : proches[0]} />
                            </a>
                          )
                          : <span className="modele-sans-apercu">{enCours ? <LoaderCircle className="spin" /> : (survol === l.cle ? <Upload /> : <TriangleAlert />)}</span>}
                      </td>
                      <td className="nowrap"><span className="ref">{l.reference}</span></td>
                      <td>
                        <span className="cell-main">{ok ? m.nom : (l.designation || '—')}</span>
                        {ok && (
                          <span className="cell-sub">
                            <Check size={13} className="text-success" /> {ajouts[l.cle] === 'ok' ? 'Ajouté à la base · ' : ''}{m.fichierNom}
                          </span>
                        )}
                        {ok && l.choix && (
                          <span className="ligne-ajout">
                            <span className="cell-sub">Référence de la base : {m.reference}</span>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => majLigne(l.cle, 'choix', undefined)}>Annuler</button>
                          </span>
                        )}
                        {proches.length > 0 && (
                          <span className="ligne-ajout">
                            <span className="cell-sub text-warning">Référence différente, s’agit-il de :</span>
                            {proches.map((p) => (
                              <button key={p.id} type="button" className="btn btn-secondary btn-xs" onClick={() => majLigne(l.cle, 'choix', p.reference)}>
                                <Check />{p.reference}
                              </button>
                            ))}
                          </span>
                        )}
                        {!ok && !isAdmin && proches.length === 0 && (
                          <span className="cell-sub text-warning">Absent de la base : la ligne sera créée sans fichier, à ajouter ensuite</span>
                        )}
                        {!ok && isAdmin && (
                          <span className="ligne-ajout">
                            <span className="cell-sub text-warning">
                              {survol === l.cle ? 'Lâchez le fichier pour l’ajouter à la base'
                                : `${proches.length > 0 ? 'Sinon' : 'Absent de la base'} : glissez son fichier ici, ou`}
                            </span>
                            <BoutonFichier busy={enCours} onFichier={(f) => ajouterFichier(l, f)} />
                          </span>
                        )}
                      </td>
                      <td>
                        <select value={l.typeMug} onChange={(e) => majLigne(l.cle, 'typeMug', e.target.value)} aria-label={`Type de mug pour ${l.reference}`}>
                          <option value="">—</option>
                          {produits.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td className="num">
                        <input type="number" min="0" className="input-qte" value={l.quantite}
                               onChange={(e) => majLigne(l.cle, 'quantite', e.target.value)} aria-label={`Quantité pour ${l.reference}`} />
                      </td>
                      <td className="num">
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => retirerLigne(l.cle)}
                                title="Retirer cette ligne" aria-label={`Retirer ${l.reference}`}><X /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <ChampNotes form={form} setForm={setForm} />

        <div className="demande-actions">
          <span className="muted">Les fichiers d’impression sont copiés sur chaque ligne, et la demande est jointe aux documents.</span>
          <button type="button" className="btn btn-primary" onClick={creer} disabled={busy || lignes.length === 0}>
            {busy ? <LoaderCircle className="spin" /> : <PackagePlus />}Créer la commande<ArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import de modèles (ADMIN) ────────────────────────────────

function ImportModal({ modeles, produits, onClose, onDone }) {
  const toast = useToast();
  const existants = useMemo(() => new Map(modeles.map((m) => [cleRef(m.reference), m.reference])), [modeles]);
  const clientsConnus = useMemo(() => [...new Set(modeles.map((m) => m.client).filter(Boolean))].sort(), [modeles]);
  // Jamais prérempli : un client choisi d'office finit sur les modèles d'un autre.
  const [client, setClient] = useState('');
  const [typeMug, setTypeMug] = useState(produits.includes(TYPE_PAR_DEFAUT) ? TYPE_PAR_DEFAUT : '');
  const [fichiers, setFichiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(0);
  const [total, setTotal] = useState(0); // fixé au lancement (la liste à importer raccourcit en cours de route)

  const ajouter = (liste) => setFichiers((avant) => [
    ...avant,
    ...liste
      .filter((file) => !avant.some((a) => a.file.name === file.name && a.file.size === file.size))
      .map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, ...lireNomFichier(file.name), etat: null, message: '' })),
  ]);
  const maj = (id, champs) => setFichiers((fs) => fs.map((f) => (f.id === id ? { ...f, ...champs } : f)));

  const refs = fichiers.map((f) => normRef(f.reference));
  const cles = refs.map(cleRef);
  const aImporter = fichiers.filter((f) => dossierRef(f.reference) && f.etat !== 'ok');
  const etat = (f, i) => {
    if (f.etat === 'ok') {
      return f.sansApercu
        ? <span className="text-warning nowrap"><TriangleAlert size={14} /> Importé sans aperçu</span>
        : <span className="text-success nowrap"><CircleCheck size={14} /> Importé</span>;
    }
    if (f.etat === 'en-cours') return <span className="nowrap"><LoaderCircle size={14} className="spin" /> Envoi…</span>;
    if (f.etat === 'erreur') return <span className="text-danger">{f.message}</span>;
    const ref = refs[i];
    if (!ref) return <span className="muted">Pas de référence : ignoré</span>;
    if (!dossierRef(ref)) return <span className="text-danger">Référence sans lettre ni chiffre : ignoré</span>;
    if (cles.indexOf(cles[i]) !== i) return <span className="text-warning">En double : remplace le précédent</span>;
    const existant = existants.get(cles[i]);
    if (!existant) return <span className="muted">Nouveau</span>;
    return <span className="text-warning">{existant === ref ? 'Remplace le modèle existant' : `Remplace ${existant}`}</span>;
  };

  const importer = async () => {
    setBusy(true);
    setFait(0);
    setTotal(aImporter.length);
    let erreurs = 0;
    for (const f of aImporter) {
      maj(f.id, { etat: 'en-cours', message: '' });
      try {
        const modele = await enregistrerModele({ reference: normRef(f.reference), nom: f.nom, client, typeMug, fichier: f.file });
        maj(f.id, { etat: 'ok', sansApercu: !modele.apercuChemin });
      } catch (err) {
        erreurs += 1;
        maj(f.id, { etat: 'erreur', message: err.message });
      }
      setFait((n) => n + 1);
    }
    setBusy(false);
    onDone();
    if (erreurs) toast.error(`${erreurs} fichier${erreurs > 1 ? 's' : ''} non importé${erreurs > 1 ? 's' : ''} : voir le détail.`);
    else toast.success(`${plural(aImporter.length, 'modèle importé', 'modèles importés')}`);
  };

  const termine = fichiers.length > 0 && aImporter.length === 0 && fichiers.some((f) => f.etat === 'ok');

  return (
    <Modal
      title="Importer des modèles"
      description="Par défaut, la référence est le nom du fichier (« MUG 488GS01.pdf » → MUG 488GS01). Une référence en tête de nom est reconnue (« 104HE-22 Mug Je t’aime.pdf » → 104HE-22). Corrigez-la dans la liste, ou videz-la pour ignorer le fichier. Une référence déjà présente est remplacée."
      icon={<Upload />}
      size="lg"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{termine ? 'Fermer' : 'Annuler'}</button>
          {!termine && (
            <button type="button" className="btn btn-primary" onClick={importer} disabled={busy || aImporter.length === 0 || !client.trim()}>
              {busy ? <><LoaderCircle className="spin" />{fait} / {total}…</> : <><Upload />Importer {plural(aImporter.length, 'modèle')}</>}
            </button>
          )}
        </>
      )}
    >
      <div className="stack">
        <ZoneDepot
          accept={ACCEPT_MODELES}
          multiple
          onFichiers={ajouter}
          busy={busy}
          icone={<Upload />}
          titre="Glissez-déposez les fichiers d’impression"
          aide="PDF ou images · plusieurs fichiers à la fois · une vignette est créée pour chacun"
        />
        {busy && <div className="progress"><div className="progress-bar" style={{ width: `${total ? (fait / total) * 100 : 0}%` }} /></div>}
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Client <span className="req">*</span></span>
            <input value={client} list="clients-import" placeholder="ex. HEULA" onChange={(e) => setClient(e.target.value)} disabled={busy} />
            <datalist id="clients-import">{clientsConnus.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">
            <span className="field-label">Type de mug</span>
            <select value={typeMug} onChange={(e) => setTypeMug(e.target.value)} disabled={busy}>
              <option value="">—</option>
              {produits.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        {fichiers.length > 0 && (
          <div className="table-wrap import-table">
            <table className="table">
              <thead><tr><th>Fichier</th><th>Référence</th><th>Nom</th><th>État</th></tr></thead>
              <tbody>
                {fichiers.map((f, i) => (
                  <tr key={f.id}>
                    <td className="cell-trunc import-fichier" title={f.file.name}>{f.file.name}<span className="cell-sub">{fmtSize(f.file.size)}</span></td>
                    <td><input value={f.reference} onChange={(e) => maj(f.id, { reference: e.target.value, etat: null, message: '' })} disabled={busy || f.etat === 'ok'} placeholder="ex. 104HE-22" /></td>
                    <td><input value={f.nom} onChange={(e) => maj(f.id, { nom: e.target.value })} disabled={busy || f.etat === 'ok'} /></td>
                    <td>{etat(f, i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Modification d'un modèle (ADMIN) ─────────────────────────

function EditModal({ modele, produits, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ nom: modele.nom, client: modele.client || '', typeMug: modele.typeMug || '' });
  const [nouveauFichier, setNouveauFichier] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const enregistrer = async () => {
    setBusy(true);
    try {
      if (nouveauFichier) {
        await enregistrerModele({ reference: modele.reference, ...form, fichier: nouveauFichier });
      } else {
        await api.patch(`/modeles/${modele.id}`, form);
      }
      toast.success(`Modèle ${modele.reference} enregistré`);
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Modèle ${modele.reference}`}
      icon={<Pencil />}
      onClose={onClose}
      onSubmit={enregistrer}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle className="spin" />}Enregistrer</button>
        </>
      )}
    >
      <div className="stack">
        <div className="modele-edit-apercu"><Apercu modele={modele} /></div>
        <label className="field">
          <span className="field-label">Nom <span className="req">*</span></span>
          <input value={form.nom} onChange={set('nom')} required />
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Client</span>
            <input value={form.client} onChange={set('client')} placeholder="ex. HEULA" />
          </label>
          <label className="field">
            <span className="field-label">Type de mug</span>
            <select value={form.typeMug} onChange={set('typeMug')}>
              <option value="">—</option>
              {produits.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field-label">Fichier d’impression</span>
          <span className="field-hint">{nouveauFichier ? `Remplacé par « ${nouveauFichier.name} » à l’enregistrement` : `Actuel : ${modele.fichierNom || '—'}`}</span>
          <input type="file" accept={ACCEPT_MODELES} onChange={(e) => setNouveauFichier(e.target.files?.[0] || null)} />
        </label>
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function BaseModeles() {
  usePageTitle('Base de données');
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const toast = useToast();
  const confirmer = useConfirm();
  const [modeles, setModeles] = useState(null);
  const [produits, setProduits] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [client, setClient] = useState('');
  const [importer, setImporter] = useState(false);
  const [edition, setEdition] = useState(null);

  const charger = useCallback(async () => {
    try {
      setModeles((await api.get('/modeles')).modeles.sort(parReference));
    } catch (err) { toast.error(err.message); }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    api.get('/produits').then((d) => setProduits(d.produits.map((p) => p.nom))).catch(() => {});
  }, []);

  // Clients présents dans la base, avec leur nombre de modèles.
  const clients = useMemo(() => {
    const n = new Map();
    for (const m of modeles || []) if (m.client) n.set(m.client, (n.get(m.client) || 0) + 1);
    return [...n].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [modeles]);
  const sansClient = (modeles || []).filter((m) => !m.client).length;
  // Le client choisi peut disparaître (dernier modèle supprimé) : retour à tous les clients.
  const clientActif = (client === SANS_CLIENT ? sansClient > 0 : clients.some(([c]) => c === client)) ? client : '';

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const cle = cleRef(recherche);
    return (modeles || []).filter((m) => (!clientActif || (m.client || SANS_CLIENT) === clientActif) && (!q
      || [m.reference, m.nom, m.client, m.typeMug].some((v) => v?.toLowerCase().includes(q))
      || (cle && cleRef(m.reference).includes(cle))));
  }, [modeles, recherche, clientActif]);

  const supprimer = async (m) => {
    const ok = await confirmer({
      title: `Supprimer le modèle ${m.reference} ?`,
      message: <>« {m.nom} » et son fichier d’impression quitteront la base. Les commandes déjà créées gardent leur copie du fichier.</>,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/modeles/${m.id}`);
      toast.success(`Modèle ${m.reference} supprimé`);
      charger();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <>
      <PageHeader
        title="Base de données"
        subtitle="Les modèles de vos clients et leurs fichiers d’impression. Déposez une demande client : la commande est prête, avec les bons fichiers."
        actions={isAdmin && (
          <button className="btn btn-secondary" onClick={() => setImporter(true)}><Upload />Importer des modèles</button>
        )}
      />

      {modeles && (
        <AnalyseDemande
          modeles={modeles}
          produits={produits}
          isAdmin={isAdmin}
          onModeleAjoute={(m) => setModeles((ms) => [...(ms || []).filter((x) => x.id !== m.id), m].sort(parReference))}
        />
      )}

      <div className="card">
        <div className="toolbar">
          <SearchInput value={recherche} onChange={setRecherche} placeholder="Rechercher (réf., nom, client…)" />
          {clients.length + (sansClient > 0 ? 1 : 0) > 1 && (
            <select className="filtre-client" value={clientActif} onChange={(e) => setClient(e.target.value)} aria-label="Filtrer par client">
              <option value="">Tous les clients ({fmtNumber(modeles.length)})</option>
              {clients.map(([nom, n]) => <option key={nom} value={nom}>{nom} ({fmtNumber(n)})</option>)}
              {sansClient > 0 && <option value={SANS_CLIENT}>Sans client ({fmtNumber(sansClient)})</option>}
            </select>
          )}
          <span className="spacer" />
          {modeles && (
            <span className="toolbar-info"><span><strong>{fmtNumber(filtres.length)}</strong> modèle{filtres.length > 1 ? 's' : ''}{filtres.length !== modeles.length ? ` sur ${fmtNumber(modeles.length)}` : ''}</span></span>
          )}
        </div>

        {!modeles ? <Loading /> : modeles.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="La base est vide"
            text="Importez les fichiers d’impression de vos modèles : chaque fichier nommé par sa référence (ex. « 104HE-22 Mug Je t’aime.pdf ») devient un modèle."
            action={isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setImporter(true)}><Upload />Importer des modèles</button>}
          />
        ) : filtres.length === 0 ? (
          <EmptyState icon={<SearchX />} title="Aucun résultat" text={`Aucun modèle ne correspond à « ${recherche} »${clientActif ? ' pour ce client' : ''}.`} />
        ) : (
          <div className="modeles-grid">
            {filtres.map((m) => (
              <div key={m.id} className="modele-card">
                <a className="modele-apercu" href={urlFichier(m)} target="_blank" rel="noopener noreferrer"
                   title={`Ouvrir le fichier d’impression de ${m.reference}`}>
                  <Apercu modele={m} />
                  <span className="modele-ouvrir"><ExternalLink /></span>
                </a>
                {isAdmin && !m.apercuChemin && m.fichierChemin && (
                  <BoutonApercu modele={m} onCree={(maj) => setModeles((ms) => ms.map((x) => (x.id === maj.id ? maj : x)))} />
                )}
                <div className="modele-infos">
                  <span className="ref">{m.reference}</span>
                  <span className="modele-nom" title={m.nom}>{m.nom}</span>
                  <span className="modele-meta">{[m.client, m.typeMug].filter(Boolean).join(' · ') || '—'}</span>
                </div>
                {isAdmin && (
                  <div className="modele-actions">
                    <button type="button" className="btn btn-secondary btn-icon btn-xs" onClick={() => setEdition(m)}
                            title="Modifier" aria-label={`Modifier ${m.reference}`}><Pencil /></button>
                    <button type="button" className="btn btn-secondary btn-icon btn-xs btn-danger-ghost" onClick={() => supprimer(m)}
                            title="Supprimer" aria-label={`Supprimer ${m.reference}`}><Trash /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {importer && (
        <ImportModal modeles={modeles || []} produits={produits} onClose={() => setImporter(false)} onDone={charger} />
      )}
      {edition && (
        <EditModal modele={edition} produits={produits} onClose={() => setEdition(null)}
                   onSaved={() => { setEdition(null); charger(); }} />
      )}
    </>
  );
}
