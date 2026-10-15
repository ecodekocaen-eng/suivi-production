// ─────────────────────────────────────────────────────────────
//  Petits graphiques en SVG/CSS, sans dépendance externe.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { fmtNumber } from '../format.js';

const court = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k`.replace('.', ',') : fmtNumber(v));

// Courbe (une ou deux séries) — ex : production mensuelle + comparaison N-1.
// Survol : repère vertical + infobulle avec les valeurs du mois.
export function LineChart({ labels, titres = labels, series, height = 210 }) {
  const [survol, setSurvol] = useState(null);
  const W = 680; const padL = 44; const padR = 14; const padT = 16; const padB = 28;
  const n = labels.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const x = (i) => padL + (i * (W - padL - padR)) / (n - 1 || 1);
  const y = (v) => padT + (1 - v / max) * (height - padT - padB);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const pas = (W - padL - padR) / (n - 1 || 1);
  const principale = series[0];

  // Aire sous la courbe principale (dégradé discret).
  const aire = principale
    ? `M${x(0)},${y(0)} ${principale.data.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)} Z`
    : '';

  const tipW = 132;
  const tipX = survol != null ? Math.min(Math.max(x(survol) - tipW / 2, padL), W - padR - tipW) : 0;

  return (
    <svg className="linechart" viewBox={`0 0 ${W} ${height}`} role="img"
         aria-label={`Courbe : ${series.map((s) => s.label).join(' et ')}`}
         onMouseLeave={() => setSurvol(null)}>
      <defs>
        <linearGradient id="lc-aire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={principale?.color} stopOpacity=".16" />
          <stop offset="100%" stopColor={principale?.color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="lc-grid" strokeDasharray={i === 0 ? 'none' : '3 4'} />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="lc-tick">{court(t)}</text>
        </g>
      ))}
      {principale && <path d={aire} fill="url(#lc-aire)" />}
      {series.map((s, si) => (
        <polyline key={si} fill="none" stroke={s.color} strokeWidth={si === 0 ? 2.5 : 2}
                  strokeDasharray={s.dash ? '5 5' : 'none'} strokeLinejoin="round" strokeLinecap="round"
                  points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      ))}
      {labels.map((l, i) => (
        (n <= 12 || i % 2 === 0) && (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="lc-tick">{l}</text>
        )
      ))}
      {survol != null && (
        <g pointerEvents="none">
          <line x1={x(survol)} x2={x(survol)} y1={padT} y2={height - padB} stroke="var(--border-2)" />
          {series.map((s, si) => (
            <circle key={si} cx={x(survol)} cy={y(s.data[survol])} r="4.5" className="lc-point" stroke={s.color} />
          ))}
          <g className="lc-tip" transform={`translate(${tipX}, ${padT})`}>
            <rect width={tipW} height={18 + series.length * 16} rx="7" />
            <text x="10" y="15">{titres[survol]}</text>
            {series.map((s, si) => (
              <text key={si} x="10" y={31 + si * 16} fill={s.dash ? '#d6cfc7' : '#fff'}>
                {s.label} : {fmtNumber(s.data[survol])}
              </text>
            ))}
          </g>
        </g>
      )}
      {labels.map((_, i) => (
        <rect key={i} className="lc-hit" x={x(i) - pas / 2} y={0} width={pas} height={height}
              onMouseEnter={() => setSurvol(i)} />
      ))}
    </svg>
  );
}

// Barres horizontales avec libellé + valeur (ex : top clients, types de mug).
export function HBars({ data, labelKey, valueKey, max, format = fmtNumber, labelFormat = (v) => v, colors = null }) {
  const m = max ?? Math.max(1, ...data.map((d) => d[valueKey]));
  if (!data.length) return <p className="muted small">Pas encore de données.</p>;
  return (
    <div className="hbars">
      {data.map((d, i) => (
        <div className="hbar" key={i}>
          <div className="hbar-top">
            <span className="hbar-label" title={d[labelKey]}>{labelFormat(d[labelKey])}</span>
            <span className="hbar-val">{format(d[valueKey])}</span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{
              width: `${Math.max((d[valueKey] / m) * 100, d[valueKey] > 0 ? 1.5 : 0)}%`,
              ...(colors?.[d[labelKey]] ? { background: colors[d[labelKey]] } : {}),
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Donut SVG (ex : répartition par statut). segments = [{label, value, color}].
export function Donut({ segments, size = 168, thickness = 22, sousTitre = 'commandes' }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const ecart = segments.length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut" role="img"
           aria-label={segments.map((s) => `${s.label} : ${s.value}`).join(', ')}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {segments.map((s, i) => {
            const len = (s.value / total) * circ;
            const el = (
              <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
                      strokeDasharray={`${Math.max(len - ecart, 0)} ${circ - Math.max(len - ecart, 0)}`}
                      strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="49%" textAnchor="middle" className="donut-total">{fmtNumber(total)}</text>
        <text x="50%" y="61%" textAnchor="middle" className="donut-sub">{sousTitre}</text>
      </svg>
      <ul className="legend">
        {segments.map((s, i) => (
          <li key={i}>
            <span className="dot" style={{ background: s.color }} />
            {s.label}
            <strong>{fmtNumber(s.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
