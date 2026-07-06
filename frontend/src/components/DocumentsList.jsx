// ─────────────────────────────────────────────────────────────
//  Liste des documents d'une commande (bons de commande, rendus 3D…).
//  Ligne par fichier : icône selon le type, aperçu, téléchargement,
//  suppression. Distinct de la galerie de visuels.
// ─────────────────────────────────────────────────────────────
import { api } from '../api.js';
import { fmtSize, fmtDateTime } from '../format.js';

function iconePour(type, nom) {
  const t = type || '';
  const n = (nom || '').toLowerCase();
  if (t.startsWith('image/')) return '🖼️';
  if (t === 'application/pdf') return '📄';
  if (t.includes('word') || /\.docx?$/.test(n)) return '📝';
  if (t.includes('sheet') || t.includes('excel') || t === 'text/csv' || /\.(xlsx?|csv)$/.test(n)) return '📊';
  return '📎';
}

export default function DocumentsList({ commandeId, fichiers, onChange }) {
  const base = `/api/commandes/${commandeId}/fichiers`;

  const supprimer = async (f) => {
    if (!window.confirm(`Supprimer le document « ${f.nom} » ?`)) return;
    await api.del(`${base}/${f.id}`);
    onChange();
  };

  if (fichiers.length === 0) return <p className="muted">Aucun document.</p>;

  return (
    <ul className="doc-list">
      {fichiers.map((f) => (
        <li key={f.id} className="doc-row">
          <span className="doc-icon">{iconePour(f.type, f.nom)}</span>
          <a className="doc-nom" href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer" title={f.nom}>
            {f.nom}
          </a>
          <span className="doc-meta muted">{fmtSize(f.taille)} · {fmtDateTime(f.createdAt)}</span>
          <span className="doc-actions">
            <a className="btn btn-ghost btn-xs" href={`${base}/${f.id}/download`} title="Télécharger">⬇</a>
            <button className="btn btn-danger btn-xs" onClick={() => supprimer(f)} title="Supprimer">✕</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
