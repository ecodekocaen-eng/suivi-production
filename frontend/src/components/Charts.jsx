// ─────────────────────────────────────────────────────────────
//  Petits graphiques en SVG/CSS, sans dépendance externe.
// ─────────────────────────────────────────────────────────────
import { fmtNumber } from '../format.js';

// Histogramme vertical (ex : quantité par mois).
export function BarChart({ data, valueKey, labelKey, height = 180 }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="barchart" style={{ height: height + 32 }}>
      {data.map((d, i) => {
        const h = Math.round((d[valueKey] / max) * height);
        return (
          <div className="bar-col" key={i} title={`${d[labelKey]} : ${fmtNumber(d[valueKey])}`}>
            <span className="bar-val">{d[valueKey] >= 1000 ? `${Math.round(d[valueKey] / 1000)}k` : d[valueKey]}</span>
            <div className="bar" style={{ height: `${h}px` }} />
            <span className="bar-label">{d[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

// Courbe (une ou deux séries) — ex : production mensuelle + comparaison N-1.
export function LineChart({ labels, series, height = 210 }) {
  const W = 640; const padL = 40; const padR = 10; const padT = 10; const padB = 26;
  const n = labels.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const x = (i) => padL + (i * (W - padL - padR)) / (n - 1 || 1);
  const y = (v) => padT + (1 - v / max) * (height - padT - padB);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <svg className="linechart" viewBox={`0 0 ${W} ${height}`} role="img"
         aria-label={`Courbe : ${series.map((s) => s.label).join(' et ')}`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="lc-grid" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="lc-tick">
            {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
          </text>
        </g>
      ))}
      {series.map((s, si) => (
        <polyline key={si} fill="none" stroke={s.color} strokeWidth="2"
                  strokeDasharray={s.dash ? '5 4' : 'none'} strokeLinejoin="round" strokeLinecap="round"
                  points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      ))}
      {labels.map((l, i) => (
        (i % 2 === 0 || n <= 12) && (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="lc-tick">{l}</text>
        )
      ))}
    </svg>
  );
}

// Barres horizontales avec libellé + valeur (ex : top clients, types de mug).
export function HBars({ data, labelKey, valueKey, max, format = fmtNumber }) {
  const m = max ?? Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="hbars">
      {data.map((d, i) => (
        <div className="hbar-row" key={i}>
          <span className="hbar-label" title={d[labelKey]}>{d[labelKey]}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d[valueKey] / m) * 100}%` }} />
          </div>
          <span className="hbar-val">{format(d[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}

// Donut SVG (ex : répartition par statut). segments = [{label, value, color}].
export function Donut({ segments, size = 160, thickness = 26 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut">
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {segments.map((s, i) => {
            const len = (s.value / total) * circ;
            const el = (
              <circle
                key={i}
                cx={cx} cy={cx} r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x="50%" y="48%" textAnchor="middle" className="donut-total">{fmtNumber(total)}</text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-sub">total</text>
      </svg>
      <ul className="legend">
        {segments.map((s, i) => (
          <li key={i}>
            <span className="dot" style={{ background: s.color }} />
            {s.label} <strong>{fmtNumber(s.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
