// ─────────────────────────────────────────────────────────────
//  Liste des documents d'une commande (bons de commande, rendus 3D…).
//  Ligne par fichier : icône selon le type, aperçu, téléchargement,
//  suppression. Distinct de la galerie de visuels.
// ─────────────────────────────────────────────────────────────
import { FileText, FileImage, FileSpreadsheet, File, Download, Trash } from 'lucide-react';
import { api } from '../api.js';
import { fmtSize, fmtDate } from '../format.js';
import { useConfirm, useToast } from '../ui/feedback.jsx';

function typeDoc(type, nom) {
  const t = type || '';
  const n = (nom || '').toLowerCase();
  if (t.startsWith('image/')) return { Icone: FileImage, cls: 'is-img' };
  if (t === 'application/pdf') return { Icone: FileText, cls: 'is-pdf' };
  if (t.includes('word') || /\.docx?$/.test(n)) return { Icone: FileText, cls: 'is-word' };
  if (t.includes('sheet') || t.includes('excel') || t === 'text/csv' || /\.(xlsx?|csv)$/.test(n)) return { Icone: FileSpreadsheet, cls: 'is-sheet' };
  return { Icone: File, cls: '' };
}

export default function DocumentsList({ commandeId, fichiers, onChange }) {
  const base = `/api/commandes/${commandeId}/fichiers`;
  const confirmer = useConfirm();
  const toast = useToast();

  const supprimer = async (f) => {
    const ok = await confirmer({
      title: 'Supprimer ce document ?',
      message: <>« {f.nom} » sera définitivement supprimé.</>,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`${base}/${f.id}`);
      toast.success('Document supprimé');
      onChange();
    } catch (err) { toast.error(err.message); }
  };

  if (fichiers.length === 0) return null;

  return (
    <ul className="doc-list">
      {fichiers.map((f) => {
        const { Icone, cls } = typeDoc(f.type, f.nom);
        return (
          <li key={f.id} className="doc-row">
            <span className={`doc-icon ${cls}`}><Icone /></span>
            <span className="doc-text">
              <a className="doc-name" href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer" title={f.nom}>{f.nom}</a>
              <span className="doc-meta">{fmtSize(f.taille)} · ajouté le {fmtDate(f.createdAt)}</span>
            </span>
            <span className="doc-actions">
              <a className="btn btn-ghost btn-icon btn-sm" href={`${base}/${f.id}/download`} title="Télécharger" aria-label={`Télécharger ${f.nom}`}><Download /></a>
              <button type="button" className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => supprimer(f)}
                      title="Supprimer" aria-label={`Supprimer ${f.nom}`}><Trash /></button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
