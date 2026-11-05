// ─────────────────────────────────────────────────────────────
//  Page « Impression » : commandes en attente à envoyer au PC atelier
//  (une ou plusieurs à la fois), suivi des envois par commande et état de
//  l'agent d'impression (Edge Print). La page se met à jour toute seule.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Inbox, RefreshCw, X, Ban, RotateCcw, CheckCheck, ChevronDown, ChevronRight, Info, TriangleAlert, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative, plural } from '../format.js';
import { Loading, EmptyState, PageHeader, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import { Echeance } from '../components/Statut.jsx';
import ImpressionModal from '../components/ImpressionModal.jsx';
import { EtatCommande, ImpressionBadge, PosteStatut } from '../components/ImpressionEtat.jsx';

const ACTUALISATION_MS = 10000;
// Envois « partis » (file, Edge Print, imprimé) : la commande est déjà envoyée.
const PARTIS = ['EN_FILE', 'ENVOYE', 'IMPRIME'];

// Une commande dans « Envois récents » : son résumé, avec ses actions d'ensemble, puis
// une fois dépliée le détail de ses envois, avec leurs actions une par une.
function CommandeEnvoyee({ groupe, ouverte, occupe, enCours, onBasculer, onAgir, onAgirCommande }) {
  const { commande, envois } = groupe;
  const avancement = groupe.visuels > 1 && groupe.statut !== 'ANNULE';
  return (
    <>
      <tr className={`is-clickable${groupe.statut === 'ANNULE' ? ' is-muted' : ''}`} onClick={onBasculer}>
        <td>
          <span className="imp-envoyee">
            <button type="button" className="imp-deplier" aria-expanded={ouverte}
                    aria-label={`${ouverte ? 'Replier' : 'Déplier'} les envois de ${commande.reference}`}>
              {ouverte ? <ChevronDown /> : <ChevronRight />}
            </button>
            <span>
              <Link className="ref" to={`/commandes/${commande.id}`} onClick={(e) => e.stopPropagation()}>{commande.reference}</Link>
              <span className="cell-sub">{commande.client}</span>
            </span>
          </span>
        </td>
        <td className="nowrap" title={fmtDateTime(groupe.createdAt)}>
          <span className="cell-main">{fmtRelative(groupe.createdAt)}</span>
          {groupe.creeParNom && <span className="cell-sub">{groupe.creeParNom}</span>}
        </td>
        <td className="num tnum">{fmtNumber(groupe.visuels)}</td>
        <td className="num tnum">{fmtNumber(groupe.transferts)}</td>
        <td>
          <EtatCommande statut={groupe.statut} imprimantes={groupe.imprimantes} />
          {avancement && (
            <span className="imp-avancement">
              <span className="imp-jauge"><i style={{ width: `${(groupe.visuelsImprimes / groupe.visuels) * 100}%` }} /></span>
              {groupe.visuelsImprimes} / {groupe.visuels} imprimés
            </span>
          )}
        </td>
        <td className="num" onClick={(e) => e.stopPropagation()}>
          <span className="imp-actions">
            {enCours === `commande-${groupe.id}` && <LoaderCircle className="spin" size={16} />}
            {groupe.aRelancer > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => onAgirCommande(groupe, 'relancer')} disabled={occupe}>
                <RotateCcw />Tout relancer
              </button>
            )}
            {groupe.ouverts > 0 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => onAgirCommande(groupe, 'imprime')} disabled={occupe}
                        title="L’impression est faite mais n’a pas été détectée">
                  <CheckCheck />Tout imprimé
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => onAgirCommande(groupe, 'annuler')} disabled={occupe}>
                  <Ban />Tout annuler
                </button>
              </>
            )}
          </span>
        </td>
      </tr>
      {ouverte && (
        <tr className="imp-detail">
          <td colSpan={6}>
            {envois.map((e) => (
              <div className={`imp-envoi${e.statut === 'ANNULE' ? ' is-annule' : ''}`} key={e.id}>
                <span className="imp-envoi-nom">{e.fichierNom} · × {fmtNumber(e.quantite)}</span>
                <ImpressionBadge impression={e} />
                {e.statut === 'ERREUR' && e.message && <span className="cell-sub imp-message">{e.message}</span>}
                <span className="imp-actions">
                  {enCours === e.id && <LoaderCircle className="spin" size={16} />}
                  {['ERREUR', 'ANNULE'].includes(e.statut) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onAgir(e, 'relancer')} disabled={occupe}>
                      <RotateCcw />Relancer
                    </button>
                  )}
                  {['EN_FILE', 'ENVOYE', 'ERREUR'].includes(e.statut) && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => onAgir(e, 'imprime')} disabled={occupe}
                              title="L’impression est faite mais n’a pas été détectée">
                        <CheckCheck />Imprimé
                      </button>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onAgir(e, 'annuler')} disabled={occupe}
                              title="Annuler l’envoi" aria-label={`Annuler l’envoi de ${e.fichierNom}`}><Ban /></button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Impression() {
  usePageTitle('Impression');
  const toast = useToast();
  const confirmer = useConfirm();
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(() => new Set());
  const [aEnvoyer, setAEnvoyer] = useState(null); // commandes ouvertes dans la fenêtre d'envoi
  const [enCours, setEnCours] = useState(null); // envoi ou commande dont une action est en cours
  const [ouvertes, setOuvertes] = useState(() => new Set()); // commandes dépliées dans « Envois récents »

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

  const { aImprimer, envois, poste, apercus } = data;
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

  const basculer = (id) => setOuvertes((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Action sur tous les envois d'une commande : toujours confirmée.
  const agirCommande = async (groupe, action) => {
    const { reference } = groupe.commande;
    const n = action === 'relancer' ? groupe.aRelancer : groupe.ouverts;
    const nombre = plural(n, 'envoi');
    const ok = await confirmer({
      imprime: {
        title: `Tout marquer imprimé sur ${reference} ?`,
        message: `${nombre} ${n > 1 ? 'seront marqués imprimés' : 'sera marqué imprimé'}. À utiliser si l’impression est faite mais n’a pas été détectée, par exemple après une coupure de réseau.`,
        confirmLabel: 'Tout marquer imprimé',
        icon: <CheckCheck />,
      },
      annuler: {
        title: `Tout annuler sur ${reference} ?`,
        message: `${nombre} ${n > 1 ? 'seront annulés' : 'sera annulé'}. Ce qui est déjà dans Edge Print y reste : supprimez aussi ces travaux dans Edge Print pour qu’ils ne soient pas imprimés.`,
        confirmLabel: 'Tout annuler',
        tone: 'danger',
      },
      relancer: {
        title: `Tout relancer sur ${reference} ?`,
        message: `${nombre} ${n > 1 ? 'repartiront dans la file et arriveront' : 'repartira dans la file et arrivera'} de nouveau dans Edge Print.`,
        confirmLabel: 'Tout relancer',
        icon: <RotateCcw />,
      },
    }[action]);
    if (!ok) return;
    setEnCours(`commande-${groupe.id}`);
    try {
      await api.post(`/impressions/commandes/${groupe.id}/${action}`);
      toast.success({
        annuler: 'Envois annulés',
        relancer: 'Envois relancés : ils repartent dans la file',
        imprime: 'Envois marqués imprimés',
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
                    <th>Commande</th>
                    <th>Envoyé</th>
                    <th className="num">Visuels</th>
                    <th className="num">Transferts</th>
                    <th>État</th>
                    <th className="num">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {envois.map((g) => (
                    <CommandeEnvoyee key={g.id} groupe={g} ouverte={ouvertes.has(g.id)} occupe={enCours != null} enCours={enCours}
                                     onBasculer={() => basculer(g.id)} onAgir={agir} onAgirCommande={agirCommande} />
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
          apercus={apercus}
          onClose={() => setAEnvoyer(null)}
          onSent={() => { setSelection(new Set()); load(); }}
        />
      )}
    </>
  );
}
