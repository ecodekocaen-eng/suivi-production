// ─────────────────────────────────────────────────────────────
//  Indicateur de charge de l'ESAT (tableau de suivi) : à la cadence
//  moyenne de CAPACITE_JOUR mugs par jour ouvré, peut-on sortir toutes
//  les commandes en cours à leur date ? Verdict « On est bien » /
//  « Ça se tend » / « C'est la galère », chiffres clés, production
//  prévue jour par jour et commandes à risque. Une réglette permet de
//  simuler une autre cadence (mugs / jour) et voir l'effet en direct.
//  Calcul : src/charge.js.
// ─────────────────────────────────────────────────────────────
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaceSlightlySmiling, FaceNeutral, FaceSlightlyFrowning, Coffee, TriangleAlert, Info, ChevronRight, ChevronDown, Gauge, RotateCcw,
} from 'lucide-react';
import { api } from '../api.js';
import { CAPACITE_JOUR, STATUTS_EN_COURS } from '../constants.js';
import { planCharge } from '../charge.js';
import { fmtNumber, plural } from '../format.js';
import { useStoredState } from '../ui/bits.jsx';

// Bornes de la réglette de simulation (mugs par jour ouvré).
const CADENCE_MIN = 100;
const CADENCE_MAX = 2000;

const TITRES = {
  ok: 'On est bien',
  tendu: 'Ça se tend',
  galere: 'C’est la galère',
  vide: 'Rien à produire',
};
const ICONES = { ok: FaceSlightlySmiling, tendu: FaceNeutral, galere: FaceSlightlyFrowning, vide: Coffee };

const jourCourt = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const jourNom = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
const memeJour = (a, b) => a.toDateString() === b.toDateString();

function message(p) {
  const cadence = `${fmtNumber(p.capacite)} mugs par jour`;
  if (p.verdict === 'vide') return 'Aucune commande en attente de production.';
  if (p.verdict === 'galere') {
    const n = p.aRisque.length;
    return n > 1
      ? `À ${cadence}, ${n} commandes ne seront pas prêtes pour leur date de sortie.`
      : `À ${cadence}, 1 commande ne sera pas prête pour sa date de sortie.`;
  }
  if (p.verdict === 'tendu') {
    return p.enRetard.length
      ? `Les dates à venir tiennent, mais ${plural(p.enRetard.length, 'commande est déjà en retard', 'commandes sont déjà en retard')} : à sortir en priorité.`
      : `Ça passe de justesse : il faut ${p.indice} % de la capacité de l’ESAT d’ici le ${jourCourt(p.dateTendue)}.`;
  }
  return `À ${cadence}, toutes les commandes sortent à l’heure, sans forcer.`;
}

// Charge toutes les commandes en cours (pagination de l'API : 200 par page).
async function chargerCommandesEnCours() {
  const qs = (page) => new URLSearchParams({
    statut: STATUTS_EN_COURS.join(','), page, pageSize: 200, sortBy: 'dateLivraison', sortDir: 'asc',
  }).toString();
  const premiere = await api.get(`/commandes?${qs(1)}`);
  let items = premiere.items;
  for (let page = 2; page <= Math.min(premiere.totalPages, 5); page += 1) {
    items = items.concat((await api.get(`/commandes?${qs(page)}`)).items);
  }
  return items;
}

export default function ChargeEsat({ version = 0 }) {
  const [commandes, setCommandes] = useState(null);
  // Détail jour par jour : ouvert d'office quand ça se tend. Le choix de l'utilisateur
  // est mémorisé pour le verdict en cours ; si le verdict change, on revient à l'automatique.
  const [choix, setChoix] = useStoredState('charge-detail', null);
  // Cadence simulée avec la réglette (non mémorisée : chaque visite repart de la cadence habituelle).
  const [capacite, setCapacite] = useState(CAPACITE_JOUR);
  const idCadence = useId();

  useEffect(() => {
    let actif = true;
    chargerCommandesEnCours()
      .then((items) => { if (actif) setCommandes(items); })
      .catch(() => { if (actif) setCommandes((c) => c || []); });
    return () => { actif = false; };
  }, [version]);

  // Plan à la cadence habituelle (pilote l'ouverture du détail) et plan simulé (affiché).
  const planBase = useMemo(() => (commandes ? planCharge(commandes) : null), [commandes]);
  const plan = useMemo(
    () => (commandes && capacite !== CAPACITE_JOUR ? planCharge(commandes, { capacite }) : planBase),
    [commandes, capacite, planBase],
  );
  const simulation = capacite !== CAPACITE_JOUR;

  if (!plan) {
    return (
      <section className="card charge charge-chargement" aria-busy="true">
        <div className="charge-head">
          <div className="charge-verdict">
            <span className="skeleton" style={{ width: 48, height: 48, borderRadius: 14 }} />
            <div className="stack" style={{ gap: '.5rem' }}>
              <span className="skeleton" style={{ width: 160, height: 16 }} />
              <span className="skeleton" style={{ width: 320, maxWidth: '60vw', height: 12 }} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const Icone = ICONES[plan.verdict];
  // Le détail suit la situation réelle (cadence habituelle) : il ne s'ouvre ni ne se ferme
  // pendant qu'on fait glisser la réglette.
  const alerte = planBase.verdict === 'tendu' || planBase.verdict === 'galere';
  const ouvert = planBase.verdict !== 'vide' && (choix?.verdict === planBase.verdict ? choix.ouvert : alerte);
  const aujourdhui = new Date();
  const alertes = [...plan.enRetard, ...plan.aRisque];

  return (
    <section className={`card charge charge-${plan.verdict}`} aria-label="Charge de l’ESAT">
      <div className="charge-head">
        <div className="charge-verdict">
          <span className="charge-pastille"><Icone /></span>
          <div>
            <div className="charge-titre">{TITRES[plan.verdict]}</div>
            <div className="charge-sous">{message(plan)}</div>
          </div>
        </div>
        {plan.verdict !== 'vide' && (
          <div className="charge-chiffres">
            <div className="charge-chiffre charge-indice"
                 title="Part de la capacité de l’ESAT nécessaire pour sortir les commandes à l’heure, d’ici la date la plus tendue. Au-delà de 100 %, des dates de sortie sautent.">
              <span>Indice de charge</span>
              <strong>{fmtNumber(plan.indice)} %</strong>
              <span className="indice-jauge" aria-hidden="true"><span style={{ width: `${Math.min(plan.indice, 100)}%` }} /></span>
            </div>
            <div className="charge-chiffre">
              <span>À produire</span>
              <strong>{fmtNumber(plan.totalMugs)} mugs</strong>
              <small>{plural(plan.nbCommandes, 'commande')}</small>
            </div>
            <div className="charge-chiffre">
              <span>Soit</span>
              <strong>{fmtNumber(Math.round(plan.joursNecessaires * 10) / 10)} j</strong>
              <small>de production</small>
            </div>
            <div className="charge-chiffre">
              <span>Tout prêt vers</span>
              <strong className="charge-date">{jourCourt(plan.finEstimee)}</strong>
              <small>à {fmtNumber(plan.capacite)} mugs / jour</small>
            </div>
            <button type="button" className="btn btn-ghost btn-sm charge-toggle" aria-expanded={ouvert}
                    onClick={() => setChoix({ verdict: planBase.verdict, ouvert: !ouvert })}>
              {ouvert ? 'Masquer le détail' : 'Voir le détail'}<ChevronDown />
            </button>
          </div>
        )}
      </div>

      {planBase.verdict !== 'vide' && (
        <div className="charge-cadence">
          <label className="charge-cadence-label" htmlFor={idCadence}><Gauge />Cadence de l’ESAT</label>
          <input id={idCadence} type="range" min={CADENCE_MIN} max={CADENCE_MAX} step={50} value={capacite}
                 list={`${idCadence}-reperes`} onChange={(e) => setCapacite(Number(e.target.value))}
                 aria-valuetext={`${capacite} mugs par jour`} />
          <datalist id={`${idCadence}-reperes`}><option value={CAPACITE_JOUR} /></datalist>
          <output htmlFor={idCadence} className="charge-cadence-val">
            <strong>{fmtNumber(capacite)}</strong> mugs / jour
          </output>
          {simulation ? (
            <>
              <span className="badge badge-info">Simulation</span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCapacite(CAPACITE_JOUR)}>
                <RotateCcw />Revenir à {fmtNumber(CAPACITE_JOUR)}
              </button>
            </>
          ) : (
            <span className="charge-cadence-aide">Faites glisser pour simuler une autre cadence</span>
          )}
        </div>
      )}

      {ouvert && (
        <div className="charge-jours" role="list" aria-label="Production prévue par jour ouvré">
          {plan.jours.map((j) => {
            const pct = Math.min(100, Math.round((j.prevu / plan.capacite) * 100));
            const pctRetard = Math.min(pct, Math.round((j.retard / plan.capacite) * 100));
            const today = memeJour(j.date, aujourdhui);
            return (
              <div key={j.date.toISOString()} role="listitem"
                   className={`charge-jour${j.retard ? ' is-retard' : ''}${today ? ' is-today' : ''}${j.prevu === 0 ? ' is-libre' : ''}`}
                   title={`${jourCourt(j.date)} : ${fmtNumber(j.prevu)} mugs prévus sur ${fmtNumber(plan.capacite)} (${pct} %)`
                     + `${j.sorties ? ` · ${plural(j.sorties, 'sortie')}` : ''}${j.retard ? ` · dont ${fmtNumber(j.retard)} pour des commandes hors délai` : ''}`}>
                <span className="cj-nom">
                  {today ? 'Auj.' : jourNom(j.date)}{' '}
                  <span className="cj-date">{j.date.getDate()}/{String(j.date.getMonth() + 1).padStart(2, '0')}</span>
                </span>
                <span className="cj-barre">
                  <span style={{ height: `${pct - pctRetard}%` }} />
                  {pctRetard > 0 && <span className="cj-retard" style={{ height: `${pctRetard}%` }} />}
                </span>
                <span className="cj-val">{j.prevu ? fmtNumber(j.prevu) : 'libre'}</span>
                <span className="cj-sorties">{j.sorties ? plural(j.sorties, 'sortie') : ' '}</span>
              </div>
            );
          })}
          {plan.joursAuDela > 0 && (
            <div className="charge-jour is-plus" title="Production prévue au-delà de ces jours">
              <span className="cj-val">+{plan.joursAuDela}</span>
              <span className="cj-nom">jours</span>
            </div>
          )}
        </div>
      )}

      {ouvert && alertes.length > 0 && (
        <ul className="charge-risques">
          {alertes.slice(0, 4).map((l) => (
            <li key={l.commande.id}>
              <Link to={`/commandes/${l.commande.id}`}>
                <TriangleAlert className={l.dejaEnRetard ? 'text-danger' : 'text-warning'} />
                <span className="charge-risque">
                  <span className="charge-risque-qui">
                    <span className="ref">{l.commande.reference}</span>
                    <span className="strong">{l.commande.client}</span>
                  </span>
                  <span className="muted">
                    sortie {l.date.toLocaleDateString('fr-FR')}
                    {l.dejaEnRetard ? ' dépassée' : ''} · prête vers le {jourCourt(l.finDate)}
                    {!l.dejaEnRetard && ` (${plural(l.fin - l.echeance, 'jour')} de retard)`}
                  </span>
                </span>
                <ChevronRight className="charge-go" />
              </Link>
            </li>
          ))}
          {alertes.length > 4 && <li className="muted small">… et {alertes.length - 4} autre{alertes.length - 4 > 1 ? 's' : ''}</li>}
        </ul>
      )}

      {ouvert && (
        <p className="charge-note">
          <Info />Estimation à {fmtNumber(plan.capacite)} mugs par jour ouvré (lundi-vendredi, hors fériés), dans l’ordre des dates de sortie.
          Les commandes « En cours de prod » sont comptées en entier.
        </p>
      )}
    </section>
  );
}
