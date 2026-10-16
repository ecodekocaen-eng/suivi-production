// ─────────────────────────────────────────────────────────────
//  Base de données des modèles (ex. mugs Heula) :
//   - « Demande de prix » : on dépose le PDF du client, les références et
//     quantités sont lues dans le navigateur, retrouvées dans la base, et la
//     commande est créée avec le bon fichier d'impression sur chaque ligne ;
//   - la base elle-même : vignettes, recherche, import par glisser-déposer (ADMIN).
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database, FileSearch, FileText, TriangleAlert, CircleCheck, Pencil, Trash, Upload, LoaderCircle,
  ExternalLink, X, RotateCcw, SearchX, PackagePlus, ArrowRight, Check,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { plural, fmtNumber, fmtSize } from '../format.js';
import { PageHeader, EmptyState, Loading, SearchInput, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import Modal from '../ui/Modal.jsx';
import { envoyerFichiers, deposerFichierModele } from '../televersement.js';
import { analyserDemande, lireNomFichier, normRef } from '../demandePrix.js';

const ACCEPT_MODELES = 'application/pdf,image/jpeg,image/png,image/webp,image/gif';
const TYPE_PAR_DEFAUT = 'MUG BLANC';

const version = (m) => encodeURIComponent(m.updatedAt || '');
const urlApercu = (m) => `/api/modeles/${m.id}/apercu?v=${version(m)}`;
const urlFichier = (m) => `/api/modeles/${m.id}/fichier?v=${version(m)}`;
// Tri naturel : 104HE-2 avant 104HE-10.
const parReference = (a, b) => a.reference.localeCompare(b.reference, 'fr', { numeric: true });

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

// ── Demande de prix → commande ───────────────────────────────

function AnalyseDemande({ modeles, produits }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [pdf, setPdf] = useState(null);
  const [lecture, setLecture] = useState(false);
  const [analyse, setAnalyse] = useState(null);
  const [form, setForm] = useState({ client: '', nom: '', dateSortie: '' });
  const [lignes, setLignes] = useState([]);
  const [busy, setBusy] = useState(false);

  const parRef = useMemo(() => new Map(modeles.map((m) => [m.reference, m])), [modeles]);
  const clientsConnus = useMemo(
    () => [...new Set([...modeles.map((m) => m.client), analyse?.societe].filter(Boolean))].sort(),
    [modeles, analyse],
  );

  const lire = async ([fichier]) => {
    if (!fichier) return;
    if (fichier.type !== 'application/pdf' && !/\.pdf$/i.test(fichier.name)) {
      toast.error('Déposez la demande de prix au format PDF.');
      return;
    }
    setLecture(true);
    try {
      const { lignesDuPdf } = await import('../pdf.js');
      const resultat = analyserDemande(await lignesDuPdf(fichier));
      if (resultat.lignes.length === 0) {
        toast.error('Aucune ligne « [référence] désignation … quantité » trouvée dans ce PDF.');
        return;
      }
      // Client : celui des modèles retrouvés (ex. HEULA), sinon la société du PDF.
      const clientsModeles = resultat.lignes.map((l) => parRef.get(l.reference)?.client).filter(Boolean);
      const client = clientsModeles.sort((a, b) => clientsModeles.filter((c) => c === b).length - clientsModeles.filter((c) => c === a).length)[0]
        || resultat.societe || '';
      setPdf(fichier);
      setAnalyse(resultat);
      setForm({
        client,
        nom: resultat.numero ? `Demande de prix ${resultat.numero}` : fichier.name.replace(/\.pdf$/i, ''),
        dateSortie: resultat.dateExpedition || '',
      });
      setLignes(resultat.lignes.map((l, i) => ({
        ...l,
        cle: `${i}-${l.reference}`,
        typeMug: parRef.get(l.reference)?.typeMug || (produits.includes(TYPE_PAR_DEFAUT) ? TYPE_PAR_DEFAUT : ''),
      })));
    } catch (err) {
      toast.error(`Lecture du PDF impossible : ${err.message}`);
    } finally {
      setLecture(false);
    }
  };

  const recommencer = () => { setPdf(null); setAnalyse(null); setLignes([]); };
  const majLigne = (cle, champ, valeur) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)));
  const retirerLigne = (cle) => setLignes((ls) => ls.filter((l) => l.cle !== cle));

  const trouvees = lignes.filter((l) => parRef.get(l.reference)?.fichierChemin);
  const absentes = lignes.filter((l) => !parRef.get(l.reference)?.fichierChemin);
  const total = lignes.reduce((s, l) => s + (Number(l.quantite) || 0), 0);

  const creer = async () => {
    if (!form.client.trim()) { toast.error('Indiquez le client.'); return; }
    setBusy(true);
    try {
      const { commande, fichiers } = await api.post('/modeles/commande', {
        client: form.client,
        nom: form.nom,
        numero: analyse.numero,
        dateSortieTexte: form.dateSortie,
        lignes: lignes.map(({ reference, designation, quantite, typeMug }) => ({ reference, designation, quantite, typeMug })),
      });
      // La demande de prix du client rejoint les documents de la commande.
      try {
        await envoyerFichiers({ commandeId: commande.id, categorie: 'document', files: [pdf] });
      } catch (err) {
        toast.error(`Commande créée, mais la demande de prix n’a pas pu être jointe : ${err.message}`);
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
          <h2 className="card-title"><FileSearch />Demande de prix</h2>
          <span className="card-subtitle">La commande est préparée avec le bon fichier d’impression sur chaque ligne</span>
        </div>
        <div className="card-body">
          <ZoneDepot
            accept="application/pdf"
            onFichiers={lire}
            busy={lecture}
            icone={<FileSearch />}
            titre={lecture ? 'Lecture de la demande de prix…' : 'Déposez la demande de prix (PDF)'}
            aide="Les références et les quantités sont lues automatiquement, puis retrouvées dans la base de données."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title"><FileSearch />{analyse.numero ? `Demande de prix ${analyse.numero}` : pdf.name}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={recommencer} disabled={busy}><RotateCcw />Autre PDF</button>
      </div>
      <div className="card-body stack">
        <div className="demande-resume">
          {analyse.societe && <span className="badge">{analyse.societe}</span>}
          <span className="badge">{plural(lignes.length, 'ligne')} · {fmtNumber(total)} mugs</span>
          <span className="badge badge-success"><CircleCheck />{plural(trouvees.length, 'modèle trouvé', 'modèles trouvés')}</span>
          {absentes.length > 0 && (
            <span className="badge badge-warning"><TriangleAlert />{absentes.length} absent{absentes.length > 1 ? 's' : ''} de la base</span>
          )}
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Client <span className="req">*</span></span>
            <input value={form.client} list="clients-connus" onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} />
            <datalist id="clients-connus">{clientsConnus.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="field">
            <span className="field-label">Nom de la commande</span>
            <input value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} />
          </label>
          <label className="field">
            <span className="field-label">Date de sortie</span>
            <input value={form.dateSortie} placeholder="jj/mm/aaaa ou ASAP" onChange={(e) => setForm((f) => ({ ...f, dateSortie: e.target.value }))} />
            {analyse.dateExpedition && <span className="field-hint">Expédition demandée par le client : {analyse.dateExpedition}</span>}
          </label>
        </div>

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
                const m = parRef.get(l.reference);
                const ok = Boolean(m?.fichierChemin);
                return (
                  <tr key={l.cle} className={ok ? '' : 'is-missing'}>
                    <td className="col-apercu">
                      {ok
                        ? <a href={urlFichier(m)} target="_blank" rel="noopener noreferrer" title="Ouvrir le fichier d’impression"><Apercu modele={m} /></a>
                        : <span className="modele-sans-apercu"><TriangleAlert /></span>}
                    </td>
                    <td className="nowrap"><span className="ref">{l.reference}</span></td>
                    <td>
                      <span className="cell-main">{ok ? m.nom : (l.designation || '—')}</span>
                      {ok
                        ? <span className="cell-sub"><Check size={13} className="text-success" /> {m.fichierNom}</span>
                        : <span className="cell-sub text-warning">Absent de la base : la ligne sera créée sans fichier, à ajouter ensuite</span>}
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

        <div className="demande-actions">
          <span className="muted">Les fichiers d’impression sont copiés sur chaque ligne, et la demande de prix est jointe aux documents.</span>
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
  const existants = useMemo(() => new Set(modeles.map((m) => m.reference)), [modeles]);
  const clientFrequent = useMemo(() => {
    const n = {};
    for (const m of modeles) if (m.client) n[m.client] = (n[m.client] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }, [modeles]);
  const [client, setClient] = useState(clientFrequent);
  const [typeMug, setTypeMug] = useState(produits.includes(TYPE_PAR_DEFAUT) ? TYPE_PAR_DEFAUT : '');
  const [fichiers, setFichiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(0);

  const ajouter = (liste) => setFichiers((avant) => [
    ...avant,
    ...liste
      .filter((file) => !avant.some((a) => a.file.name === file.name && a.file.size === file.size))
      .map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, file, ...lireNomFichier(file.name), etat: null, message: '' })),
  ]);
  const maj = (id, champs) => setFichiers((fs) => fs.map((f) => (f.id === id ? { ...f, ...champs } : f)));

  const refs = fichiers.map((f) => normRef(f.reference));
  const aImporter = fichiers.filter((f) => normRef(f.reference) && f.etat !== 'ok');
  const etat = (f, i) => {
    if (f.etat === 'ok') return <span className="text-success nowrap"><CircleCheck size={14} /> Importé</span>;
    if (f.etat === 'en-cours') return <span className="nowrap"><LoaderCircle size={14} className="spin" /> Envoi…</span>;
    if (f.etat === 'erreur') return <span className="text-danger">{f.message}</span>;
    const ref = refs[i];
    if (!ref) return <span className="muted">Pas de référence : ignoré</span>;
    if (refs.indexOf(ref) !== i) return <span className="text-warning">En double : remplace le précédent</span>;
    return existants.has(ref) ? <span className="text-warning">Remplace le modèle existant</span> : <span className="muted">Nouveau</span>;
  };

  const importer = async () => {
    setBusy(true);
    setFait(0);
    let erreurs = 0;
    for (const f of aImporter) {
      maj(f.id, { etat: 'en-cours', message: '' });
      try {
        const reference = normRef(f.reference);
        const chemin = await deposerFichierModele(reference, f.file);
        let apercu = null;
        try {
          const { vignette } = await import('../pdf.js');
          const image = await vignette(f.file);
          apercu = { pathname: await deposerFichierModele(reference, new File([image], 'apercu.jpg', { type: 'image/jpeg' })) };
        } catch (err) {
          console.warn('Vignette impossible :', f.file.name, err);
        }
        await api.post('/modeles', {
          reference, nom: f.nom, client, typeMug, fichier: { pathname: chemin, nom: f.file.name }, apercu,
        });
        maj(f.id, { etat: 'ok' });
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
      description="La référence et le nom sont lus dans le nom de chaque fichier (ex. « 104HE-22 Mug Je t’aime 225x95.pdf »). Une référence déjà présente est remplacée."
      icon={<Upload />}
      size="lg"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{termine ? 'Fermer' : 'Annuler'}</button>
          {!termine && (
            <button type="button" className="btn btn-primary" onClick={importer} disabled={busy || aImporter.length === 0}>
              {busy ? <><LoaderCircle className="spin" />{fait} / {aImporter.length}…</> : <><Upload />Importer {plural(aImporter.length, 'modèle')}</>}
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
        {busy && <div className="progress"><div className="progress-bar" style={{ width: `${aImporter.length ? (fait / aImporter.length) * 100 : 0}%` }} /></div>}
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Client</span>
            <input value={client} placeholder="ex. HEULA" onChange={(e) => setClient(e.target.value)} disabled={busy} />
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
                    <td><input value={f.reference} onChange={(e) => maj(f.id, { reference: e.target.value })} disabled={busy || f.etat === 'ok'} placeholder="ex. 104HE-22" /></td>
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
        const chemin = await deposerFichierModele(modele.reference, nouveauFichier);
        let apercu = null;
        try {
          const { vignette } = await import('../pdf.js');
          apercu = { pathname: await deposerFichierModele(modele.reference, new File([await vignette(nouveauFichier)], 'apercu.jpg', { type: 'image/jpeg' })) };
        } catch (err) { console.warn('Vignette impossible :', err); }
        await api.post('/modeles', { reference: modele.reference, ...form, fichier: { pathname: chemin, nom: nouveauFichier.name }, apercu });
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

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!modeles || !q) return modeles || [];
    return modeles.filter((m) => [m.reference, m.nom, m.client, m.typeMug].some((v) => v?.toLowerCase().includes(q)));
  }, [modeles, recherche]);

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
        subtitle="Les modèles de vos clients et leurs fichiers d’impression. Déposez une demande de prix : la commande est prête, avec les bons fichiers."
        actions={isAdmin && (
          <button className="btn btn-secondary" onClick={() => setImporter(true)}><Upload />Importer des modèles</button>
        )}
      />

      {modeles && <AnalyseDemande modeles={modeles} produits={produits} />}

      <div className="card">
        <div className="toolbar">
          <SearchInput value={recherche} onChange={setRecherche} placeholder="Rechercher (réf., nom, client…)" />
          <span className="spacer" />
          {modeles && (
            <span className="toolbar-info"><span><strong>{fmtNumber(filtres.length)}</strong> modèle{filtres.length > 1 ? 's' : ''}{recherche ? ` sur ${fmtNumber(modeles.length)}` : ''}</span></span>
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
          <EmptyState icon={<SearchX />} title="Aucun résultat" text={`Aucun modèle ne correspond à « ${recherche} ».`} />
        ) : (
          <div className="modeles-grid">
            {filtres.map((m) => (
              <div key={m.id} className="modele-card">
                <a className="modele-apercu" href={urlFichier(m)} target="_blank" rel="noopener noreferrer"
                   title={`Ouvrir le fichier d’impression de ${m.reference}`}>
                  <Apercu modele={m} />
                  <span className="modele-ouvrir"><ExternalLink /></span>
                </a>
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
