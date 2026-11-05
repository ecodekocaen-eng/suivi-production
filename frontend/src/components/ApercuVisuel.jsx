// ─────────────────────────────────────────────────────────────
//  Aperçu d'un visuel de commande : l'image elle-même, la vignette du modèle
//  de la base de données, ou, pour un PDF déposé à la main, sa 1re page rendue
//  dans le navigateur. Ce rendu se fait une fois à l'écran, un fichier à la
//  fois ; ensuite le PDF est dans le cache du navigateur.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

// Au-delà, le rendu dans le navigateur serait trop lourd.
const TAILLE_MAX_RENDU = 30 * 1024 * 1024;

const rendus = new Map(); // id du fichier → promesse de l'adresse de sa vignette
let attente = Promise.resolve();

function rendrePdf(adresse, fichier) {
  if (!rendus.has(fichier.id)) {
    const rendu = attente.then(async () => {
      const reponse = await fetch(adresse, { credentials: 'include' });
      if (!reponse.ok) throw new Error(`Erreur ${reponse.status}`);
      const pdf = new File([await reponse.blob()], fichier.nom, { type: 'application/pdf' });
      const { vignette } = await import('../pdf.js');
      return URL.createObjectURL(await vignette(pdf));
    });
    attente = rendu.catch(() => {}); // un PDF illisible ne bloque pas les suivants
    rendus.set(fichier.id, rendu);
  }
  return rendus.get(fichier.id);
}

export default function ApercuVisuel({ commandeId, fichier, apercu }) {
  const adresse = `/api/commandes/${commandeId}/fichiers/${fichier.id}/view`;
  const direct = (fichier.type || '').startsWith('image/') ? adresse : apercu;
  const [rendu, setRendu] = useState(null);
  const [illisible, setIllisible] = useState(false);
  const zone = useRef(null);
  const aRendre = !direct && !illisible && (fichier.taille || 0) <= TAILLE_MAX_RENDU;

  useEffect(() => {
    if (!aRendre || rendu) return undefined;
    let actif = true;
    const observateur = new IntersectionObserver(([entree]) => {
      if (!entree.isIntersecting) return;
      observateur.disconnect();
      rendrePdf(adresse, fichier).then(
        (url) => { if (actif) setRendu(url); },
        () => { if (actif) setIllisible(true); },
      );
    }, { rootMargin: '200px' });
    observateur.observe(zone.current);
    return () => { actif = false; observateur.disconnect(); };
    // `fichier` change à chaque rechargement de la fiche : seul son id compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aRendre, rendu, adresse, fichier.id]);

  const source = direct || rendu;
  if (source && !illisible) {
    return <span className="apercu"><img src={source} alt="" loading="lazy" onError={() => setIllisible(true)} /></span>;
  }
  return <span className="apercu is-vide" ref={zone}><FileText /></span>;
}
