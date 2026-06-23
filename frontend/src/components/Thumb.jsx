// ─────────────────────────────────────────────────────────────
//  Miniature avec aperçu agrandi au survol (CSS only).
// ─────────────────────────────────────────────────────────────
export default function Thumb({ src, alt = '', size = 30 }) {
  return (
    <span className="thumb-zoom" style={{ '--thumb-size': `${size}px` }}>
      <img className="thumb-zoom-sm" src={src} alt={alt} loading="lazy" />
      <img className="thumb-zoom-lg" src={src} alt="" aria-hidden="true" />
    </span>
  );
}
