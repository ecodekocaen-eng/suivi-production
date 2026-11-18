// ─────────────────────────────────────────────────────────────
//  Bloc « Expédition » de la fiche commande : étiquettes Chronopost (atelier →
//  Zebra, ESAT → PDF) et étiquettes importées (palette / autre transporteur).
//  Tout le monde voit et ouvre les PDF (l'ESAT les imprime) ; les admins créent,
//  renvoient sur la Zebra et annulent.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Truck, Plus, FileDown, Printer, Ban, LoaderCircle, Check, TriangleAlert, Clock, FlaskConical, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import { fmtDateTime, fmtNumber, fmtRelative, plural } from '../format.js';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import ExpeditionModal from './ExpeditionModal.jsx';

const DEPARTS = { ATELIER: 'Chronopost · atelier', ESAT: 'Chronopost · ESAT' };
const urlSuivi = (suivi) => `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${encodeURIComponent(suivi)}`;
const kg = (n) => `${fmtNumber(n)} kg`;

function EtatZebra({ colis }) {
  if (colis.impression === 'IMPRIME') return <span className="badge badge-success" title={fmtDateTime(colis.imprimeAt)}><Check />Imprimée</span>;
  if (colis.impression === 'EN_FILE') return <span className="badge badge-info" title="L’agent du PC atelier l’envoie sur la Zebra"><Clock />En file</span>;
  if (colis.impression === 'ERREUR') return <span className="badge badge-danger" title={colis.message || ''}><TriangleAlert />Erreur Zebra</span>;
  return null;
}

function Expedition({ commandeId, e, isAdmin, onChange }) {
  const toast = useToast();
  const confirmer = useConfirm();
  const [busy, setBusy] = useState(null);
  const annulee = e.statut === 'ANNULEE';
  const chronopost = e.depart !== 'AUTRE';
  const actifs = (e.colis || []).filter((c) => !c.annuleAt);
  const pdf = `/api/commandes/${commandeId}/expeditions/${e.id}/pdf`;

  const agir = async (action) => {
    if (action === 'annuler') {
      const ok = await confirmer({
        title: chronopost ? 'Annuler les étiquettes Chronopost ?' : 'Retirer cette étiquette ?',
        message: !chronopost
          ? 'Le PDF importé est retiré de la fiche.'
          : (e.essai
            ? 'Étiquettes d’essai (« SPECIMEN ») : elles sont simplement retirées, rien n’existe chez Chronopost.'
            : `${plural(actifs.length, 'étiquette')} ${actifs.length > 1 ? 'seront annulées' : 'sera annulée'} chez Chronopost. Possible seulement avant la prise en charge des cartons ; une étiquette déjà collée ne doit plus servir.`),
        confirmLabel: chronopost ? 'Annuler les étiquettes' : 'Retirer',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      await api.post(`/commandes/${commandeId}/expeditions/${e.id}/${action}`);
      toast.success(action === 'annuler' ? (chronopost ? 'Étiquettes annulées chez Chronopost' : 'Étiquette retirée') : 'Étiquettes renvoyées sur la Zebra');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      onChange();
    }
  };

  const d = e.destinataire;
  return (
    <li className={`expe${annulee ? ' is-annulee' : ''}`}>
      <div className="expe-tete">
        <strong>{chronopost ? DEPARTS[e.depart] : e.transporteur}</strong>
        {e.essai && <span className="badge badge-warning" title="Compte d’essai de Chronopost : rien n’est facturé ni expédié"><FlaskConical />Essai</span>}
        {annulee && <span className="badge">Annulée</span>}
        <span className="cell-sub expe-quand" title={fmtDateTime(e.createdAt)}>{fmtRelative(e.createdAt)}{e.creeParNom && ` · ${e.creeParNom}`}</span>
      </div>
      {d && <div className="cell-sub">{[d.nom, [d.cp, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>}
      {chronopost ? (
        <ul className="expe-colis">
          {(e.colis || []).map((c) => (
            <li key={c.id} className={c.annuleAt ? 'is-annule' : ''}>
              <span className="tnum">{c.rang}/{e.nbColis}</span>
              {e.essai || c.annuleAt
                ? <span className="mono">{c.suivi}</span>
                : <a className="mono" href={urlSuivi(c.suivi)} target="_blank" rel="noopener noreferrer" title="Suivre le colis chez Chronopost">{c.suivi}<ExternalLink /></a>}
              <span className="muted tnum">{kg(c.poids)}</span>
              {c.annuleAt ? <span className="muted">annulée</span> : <EtatZebra colis={c} />}
            </li>
          ))}
        </ul>
      ) : (
        <div className="cell-sub">{plural(e.nbColis, 'colis', 'colis')}{e.suivi && <> · <span className="mono">{e.suivi}</span></>}{e.fichierNom && ` · ${e.fichierNom}`}</div>
      )}
      {!annulee && (
        <div className="expe-actions">
          <a className="btn btn-secondary btn-xs" href={pdf} target="_blank" rel="noopener noreferrer"
             title={e.depart === 'ATELIER' ? 'Les étiquettes en PDF (si la Zebra ne marche pas)' : 'Le PDF à imprimer'}><FileDown />PDF</a>
          {isAdmin && e.depart === 'ATELIER' && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => agir('reimprimer')} disabled={busy != null}
                    title="Renvoyer les étiquettes sur la Zebra de l’atelier">
              {busy === 'reimprimer' ? <LoaderCircle className="spin" /> : <Printer />}Zebra
            </button>
          )}
          {isAdmin && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => agir('annuler')} disabled={busy != null}>
              {busy === 'annuler' ? <LoaderCircle className="spin" /> : <Ban />}{chronopost ? 'Annuler' : 'Retirer'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export default function Expeditions({ commande, expeditions, isAdmin, onChange }) {
  const [nouvelle, setNouvelle] = useState(false);
  const actives = expeditions.filter((e) => e.statut !== 'ANNULEE').length;
  if (!isAdmin && expeditions.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header is-fin">
        <h2 className="card-title"><Truck />Expédition {actives > 0 && <span className="count">· {actives}</span>}</h2>
        {isAdmin && !commande.supprime && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setNouvelle(true)}><Plus />Étiquette</button>
        )}
      </div>
      <div className="card-body is-fin">
        {expeditions.length === 0
          ? <p className="muted small">Aucune étiquette pour l’instant.</p>
          : (
            <ul className="expe-liste">
              {expeditions.map((e) => <Expedition key={e.id} commandeId={commande.id} e={e} isAdmin={isAdmin} onChange={onChange} />)}
            </ul>
          )}
      </div>
      {nouvelle && (
        <ExpeditionModal
          commande={commande}
          onClose={() => setNouvelle(false)}
          onCreated={() => { setNouvelle(false); onChange(); }}
        />
      )}
    </div>
  );
}
