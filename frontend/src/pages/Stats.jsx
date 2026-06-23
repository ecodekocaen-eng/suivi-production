// ─────────────────────────────────────────────────────────────
//  Onglet Statistiques : KPIs + graphiques.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { STATUT_LABELS } from '../constants.js';
import { fmtNumber, fmtMois } from '../format.js';
import { BarChart, HBars, Donut } from '../components/Charts.jsx';
import { exportStatsCsv } from '../csv.js';

const PERIODES = { tout: 'Tout l’historique', '12m': '12 derniers mois', annee: 'Cette année' };

// Couleurs des statuts (cohérentes avec les badges du tableau).
const STATUT_COLORS = {
  EN_ATTENTE: '#94a3b8',
  EN_PRODUCTION: '#3b82f6',
  CONTROLE_QUALITE: '#f97316',
  PRET_A_EXPEDIER: '#22c55e',
  EXPEDIEE: '#15803d',
};

function Kpi({ label, value, suffix }) {
  return (
    <div className="kpi-card">
      <span className="kpi-value">{value}{suffix && <em className="kpi-suffix"> {suffix}</em>}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

export default function Stats() {
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState('quantite'); // 'quantite' | 'commandes'
  const [periode, setPeriode] = useState('tout');    // tout | 12m | annee

  useEffect(() => {
    setData(null);
    api.get(`/stats?periode=${periode}`).then(setData);
  }, [periode]);

  if (!data) return <p className="muted">Chargement des statistiques…</p>;

  const { kpis, parStatut, parMois, topClients, typesMug, ateliers } = data;

  // 12 derniers mois pour l'histogramme.
  const mois12 = parMois.slice(-12).map((m) => ({ ...m, label: fmtMois(m.mois) }));

  const donutSegments = Object.entries(parStatut)
    .filter(([, v]) => v > 0)
    .map(([s, v]) => ({ label: STATUT_LABELS[s] || s, value: v, color: STATUT_COLORS[s] }));

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Statistiques</h1>
        <div className="stats-toolbar">
          <select value={periode} onChange={(e) => setPeriode(e.target.value)}>
            {Object.entries(PERIODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => exportStatsCsv(data, PERIODES[periode])}>
            ⬇ Exporter (CSV)
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis">
        <Kpi label="Commandes" value={fmtNumber(kpis.nbCommandes)} />
        <Kpi label="Mugs produits" value={fmtNumber(kpis.quantiteTotale)} />
        <Kpi label="Clients" value={fmtNumber(kpis.nbClients)} />
        <Kpi label="Rebut total" value={fmtNumber(kpis.rebutTotal)} />
        <Kpi label="CA ESAT estimé" value={fmtNumber(kpis.caEstime)} suffix="€" />
        <Kpi label="Délai moyen prod." value={kpis.delaiMoyenJours ?? '—'} suffix={kpis.delaiMoyenJours != null ? 'j' : ''} />
      </div>

      <div className="stats-grid">
        {/* Production par mois */}
        <div className="card span2">
          <div className="card-head">
            <h2>Production sur 12 mois</h2>
            <div className="toggle">
              <button className={`btn btn-xs ${metric === 'quantite' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetric('quantite')}>Mugs</button>
              <button className={`btn btn-xs ${metric === 'commandes' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetric('commandes')}>Commandes</button>
            </div>
          </div>
          {mois12.length === 0
            ? <p className="muted">Pas assez de données.</p>
            : <BarChart data={mois12} valueKey={metric} labelKey="label" />}
        </div>

        {/* Répartition par statut */}
        <div className="card">
          <h2>Répartition par statut</h2>
          <Donut segments={donutSegments} />
        </div>

        {/* Top clients */}
        <div className="card">
          <h2>Top 10 clients (mugs)</h2>
          <HBars data={topClients} labelKey="client" valueKey="quantite" />
        </div>

        {/* Types de mug */}
        <div className="card">
          <h2>Par type de mug (mugs)</h2>
          <HBars data={typesMug} labelKey="type" valueKey="quantite" />
        </div>

        {/* Ateliers */}
        <div className="card">
          <h2>Par atelier (commandes)</h2>
          <HBars data={ateliers} labelKey="atelier" valueKey="count" />
        </div>
      </div>
    </>
  );
}
