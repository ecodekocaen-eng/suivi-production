// ─────────────────────────────────────────────────────────────
//  Page « Impression » : commandes en attente à envoyer au PC atelier
//  (une ou plusieurs à la fois), suivi des envois et état de l'agent
//  d'impression (Edge Print). La page se met à jour toute seule.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Inbox, RefreshCw, X, Ban, RotateCcw, CheckCheck, Info, TriangleAlert, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative, plural } from '../format.js';
import { Loading, EmptyState, PageHeader, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import { Echeance } from '../components/Statut.jsx';
import ImpressionModal from '../components/ImpressionModal.jsx';
import { ImpressionBadge, PosteStatut } from '../components/ImpressionEtat.jsx';

const ACTUALISATION_MS = 10000;
// Envois « partis » (file, Edge Print, imprimé) : la commande est déjà envoyée.
const PARTIS = ['EN_FILE', 'ENVOYE', 'IMPRIME'];

export default function Impression() {
  usePageTitle('Impression');
  const toast = useToast();
  const confirmer = useConfirm();
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(() => new Set());
  const [aEnvoyer, setAEnvoyer] = useState(null); // commandes ouvertes dans la fenêtre d'envoi
  const [enCours, setEnCours] = useState(null); // envoi dont une action est en cours

  const load = useCallback(async () => {
    try {
      setData(await api.get('/impressions'));
      setErreur(null);
    } catch (err) {
      setErreur(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Les états signalés par l'agent arrivent tout seuls (onglet visible, fenêtre d'envoi fermée).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && !aEnvoyer) load();
    }, ACTUALISATION_MS);
    return () => clearInterval(t);
  }, [load, aEnvoyer]);

  if (erreur && !data) {
    return (
      <div className="card">
        <EmptyState icon={<TriangleAlert />} title="Impossible de charger la file d’impression" text={erreur}
                    action={<button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw />Réessayer</button>} />
      </div>
    );
  }
  if (!data) return <Loading label="Chargement de la file d’impression…" />;

  const { aImprimer, envois, poste } = data;
  const choisies = aImprimer.filter((c) => selection.has(c.id));
  const toutesCochees = aImprimer.length > 0 && choisies.length === aImprimer.length;
  const toggle = (id) => setSelection((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleToutes = () => setSelection(toutesCochees ? new Set() : new Set(aImprimer.map((c) => c.id)));
  const visuelsChoisis = choisies.reduce((s, c) => s + c.fichiers.length, 0);

  const agir = async (envoi, action) => {
    if (action === 'annuler' && envoi.statut === 'ENVOYE') {
      const ok = await confirmer({
        title: 'Annuler cet envoi ?',
        message: 'Le visuel est déjà dans Edge Print : supprimez aussi le travail dans Edge Print pour qu’il ne soit pas imprimé.',
        confirmLabel: 'Annuler l’envoi',
        tone: 'danger',
      });
      if (!ok) return;
    }
    if (action === 'imprime') {
      const ok = await confirmer({
        title: 'Marquer comme imprimé ?',
        message: 'À utiliser si l’impression est faite mais n’a pas été détectée. La commande passera en « Impression OK » si toutes ses lignes sont imprimées.',
        confirmLabel: 'Marquer imprimé',
        icon: <CheckCheck />,
      });
      if (!ok) return;
    }
    setEnCours(envoi.id);
    try {
      await api.post(`/impressions/${envoi.id}/${action}`);
      toast.success({
        annuler: 'Envoi annulé',
        relancer: 'Envoi relancé : il repart dans la file',
        imprime: 'Envoi marqué imprimé',
      }[action]);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEnCours(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Impression"
        subtitle="Envoyez les transferts au PC atelier et suivez leur impression dans Edge Print."
        actions={(
          <>
            <PosteStatut poste={poste} />
            <button className="btn btn-secondary btn-sm" onClick={load} title="Actualiser"><RefreshCw />Actualiser</button>
          </>
        )}
      />

      {!poste.connu && (
        <div className="alert alert-info">
          <Info />
          <span>L’agent d’impression n’est pas encore installé sur le PC atelier : les envois restent dans la file en attendant.</span>
        </div>
      )}
      {poste.connu && !poste.enLigne && (
        <div className="alert alert-warning">
          <TriangleAlert />
          <span>Le PC atelier ne répond plus depuis {fmtDateTime(poste.derniereVue)}. Les envois attendront son retour : vérifiez qu’il est allumé.</span>
        </div>
      )}

      <div className="stack">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><Inbox />À imprimer <span className="count">· {aImprimer.length}</span></h2>
            <span className="card-subtitle">Commandes « En attente » avec des visuels</span>
          </div>
          {aImprimer.length === 0 ? (
            <EmptyState icon={<Inbox />} title="Rien à imprimer"
                        text="Les commandes en attente qui ont des visuels apparaîtront ici." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input type="checkbox" checked={toutesCochees} onChange={toggleToutes}
                             ref={(el) => { if (el) el.indeterminate = choisies.length > 0 && !toutesCochees; }}
                             aria-label="Tout cocher / décocher" />
                    </th>
                    <th>Réf.</th>
                    <th>Client · commande</th>
                    <th className="num">Visuels</th>
                    <th className="num">Mugs</th>
                    <th>Sortie</th>
                    <th>Impression</th>
                  </tr>
                </thead>
                <tbody>
                  {aImprimer.map((c) => {
                    const partis = new Set(c.impressions.filter((i) => PARTIS.includes(i.statut)).map((i) => i.fichierId));
                    const nbPartis = c.fichiers.filter((f) => partis.has(f.id)).length;
                    return (
                      <tr key={c.id} className={`is-clickable${selection.has(c.id) ? ' is-selected' : ''}`} onClick={() => toggle(c.id)}>
                        <td className="col-check" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selection.has(c.id)} onChange={() => toggle(c.id)}
                                 aria-label={`Sélectionner ${c.reference}`} />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Link className="ref" to={`/commandes/${c.id}`}>{c.reference}</Link>
                        </td>
                        <td>
                          <span className="cell-main">{c.client}</span>
                          <span className="cell-sub">{c.nom || c.designation}</span>
                        </td>
                        <td className="num tnum">{c.fichiers.length}</td>
                        <td className="num tnum">{fmtNumber(c.quantite)}</td>
                        <td className="nowrap">
                          <span className="row">
                            <Echeance commande={c} />
                            <span className="muted">{c.dateSortieTexte || fmtDate(c.dateLivraison) || '—'}</span>
                          </span>
                        </td>
                        <td>
                          {nbPartis === 0
                            ? <span className="muted">Pas encore envoyée</span>
                            : <span className="badge badge-info">{nbPartis === c.fichiers.length ? 'Envoyée' : `${nbPartis} / ${c.fichiers.length} visuels envoyés`}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><Printer />Envois récents</h2>
            <span className="card-subtitle">Mis à jour automatiquement</span>
          </div>
          {envois.length === 0 ? (
            <EmptyState icon={<Printer />} title="Aucun envoi pour l’instant"
                        text="Cochez des commandes ci-dessus, ou utilisez le bouton « Imprimer » d’une commande." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Envoyé</th>
                    <th>Commande</th>
                    <th>Visuel</th>
                    <th className="num">Transferts</th>
                    <th>État</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {envois.map((e) => (
                    <tr key={e.id} className={e.statut === 'ANNULE' ? 'is-muted' : ''}>
                      <td className="nowrap" title={fmtDateTime(e.createdAt)}>
                        <span className="cell-main">{fmtRelative(e.createdAt)}</span>
                        {e.creeParNom && <span className="cell-sub">{e.creeParNom}</span>}
                      </td>
                      <td>
                        <Link className="ref" to={`/commandes/${e.commande.id}`}>{e.commande.reference}</Link>
                        <span className="cell-sub">{e.commande.client}</span>
                      </td>
                      <td className="imp-visuel">{e.fichierNom}</td>
                      <td className="num tnum">{fmtNumber(e.quantite)}</td>
                      <td>
                        <ImpressionBadge impression={e} />
                        {e.statut === 'ERREUR' && e.message && <span className="cell-sub imp-message">{e.message}</span>}
                      </td>
                      <td className="num">
                        <span className="imp-actions">
                          {enCours === e.id && <LoaderCircle className="spin" size={16} />}
                          {['ERREUR', 'ANNULE'].includes(e.statut) && (
                            <button className="btn btn-ghost btn-sm" onClick={() => agir(e, 'relancer')} disabled={enCours != null}>
                              <RotateCcw />Relancer
                            </button>
                          )}
                          {['EN_FILE', 'ENVOYE', 'ERREUR'].includes(e.statut) && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => agir(e, 'imprime')} disabled={enCours != null}
                                      title="L’impression est faite mais n’a pas été détectée">
                                <CheckCheck />Imprimé
                              </button>
                              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => agir(e, 'annuler')} disabled={enCours != null}
                                      title="Annuler l’envoi" aria-label="Annuler l’envoi"><Ban /></button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Barre de sélection flottante */}
      {choisies.length > 0 && (
        <div className="selection-bar" role="region" aria-label="Sélection">
          <div className="sel-stats">
            <span><strong>{choisies.length}</strong> commande{choisies.length > 1 ? 's' : ''}</span>
            <span><strong>{plural(visuelsChoisis, 'visuel')}</strong></span>
          </div>
          <div className="sel-actions">
            <button className="btn btn-primary" onClick={() => setAEnvoyer(choisies)}><Printer />Imprimer la sélection</button>
            <button className="btn btn-ghost btn-icon" onClick={() => setSelection(new Set())}
                    title="Vider la sélection" aria-label="Vider la sélection"><X /></button>
          </div>
        </div>
      )}

      {aEnvoyer && (
        <ImpressionModal
          commandes={aEnvoyer}
          onClose={() => setAEnvoyer(null)}
          onSent={() => { setSelection(new Set()); load(); }}
        />
      )}
    </>
  );
}
