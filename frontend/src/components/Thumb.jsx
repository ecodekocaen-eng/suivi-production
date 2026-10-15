// ─────────────────────────────────────────────────────────────
//  Miniature produit avec aperçu agrandi au survol (CSS only).
//  Sans image : pastille neutre avec une icône de mug.
// ─────────────────────────────────────────────────────────────
import { Coffee } from 'lucide-react';

export default function Thumb({ src, alt = '', size = 32 }) {
  if (!src) {
    return (
      <span className="thumb-ph" style={{ '--thumb-size': `${size}px` }} aria-hidden="true">
        <Coffee />
      </span>
    );
  }
  return (
    <span className="thumb-zoom" style={{ '--thumb-size': `${size}px` }}>
      <img className="thumb-zoom-sm" src={src} alt={alt} loading="lazy" />
      <img className="thumb-zoom-lg" src={src} alt="" aria-hidden="true" />
    </span>
  );
}

// URL de la miniature d'un produit du catalogue (ou null s'il n'en a pas).
// La clé de stockage change à chaque remplacement : elle sert de « version »
// pour que le navigateur affiche tout de suite la nouvelle photo.
export const imageProduit = (p) => (p?.image ? `/api/produits/${p.id}/image?v=${encodeURIComponent(p.image)}` : null);
