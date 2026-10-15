// ─────────────────────────────────────────────────────────────
//  Galerie de visuels : vignettes (fond damier pour la transparence),
//  ouverture, téléchargement, suppression (avec confirmation).
// ─────────────────────────────────────────────────────────────
import { Download, ExternalLink, Trash, FileText } from 'lucide-react';
import { api } from '../api.js';
import { fmtSize, fmtDate } from '../format.js';
import { useConfirm, useToast } from '../ui/feedback.jsx';

export default function GalerieVisuels({ commandeId, fichiers, onChange, lectureSeule = false }) {
  const base = `/api/commandes/${commandeId}/fichiers`;
  const confirmer = useConfirm();
  const toast = useToast();

  const supprimer = async (f) => {
    const ok = await confirmer({
      title: 'Supprimer ce visuel ?',
      message: <>« {f.nom} » sera définitivement supprimé.</>,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`${base}/${f.id}`);
      toast.success('Visuel supprimé');
      onChange();
    } catch (err) { toast.error(err.message); }
  };

  if (fichiers.length === 0) return null;

  return (
    <div className="gallery">
      {fichiers.map((f) => {
        const isImage = (f.type || '').startsWith('image/');
        return (
          <figure className="tile" key={f.id} style={{ margin: 0 }}>
            <a className="tile-media" href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer" title={`Ouvrir ${f.nom}`}>
              {isImage
                ? <img src={`${base}/${f.id}/view`} alt={f.nom} loading="lazy" />
                : <span className="tile-file"><FileText />PDF</span>}
            </a>
            <figcaption className="tile-info">
              <div className="tile-name" title={f.nom}>{f.nom}</div>
              <div className="tile-meta">{fmtSize(f.taille)} · {fmtDate(f.createdAt)}</div>
            </figcaption>
            <div className="tile-actions">
              <a className="btn btn-secondary btn-icon btn-xs" href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer"
                 title="Ouvrir dans un nouvel onglet" aria-label={`Ouvrir ${f.nom}`}><ExternalLink /></a>
              <a className="btn btn-secondary btn-icon btn-xs" href={`${base}/${f.id}/download`}
                 title="Télécharger" aria-label={`Télécharger ${f.nom}`}><Download /></a>
              {!lectureSeule && (
                <button type="button" className="btn btn-danger-ghost btn-icon btn-xs" onClick={() => supprimer(f)}
                        title="Supprimer" aria-label={`Supprimer ${f.nom}`}><Trash /></button>
              )}
            </div>
          </figure>
        );
      })}
    </div>
  );
}
