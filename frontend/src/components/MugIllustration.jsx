// ─────────────────────────────────────────────────────────────
//  Illustration d'un produit SANS photo : un mug dessiné (dégradés,
//  reflet, anse, ombre) dont l'aspect est déduit du nom du produit —
//  blanc, mat, bicolore, noir / magique, pailleté — ou une étiquette.
//  Dès qu'une vraie photo est chargée dans Produits, c'est elle qui s'affiche.
// ─────────────────────────────────────────────────────────────
import { useId } from 'react';

const sansAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function aspectProduit(nom) {
  const n = sansAccents(nom);
  if (/ETIQUET|STICKER|TAG\b/.test(n)) return { type: 'etiquette' };
  const a = { type: 'mug', corps: ['#e9e7e4', '#ffffff', '#dcd9d5'], interieur: '#e4e1dc', anse: null, reflet: 0.85, paillettes: false };
  if (/NOIR|MAGIQUE|MAGIC/.test(n)) { a.corps = ['#1d1c1e', '#4a484c', '#141315']; a.interieur = '#f2f0ec'; a.reflet = 0.25; }
  if (/PAILLET|SPARK|GLITTER/.test(n)) { a.corps = ['#b88a2c', '#f1d38a', '#9c7424']; a.interieur = '#f7f4ef'; a.paillettes = true; a.reflet = 0.35; }
  if (/BICOLORE/.test(n)) { a.interieur = '#8a2b36'; a.anse = '#8a2b36'; }
  if (/\bMAT\b/.test(n)) a.reflet = 0.25;
  return a;
}

// Points de paillettes, toujours aux mêmes endroits (pas d'aléatoire au rendu).
const PAILLETTES = Array.from({ length: 46 }, (_, i) => ({
  x: 60 + ((i * 37) % 78),
  y: 62 + ((i * 53) % 96),
  r: 0.9 + ((i * 7) % 3) * 0.55,
  o: 0.35 + ((i * 11) % 5) * 0.12,
}));

function Mug({ a, id }) {
  const anse = a.anse || a.corps[2];
  return (
    <>
      <defs>
        <linearGradient id={`${id}-c`} x1="0" x2="1">
          <stop offset="0" stopColor={a.corps[0]} />
          <stop offset=".38" stopColor={a.corps[1]} />
          <stop offset="1" stopColor={a.corps[2]} />
        </linearGradient>
        <linearGradient id={`${id}-i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.interieur} stopOpacity=".55" />
          <stop offset="1" stopColor={a.interieur} />
        </linearGradient>
        <radialGradient id={`${id}-o`}>
          <stop offset="0" stopColor="#000" stopOpacity=".18" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Ombre portée */}
      <ellipse cx="98" cy="170" rx="62" ry="10" fill={`url(#${id}-o)`} />
      {/* Anse (derrière le corps) */}
      <path d="M134 74 C 170 70, 172 136, 134 134" fill="none" stroke={anse} strokeWidth="13" strokeLinecap="round" />
      <path d="M134 74 C 170 70, 172 136, 134 134" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="4" strokeLinecap="round" transform="translate(-2 -2)" />
      {/* Corps */}
      <path d="M52 54 L52 156 Q52 168 94 168 Q136 168 136 156 L136 54 Z" fill={`url(#${id}-c)`} />
      {a.paillettes && PAILLETTES.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#fff" opacity={p.o} />
      ))}
      {/* Reflet vertical */}
      <rect x="66" y="62" width="9" height="92" rx="4.5" fill="#fff" opacity={a.reflet * 0.55} />
      {/* Ouverture : bord + intérieur */}
      <ellipse cx="94" cy="54" rx="42" ry="10" fill={a.corps[1]} />
      <ellipse cx="94" cy="55" rx="38" ry="7.5" fill={`url(#${id}-i)`} />
    </>
  );
}

function Etiquette({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-e`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf4f5" />
          <stop offset="1" stopColor="#f0dcdf" />
        </linearGradient>
        <radialGradient id={`${id}-o`}>
          <stop offset="0" stopColor="#000" stopOpacity=".14" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="102" cy="166" rx="58" ry="8" fill={`url(#${id}-o)`} />
      {/* Ficelle */}
      <path d="M58 70 C 40 50, 46 30, 66 34" fill="none" stroke="#a8a097" strokeWidth="2.5" strokeLinecap="round" />
      {/* Étiquette inclinée */}
      <g transform="rotate(-8 100 100)">
        <path d="M70 52 L156 52 Q164 52 164 60 L164 148 Q164 156 156 156 L70 156 L44 104 Z" fill={`url(#${id}-e)`} stroke="#8a2b36" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="66" cy="104" r="6" fill="#fff" stroke="#8a2b36" strokeWidth="2.5" />
        <rect x="86" y="84" width="58" height="8" rx="4" fill="#8a2b36" />
        <rect x="86" y="102" width="50" height="5" rx="2.5" fill="#c99aa0" />
        <rect x="86" y="115" width="42" height="5" rx="2.5" fill="#c99aa0" />
      </g>
    </>
  );
}

export default function MugIllustration({ nom, className = '', title }) {
  const id = useId().replace(/:/g, '');
  const a = aspectProduit(nom);
  return (
    <svg className={`mug-illu ${className}`} viewBox="0 0 200 200" role="img" aria-label={title || nom || 'Produit'}>
      {a.type === 'etiquette' ? <Etiquette id={id} /> : <Mug a={a} id={id} />}
    </svg>
  );
}
