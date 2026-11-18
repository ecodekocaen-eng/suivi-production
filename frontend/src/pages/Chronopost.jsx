// ─────────────────────────────────────────────────────────────
//  Administration › Chronopost : étiquettes d'expédition du suivi des mugs sur
//  le contrat Chronopost d'Objetlia. Mode (Arrêté / Test / Réel), compte et mot
//  de passe du service web (saisis ici par un admin, jamais réaffichés), expéditeurs
//  (atelier habituel, particuliers comme OBJETRAMA ; jamais l’ESAT) et clé de l’agent de la Zebra.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Truck, KeyRound, MapPin, Printer, LoaderCircle, PlugZap, Save, Copy, TriangleAlert, Check, Info, Plus, Trash } from 'lucide-react';
import { api } from '../api.js';
import { fmtDateTime, fmtRelative } from '../format.js';
import { PageHeader, Loading, Segmented, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';

const MODES = [
  { value: 'off', label: 'Arrêté' },
  { value: 'test', label: 'Test' },
  { value: 'reel', label: 'Réel' },
];
const EXPLICATIONS = {
  off: 'Aucune étiquette Chronopost ne peut être créée. Les étiquettes importées (palette…) restent possibles.',
  test: 'Étiquettes « SPECIMEN » sur le compte d’essai publié par Chronopost : rien n’est facturé ni expédié. Pour essayer la Zebra et les PDF.',
  reel: 'Vraies étiquettes sur le contrat : chaque carton expédié est facturé par Chronopost.',
};
const CHAMPS = [
  { k: 'nom', label: 'Société', req: true, max: 35 },
  { k: 'contact', label: 'Contact', max: 35 },
  { k: 'adresse1', label: 'Adresse', req: true, full: true },
  { k: 'adresse2', label: 'Complément', full: true },
  { k: 'cp', label: 'Code postal', req: true, max: 5 },
  { k: 'ville', label: 'Ville', req: true, max: 30 },
  { k: 'telephone', label: 'Téléphone', req: true },
  { k: 'email', label: 'E-mail' },
];
// Agent vu depuis moins de 2 minutes : en ligne (il passe toutes les 15 s, noté au plus une fois par minute).
const EN_LIGNE_MS = 2 * 60 * 1000;
const PARTICULIERS_MAX = 10;
const ADRESSE_VIDE = { nom: '', contact: '', adresse1: '', adresse2: '', cp: '', ville: '', pays: 'FR', telephone: '', email: '' };

function Adresse({ titre, sous, valeur, onChange, onRetirer = null }) {
  return (
    <section className="form-section">
      <h3 className="form-section-title"><MapPin />{titre}
        {onRetirer && <button type="button" className="btn btn-ghost btn-xs expe-retirer" onClick={onRetirer}><Trash />Retirer</button>}
      </h3>
      {sous && <p className="field-hint">{sous}</p>}
      <div className="form-grid">
        {onRetirer && (
          <label className="field field-full">
            <span className="field-label">Clients concernés</span>
            <input value={valeur.clients || ''} onChange={(e) => onChange({ ...valeur, clients: e.target.value })} placeholder="ex : OBJETRAMA" />
            <span className="field-hint">Choisi tout seul quand le nom du client de la commande contient un de ces noms (plusieurs : séparés par des virgules).</span>
          </label>
        )}
        {CHAMPS.map((c) => (
          <label className={`field${c.full ? ' field-full' : ''}`} key={c.k}>
            <span className="field-label">{c.label}{c.req && <span className="req"> *</span>}</span>
            <input value={valeur[c.k] || ''} maxLength={c.max} onChange={(e) => onChange({ ...valeur, [c.k]: e.target.value })} />
          </label>
        ))}
      </div>
    </section>
  );
}

export default function Chronopost() {
  usePageTitle('Chronopost');
  const toast = useToast();
  const confirmer = useConfirm();
  const [etat, setEtat] = useState(null); // réponse du serveur
  const [form, setForm] = useState(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [busy, setBusy] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [prix, setPrix] = useState(null);
  const [cle, setCle] = useState(null);

  const charger = useCallback(async () => {
    const d = await api.get('/chronopost');
    setEtat(d);
    setForm(d.reglages);
  }, []);
  useEffect(() => { charger().catch((e) => setErreur(e.message)); }, [charger]);

  if (!form) return erreur ? <div className="alert alert-error"><TriangleAlert /><span>{erreur}</span></div> : <Loading />;

  const set = (k, v) => { setErreur(null); setForm((f) => ({ ...f, [k]: v })); };
  const setAdresse = (qui, v) => { setErreur(null); setForm((f) => ({ ...f, expediteurs: { ...f.expediteurs, [qui]: v } })); };
  const setParticuliers = (maj) => { setErreur(null); setForm((f) => ({ ...f, expediteurs: { ...f.expediteurs, particuliers: maj(f.expediteurs.particuliers) } })); };
  const setParticulier = (i, v) => setParticuliers((liste) => liste.map((p, j) => (j === i ? v : p)));
  const retirerParticulier = (i) => setParticuliers((liste) => liste.filter((_, j) => j !== i));
  const ajouterParticulier = () => setParticuliers((liste) => [...liste, { ...ADRESSE_VIDE, clients: '' }]);

  const enregistrer = async (e) => {
    e?.preventDefault();
    if (form.etat === 'reel' && etat.reglages.etat !== 'reel') {
      const ok = await confirmer({
        title: 'Passer en mode Réel ?',
        message: 'Les étiquettes créées ensuite seront de vraies étiquettes sur le contrat Chronopost : chaque carton expédié sera facturé.',
        confirmLabel: 'Passer en Réel',
        icon: <Truck />,
      });
      if (!ok) return;
    }
    setBusy('enregistrer'); setErreur(null);
    try {
      const d = await api.put('/chronopost', { ...form, motDePasse: motDePasse || undefined });
      setEtat(d); setForm(d.reglages); setMotDePasse('');
      toast.success('Réglages Chronopost enregistrés');
    } catch (err) { setErreur(err.message); }
    finally { setBusy(null); }
  };

  const tester = async () => {
    setBusy('tester'); setPrix(null); setErreur(null);
    try { setPrix(await api.post('/chronopost/tester')); }
    catch (err) { setErreur(err.message); }
    finally { setBusy(null); }
  };

  const nouvelleCle = async () => {
    if (etat.agent.cle) {
      const ok = await confirmer({
        title: 'Créer une nouvelle clé ?',
        message: 'L’ancienne clé cesse aussitôt de marcher : l’agent du PC atelier n’imprimera plus rien tant que la nouvelle n’y est pas copiée.',
        confirmLabel: 'Créer une clé', tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy('cle');
    try { setCle((await api.post('/chronopost/cle-agent')).cle); await charger(); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(null); }
  };

  const vu = etat.agent.vu ? new Date(etat.agent.vu) : null;
  const enLigne = vu && Date.now() - vu.getTime() < EN_LIGNE_MS;
  const modifie = JSON.stringify(form) !== JSON.stringify(etat.reglages) || motDePasse !== '';

  return (
    <>
      <PageHeader
        title="Chronopost"
        subtitle="Étiquettes d’expédition des commandes, sur le contrat Chronopost d’Objetlia."
      />
      <form className="stack" onSubmit={enregistrer}>
        <div className="card">
          <div className="card-header"><h2 className="card-title"><KeyRound />Compte et mode</h2></div>
          <div className="card-body stack">
            <div className="field">
              <span className="field-label">Mode</span>
              <Segmented value={form.etat} onChange={(v) => set('etat', v)} options={MODES} label="Mode" />
              <span className="field-hint">{EXPLICATIONS[form.etat]}</span>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">N° de compte</span>
                <input value={form.compte} onChange={(e) => set('compte', e.target.value)} inputMode="numeric" maxLength={8} className="mono" placeholder="8 chiffres" />
              </label>
              <label className="field">
                <span className="field-label">Sous-compte</span>
                <input value={form.sousCompte} onChange={(e) => set('sousCompte', e.target.value)} className="mono" placeholder="Facultatif" />
              </label>
              <label className="field">
                <span className="field-label">Mot de passe du service web</span>
                <input type="password" value={motDePasse} onChange={(e) => { setErreur(null); setMotDePasse(e.target.value); }}
                       autoComplete="new-password" placeholder={etat.motDePasse ? 'Enregistré (laisser vide pour le garder)' : 'À saisir'} />
                <span className="field-hint">{etat.motDePasse ? <><Check size={12} /> Enregistré, chiffré, jamais réaffiché.</> : 'Vérifié auprès de Chronopost avant d’être gardé.'}</span>
              </label>
              <label className="field">
                <span className="field-label">Produit</span>
                <select value={form.produit} onChange={(e) => set('produit', e.target.value)}>
                  {Object.entries(etat.produits).map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <button type="button" className="btn btn-secondary btn-sm" onClick={tester} disabled={busy != null || modifie}
                      title={modifie ? 'Enregistrez d’abord vos changements' : 'Calcule le prix d’un colis de 1 kg vers Paris : rien n’est créé'}>
                {busy === 'tester' ? <LoaderCircle className="spin" /> : <PlugZap />}Tester la connexion
              </button>
              {prix && (
                <span className="badge badge-success"><Check />{prix.compte === 'essai'
                  ? 'Compte d’essai de Chronopost joint (il ne donne pas de prix)'
                  : `Contrat OK · ${prix.produit}, 1 kg vers Paris : ${prix.montantHT.toFixed(2).replace('.', ',')} € HT`}</span>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title"><MapPin />Expéditeurs</h2></div>
          <div className="card-body adresses-depart">
            <Adresse titre="Atelier · expéditeur habituel"
                     sous="Imprimé sur les étiquettes, qu’elles partent de l’atelier ou de l’ESAT : l’ESAT n’apparaît jamais. C’est aussi le titulaire du contrat."
                     valeur={form.expediteurs.atelier} onChange={(v) => setAdresse('atelier', v)} />
            {form.expediteurs.particuliers.map((p, i) => (
              <Adresse key={p.id || `nouveau-${i}`} titre={`Expéditeur particulier · ${p.nom || 'nouveau'}`}
                       sous="Imprimé à la place de l’atelier pour les clients ci-dessous (modifiable dans la fenêtre d’étiquette)."
                       valeur={p} onChange={(v) => setParticulier(i, v)} onRetirer={() => retirerParticulier(i)} />
            ))}
            <div className="field-full">
              <button type="button" className="btn btn-secondary btn-sm" onClick={ajouterParticulier}
                      disabled={form.expediteurs.particuliers.length >= PARTICULIERS_MAX}>
                <Plus />Ajouter un expéditeur particulier
              </button>
            </div>
          </div>
        </div>

        {erreur && <div className="alert alert-error"><TriangleAlert /><span>{erreur}</span></div>}
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy != null || !modifie}>
            {busy === 'enregistrer' ? <LoaderCircle className="spin" /> : <Save />}Enregistrer
          </button>
        </div>
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header"><h2 className="card-title"><Printer />Zebra de l’atelier</h2></div>
        <div className="card-body stack">
          <p className="small">
            Les étiquettes « départ atelier » sortent toutes seules sur la Zebra : l’agent d’impression du PC atelier
            (le même que pour Amazon) vient les chercher toutes les 15 secondes.
          </p>
          <div className="row">
            {!etat.agent.cle
              ? <span className="badge badge-warning"><TriangleAlert />Pas encore de clé : l’agent ne peut rien imprimer</span>
              : (enLigne
                ? <span className="badge badge-success" title={fmtDateTime(vu)}><Check />Agent en ligne · vu {fmtRelative(vu)}</span>
                : <span className="badge badge-warning" title={vu ? fmtDateTime(vu) : ''}><TriangleAlert />{vu ? `Agent pas vu depuis ${fmtRelative(vu)}` : 'Agent jamais vu'}</span>)}
            <button type="button" className="btn btn-secondary btn-sm" onClick={nouvelleCle} disabled={busy != null}>
              {busy === 'cle' ? <LoaderCircle className="spin" /> : <KeyRound />}{etat.agent.cle ? 'Nouvelle clé' : 'Créer la clé de l’agent'}
            </button>
          </div>
          {cle && (
            <div className="alert alert-info">
              <Info />
              <div className="stack" style={{ gap: '.4rem' }}>
                <span>Clé à copier dans <span className="mono">jeton-suivi.txt</span>, dans le dossier de l’agent du PC atelier. Elle ne sera plus affichée.</span>
                <span className="row">
                  <code className="mono cle-agent">{cle}</code>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => navigator.clipboard?.writeText(cle).then(() => toast.success('Clé copiée'))}><Copy />Copier</button>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
