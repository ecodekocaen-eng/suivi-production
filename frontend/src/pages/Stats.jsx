// ─────────────────────────────────────────────────────────────
//  Onglet Statistiques : KPIs (avec tendances), production 12 mois
//  comparée à N-1, charge de production, avancement, top clients, retards.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUT_LABELS } from '../constants.js';
import { fmtNumber, fmtMois, fmtDate } from '../format.js';
import { LineChart, HBars, Donut } from '../components/Charts.jsx';
import { exportStatsCsv } from '../csv.js';
import StatutBadge from '../components/StatutBadge.jsx';

const PERIODES = { tout: 'Tout l’historique', '12m': '12 derniers mois', annee: 'Cette année' };

const STATUT_COLORS = {
  'En attente': '#888780',
  'Impression OK': '#eda100',
  'En cours de prod': '#2a78d6',
  'Terminé': '#199e70',
  'Expédié': '#15803d',
};

function Kpi({ label, value, suffix, delta }) {
  return (
    <div className="kpi-card">
      <span className="kpi-value">{value}{suffix && <em className="kpi-suffix"> {suffix}</em>}</span>
      <span className="kpi-label">{label}</span>
      {delta != null && (
        <span className={`kpi-delta ${delta >= 0 ? 'up' : 'down'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs préc.
        </span>
      )}
    </div>
  );
}

export default function Stats() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState('quantite');
  const [periode, setPeriode] = useState('tout');

  useEffect(() => {
    setData(null);
    api.get(`/stats?periode=${periode}`).then(setData);
  }, [periode]);

  if (!data) return <p className="muted">Chargement des statistiques…</p>;

  const { kpis, deltas, marge, parStatut, parMois, charge, topClients, typesMug, ateliers, retards } = data;

  // Production 12 mois + comparaison année précédente
  const mois12 = parMois.slice(-12);
  const lookup = Object.fromEntries(parMois.map((m) => [m.mois, m]));
  const shiftYear = (ym) => { const [y, m] = ym.split('-'); return `${Number(y) - 1}-${m}`; };
  const labels = mois12.map((m) => fmtMois(m.mois));
  const cur = mois12.map((m) => m[metric]);
  const prev = mois12.map((m) => lookup[shiftYear(m.mois)]?.[metric] ?? 0);
  const hasPrev = prev.some((v) => v > 0);

  const donutSegments = Object.entries(parStatut)
    .filter(([s, v]) => s !== 'Expédié' && v > 0)
    .map(([s, v]) => ({ label: STATUT_LABELS[s] || s, value: v, color: STATUT_COLORS[s] }));

  const total = kpis.quantiteTotale || 1;

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
        <Kpi label="Mugs produits" value={fmtNumber(kpis.quantiteTotale)} delta={deltas?.mugs} />
        <Kpi label="Commandes" value={fmtNumber(kpis.nbCommandes)} delta={deltas?.commandes} />
        <Kpi label="Coût d'achat ESAT" value={fmtNumber(kpis.coutAchat)} suffix="€" delta={deltas?.cout} />
        <Kpi label="Taux de rebut" value={kpis.tauxRebut} suffix="%" />
        <Kpi label="Délai moyen prod." value={kpis.delaiMoyenJours ?? '—'} suffix={kpis.delaiMoyenJours != null ? 'j' : ''} />
        <Kpi label="À produire" value={fmtNumber(kpis.aProduire)} suffix={`mugs · ${kpis.aProduireCommandes} cmd`} />
        <Kpi label="Clients" value={fmtNumber(kpis.nbClients)} />
      </div>

      {/* Rentabilité (admin) */}
      {isAdmin && marge && (
        <div className="card span2 marge-card">
          <div className="card-head">
            <h2>Rentabilité <span className="admin-tag">admin</span></h2>
            <span className="muted">{marge.nbCommandes}/{marge.nbTotal} commandes avec prix de vente</span>
          </div>
          {marge.nbCommandes === 0 ? (
            <p className="muted">Renseignez un prix de vente sur les commandes pour voir la marge.</p>
          ) : (
            <div className="marge-metrics">
              <div><span className="mm-lbl">Chiffre d'affaires</span><span className="mm-val">{fmtNumber(marge.ca)} €</span></div>
              <div><span className="mm-lbl">Coût ESAT</span><span className="mm-val">{fmtNumber(marge.cout)} €</span></div>
              <div><span className="mm-lbl">Marge</span><span className={`mm-val ${marge.marge >= 0 ? 'marge-pos' : 'marge-neg'}`}>{fmtNumber(marge.marge)} €</span></div>
              <div><span className="mm-lbl">Taux de marge</span><span className="mm-val">{marge.taux != null ? `${marge.taux} %` : '—'}</span></div>
            </div>
          )}
        </div>
      )}

      {/* Production 12 mois + N-1 */}
      <div className="card span2">
        <div className="card-head">
          <h2>Production sur 12 mois</h2>
          <div className="stats-toolbar">
            <div className="chart-legend">
              <span><span className="dot" style={{ background: '#2a78d6' }} />Cette année</span>
              {hasPrev && <span><span className="dot dash" />Année préc.</span>}
            </div>
            <div className="toggle">
              <button className={`btn btn-xs ${metric === 'quantite' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetric('quantite')}>Mugs</button>
              <button className={`btn btn-xs ${metric === 'commandes' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMetric('commandes')}>Commandes</button>
            </div>
          </div>
        </div>
        {mois12.length === 0 ? <p className="muted">Pas assez de données.</p> : (
          <LineChart
            labels={labels}
            series={[
              { label: 'Cette année', color: '#2a78d6', data: cur },
              ...(hasPrev ? [{ label: 'Année préc.', color: '#888780', dash: true, data: prev }] : []),
            ]}
          />
        )}
      </div>

      <div className="stats-grid">
        {/* Charge de production */}
        <div className="card">
          <div className="card-head">
            <h2>Charge de production</h2>
            <span className="muted">{fmtNumber(kpis.aProduire)} mugs à produire</span>
          </div>
          <HBars data={charge} labelKey="statut" valueKey="quantite" />
        </div>

        {/* Avancement (hors expédiées) */}
        <div className="card">
          <h2>Avancement (hors expédiées)</h2>
          {donutSegments.length === 0
            ? <p className="muted">Aucune commande en cours.</p>
            : <Donut segments={donutSegments} />}
        </div>

        {/* Top clients en % */}
        <div className="card">
          <h2>Top clients (part du volume)</h2>
          <HBars data={topClients} labelKey="client" valueKey="quantite" max={total}
                 format={(v) => `${Math.round((v / total) * 100)}%`} />
        </div>

        {/* Retards */}
        <div className="card">
          <h2>⚠️ Retards à surveiller</h2>
          {retards.length === 0 ? <p className="muted">Aucun retard. 👍</p> : (
            <ul className="retards">
              {retards.map((r, i) => (
                <li key={i}>
                  <div>
                    <div className="strong">{r.client} · {r.designation}</div>
                    <div className="muted small">{fmtNumber(r.quantite)} mugs · sortie {fmtDate(r.dateLivraison)}</div>
                  </div>
                  <div className="retard-right">
                    <StatutBadge statut={r.statut} />
                    <span className="retard-jours">{r.joursRetard} j de retard</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Par type de mug */}
        <div className="card">
          <h2>Par type de mug (mugs)</h2>
          <HBars data={typesMug} labelKey="type" valueKey="quantite" />
        </div>

        {/* Par atelier */}
        <div className="card">
          <h2>Par atelier (commandes)</h2>
          <HBars data={ateliers} labelKey="atelier" valueKey="count" />
        </div>
      </div>
    </>
  );
}
