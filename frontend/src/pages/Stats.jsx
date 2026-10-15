// ─────────────────────────────────────────────────────────────
//  Onglet Statistiques : KPIs (avec tendances), production 12 mois
//  comparée à N-1, charge de production, avancement, top clients, retards.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  Package, ClipboardList, Euro, Recycle, Timer, Factory, Download, TrendingUp, TrendingDown,
  TriangleAlert, CircleCheck, ChartColumn, Gauge, ChartPie, Users as UsersIcon, Coffee, Wallet,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUT_LABELS, STATUT_COLORS } from '../constants.js';
import { fmtNumber, fmtMois, fmtDate, fmtEuro, plural } from '../format.js';
import { LineChart, HBars, Donut } from '../components/Charts.jsx';
import { exportStatsCsv } from '../csv.js';
import { StatutBadge } from '../components/Statut.jsx';
import { PageHeader, Segmented, Loading, EmptyState, usePageTitle } from '../ui/bits.jsx';

const PERIODES = [
  { value: 'tout', label: 'Tout', title: 'Tout l’historique', long: 'Tout l’historique' },
  { value: 'mois', label: 'Ce mois', title: 'Mois en cours', long: 'Mois en cours' },
  { value: 'annee', label: 'Cette année', title: 'Du 1er janvier à aujourd’hui', long: 'Du 1er janvier à aujourd’hui' },
  { value: '12m', label: '12 mois', title: '12 derniers mois', long: '12 derniers mois' },
  { value: 'perso', label: 'Dates…', title: 'De date à date', long: 'De date à date' },
];

const COULEUR_PRINCIPALE = '#8a2b36';

function Kpi({ icon: Icone, label, value, suffix, delta, note }) {
  return (
    <div className="card kpi">
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon"><Icone /></span>
      </div>
      <div className="kpi-value">{value}{suffix && <span className="kpi-suffix"> {suffix}</span>}</div>
      {delta != null && (
        <span className="row" style={{ gap: '.4rem' }} title="Par rapport à la période précédente de même durée">
          <span className={`kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {delta >= 0 ? <TrendingUp /> : <TrendingDown />}{delta >= 0 ? '+' : '−'}{fmtNumber(Math.abs(delta))} %
          </span>
          <span className="kpi-delta-note">vs période préc.</span>
        </span>
      )}
      {note && <span className="kpi-delta-note">{note}</span>}
    </div>
  );
}

export default function Stats() {
  usePageTitle('Statistiques');
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [metric, setMetric] = useState('quantite');
  const [periode, setPeriode] = useState('tout');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');

  // « De date à date » : on attend que les deux dates soient choisies.
  const persoIncomplet = periode === 'perso' && (!debut || !fin);

  useEffect(() => {
    if (periode === 'perso' && (!debut || !fin)) return;
    setData(null);
    setErreur(null);
    const qs = periode === 'perso'
      ? `periode=perso&debut=${debut}&fin=${fin}`
      : `periode=${periode}`;
    api.get(`/stats?${qs}`).then(setData).catch((e) => setErreur(e.message));
  }, [periode, debut, fin]);

  const periodeLabel = periode === 'perso'
    ? `Du ${fmtDate(debut)} au ${fmtDate(fin)}`
    : PERIODES.find((p) => p.value === periode)?.long;

  const toolbar = (
    <div className="stats-toolbar">
      <Segmented label="Période" value={periode} onChange={setPeriode} options={PERIODES} />
      {periode === 'perso' && (
        <span className="stats-dates">
          <input type="date" value={debut} max={fin || undefined} onChange={(e) => setDebut(e.target.value)} aria-label="Date de début" />
          <span className="muted">→</span>
          <input type="date" value={fin} min={debut || undefined} onChange={(e) => setFin(e.target.value)} aria-label="Date de fin" />
        </span>
      )}
      <button className="btn btn-secondary btn-sm" disabled={!data}
              onClick={() => data && exportStatsCsv(data, periodeLabel)}>
        <Download />Exporter (CSV)
      </button>
    </div>
  );

  const entete = (
    <PageHeader title="Statistiques" subtitle={`Production de mugs · ${periodeLabel}`} actions={toolbar} />
  );

  if (!data) {
    return (
      <>
        {entete}
        {erreur ? <div className="alert alert-error">{erreur}</div>
          : persoIncomplet
            ? <div className="card"><EmptyState icon={<ChartColumn />} title="Choisissez une période" text="Indiquez une date de début et une date de fin." /></div>
            : <Loading label="Calcul des statistiques…" />}
      </>
    );
  }

  const { kpis, deltas, marge, parStatut, parMois, charge, topClients, typesMug, ateliers, retards } = data;

  // Production 12 mois + comparaison année précédente
  const mois12 = parMois.slice(-12);
  const lookup = Object.fromEntries(parMois.map((m) => [m.mois, m]));
  const shiftYear = (ym) => { const [y, m] = ym.split('-'); return `${Number(y) - 1}-${m}`; };
  // Axe : mois courts, l'année seulement au 1er mois affiché et en janvier ; infobulle : mois complet.
  const labels = mois12.map((m, i) => (i === 0 || m.mois.endsWith('-01') ? fmtMois(m.mois) : fmtMois(m.mois).split(' ')[0]));
  const titres = mois12.map((m) => fmtMois(m.mois));
  const cur = mois12.map((m) => m[metric]);
  const prev = mois12.map((m) => lookup[shiftYear(m.mois)]?.[metric] ?? 0);
  const hasPrev = prev.some((v) => v > 0);

  const donutSegments = Object.entries(parStatut)
    .filter(([s, v]) => s !== 'Expédié' && v > 0)
    .map(([s, v]) => ({ label: STATUT_LABELS[s] || s, value: v, color: STATUT_COLORS[s] }));

  const total = kpis.quantiteTotale || 1;

  return (
    <>
      {entete}

      {/* KPIs */}
      <div className="kpi-grid">
        <Kpi icon={Package} label="Mugs produits" value={fmtNumber(kpis.quantiteTotale)} delta={deltas?.mugs} />
        <Kpi icon={ClipboardList} label="Commandes" value={fmtNumber(kpis.nbCommandes)} delta={deltas?.commandes}
             note={plural(kpis.nbClients, 'client')} />
        <Kpi icon={Euro} label="Coût ESAT" value={fmtNumber(Math.round(kpis.coutAchat || 0))} suffix="€" delta={deltas?.cout} />
        <Kpi icon={Factory} label="À produire" value={fmtNumber(kpis.aProduire)} suffix="mugs"
             note={plural(kpis.aProduireCommandes, 'commande')} />
        <Kpi icon={Timer} label="Délai moyen" value={kpis.delaiMoyenJours != null ? fmtNumber(kpis.delaiMoyenJours) : '—'}
             suffix={kpis.delaiMoyenJours != null ? 'jours' : ''} note="De la commande à l’expédition" />
        <Kpi icon={Recycle} label="Taux de rebut" value={fmtNumber(kpis.tauxRebut)} suffix="%" />
      </div>

      {/* Rentabilité (admin) */}
      {isAdmin && marge && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><Wallet />Rentabilité <span className="admin-tag">admin</span></h2>
            <span className="card-subtitle">{marge.nbCommandes} / {marge.nbTotal} commandes avec un prix de vente</span>
          </div>
          <div className="card-body">
            {marge.nbCommandes === 0 ? (
              <p className="muted">Renseignez un prix de vente sur les commandes pour voir la marge.</p>
            ) : (
              <div className="marge-metrics">
                <div className="mm"><span className="mm-lbl">Chiffre d’affaires</span><span className="mm-val">{fmtEuro(marge.ca)}</span></div>
                <div className="mm"><span className="mm-lbl">Coût ESAT</span><span className="mm-val">{fmtEuro(marge.cout)}</span></div>
                <div className="mm"><span className="mm-lbl">Marge</span><span className={`mm-val ${marge.marge >= 0 ? 'marge-pos' : 'marge-neg'}`}>{fmtEuro(marge.marge)}</span></div>
                <div className="mm"><span className="mm-lbl">Taux de marge</span><span className="mm-val">{marge.taux != null ? `${marge.taux} %` : '—'}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Production 12 mois + N-1 */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title"><ChartColumn />Production sur 12 mois</h2>
          <div className="stats-toolbar">
            <div className="chart-legend">
              <span><span className="swatch" style={{ background: COULEUR_PRINCIPALE }} />Cette année</span>
              {hasPrev && <span><span className="swatch dash" />Année précédente</span>}
            </div>
            <Segmented label="Mesure" value={metric} onChange={setMetric}
                       options={[{ value: 'quantite', label: 'Mugs' }, { value: 'commandes', label: 'Commandes' }]} />
          </div>
        </div>
        <div className="card-body">
          {mois12.length === 0 ? <p className="muted">Pas assez de données.</p> : (
            <LineChart
              labels={labels}
              titres={titres}
              series={[
                { label: 'Cette année', color: COULEUR_PRINCIPALE, data: cur },
                ...(hasPrev ? [{ label: 'Année préc.', color: '#a8a097', dash: true, data: prev }] : []),
              ]}
            />
          )}
        </div>
      </div>

      <div className="grid-2">
        {/* Charge de production */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><Gauge />Charge de production</h2>
            <span className="card-subtitle">{fmtNumber(kpis.aProduire)} mugs à produire</span>
          </div>
          <div className="card-body">
            <HBars data={charge} labelKey="statut" valueKey="quantite" colors={STATUT_COLORS}
                   labelFormat={(s) => STATUT_LABELS[s] || s} format={(v) => `${fmtNumber(v)} mugs`} />
          </div>
        </div>

        {/* Avancement (hors expédiées) */}
        <div className="card">
          <div className="card-header"><h2 className="card-title"><ChartPie />Avancement (hors expédiées)</h2></div>
          <div className="card-body">
            {donutSegments.length === 0
              ? <p className="muted">Aucune commande en cours.</p>
              : <Donut segments={donutSegments} />}
          </div>
        </div>

        {/* Top clients en % */}
        <div className="card">
          <div className="card-header"><h2 className="card-title"><UsersIcon />Top clients</h2><span className="card-subtitle">Part du volume</span></div>
          <div className="card-body">
            <HBars data={topClients} labelKey="client" valueKey="quantite" max={total}
                   format={(v) => `${Math.round((v / total) * 100)} %`} />
          </div>
        </div>

        {/* Retards */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title"><TriangleAlert />Retards à surveiller</h2>
            {retards.length > 0 && <span className="badge badge-danger">{retards.length}</span>}
          </div>
          <div className="card-body">
            {retards.length === 0 ? (
              <div className="row muted"><CircleCheck size={18} className="text-success" />Aucun retard, tout est dans les temps.</div>
            ) : (
              <ul className="late-list">
                {retards.map((r, i) => (
                  <li key={i}>
                    <div style={{ minWidth: 0 }}>
                      <div className="strong truncate">{r.client}</div>
                      <div className="muted small truncate">{r.designation} · {fmtNumber(r.quantite)} mugs · sortie {fmtDate(r.dateLivraison)}</div>
                    </div>
                    <div className="late-right">
                      {r.joursRetard > 0
                        ? <span className="badge badge-danger">{r.joursRetard} j de retard</span>
                        : <span className="badge badge-warning">Sortie aujourd’hui</span>}
                      <StatutBadge statut={r.statut} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Par type de mug */}
        <div className="card">
          <div className="card-header"><h2 className="card-title"><Coffee />Par type de mug</h2><span className="card-subtitle">En mugs</span></div>
          <div className="card-body"><HBars data={typesMug} labelKey="type" valueKey="quantite" /></div>
        </div>

        {/* Par atelier */}
        <div className="card">
          <div className="card-header"><h2 className="card-title"><Factory />Par atelier</h2><span className="card-subtitle">En commandes</span></div>
          <div className="card-body"><HBars data={ateliers} labelKey="atelier" valueKey="count" /></div>
        </div>
      </div>
    </>
  );
}
