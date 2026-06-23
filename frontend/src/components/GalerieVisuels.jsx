// ─────────────────────────────────────────────────────────────
//  Galerie de visuels : miniatures, téléchargement, suppression, zip.
// ─────────────────────────────────────────────────────────────
import { api } from '../api.js';
import { fmtSize, fmtDateTime } from '../format.js';

export default function GalerieVisuels({ commandeId, fichiers, onChange, showZip = true }) {
  const base = `/api/commandes/${commandeId}/fichiers`;

  const supprimer = async (f) => {
    if (!window.confirm(`Supprimer le visuel « ${f.nom} » ?`)) return;
    await api.del(`${base}/${f.id}`);
    onChange();
  };

  if (fichiers.length === 0) return <p className="muted">Aucun visuel.</p>;

  return (
    <>
      {showZip && (
        <div className="gallery-head">
          <a className="btn btn-primary btn-sm" href={`${base}/zip`}>⬇ Tout télécharger (zip)</a>
        </div>
      )}
      <div className="gallery">
        {fichiers.map((f) => {
          const isImage = (f.type || '').startsWith('image/');
          return (
            <figure className="thumb" key={f.id}>
              <a href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer">
                {isImage
                  ? <img src={`${base}/${f.id}/view`} alt={f.nom} loading="lazy" />
                  : <span className="file-icon">📄 PDF</span>}
              </a>
              <figcaption title={f.nom}>{f.nom}</figcaption>
              <div className="thumb-meta muted">{fmtSize(f.taille)} · {fmtDateTime(f.createdAt)}</div>
              <div className="thumb-actions">
                <a className="btn btn-ghost btn-xs" href={`${base}/${f.id}/download`}>⬇</a>
                <button className="btn btn-danger btn-xs" onClick={() => supprimer(f)}>✕</button>
              </div>
            </figure>
          );
        })}
      </div>
    </>
  );
}
