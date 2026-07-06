// ─────────────────────────────────────────────────────────────
//  Zone d'upload : glisser-déposer + sélection par clic.
//  categorie "document" : bons de commande, rendus 3D… (types élargis,
//  conservés après expédition) — sinon visuels de production.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { api } from '../api.js';

const ACCEPT_VISUELS = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
const ACCEPT_DOCS = `${ACCEPT_VISUELS},.doc,.docx,.xls,.xlsx,.csv`;

export default function UploadZone({ commandeId, ligneId = null, onUploaded, compact = false, categorie = 'visuel' }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const isDoc = categorie === 'document';

  // Endpoint : documents, ligne précise, ou visuels au niveau commande.
  const endpoint = isDoc
    ? `/commandes/${commandeId}/fichiers/documents`
    : (ligneId
        ? `/commandes/${commandeId}/fichiers/ligne/${ligneId}`
        : `/commandes/${commandeId}/fichiers`);

  const envoyer = async (files) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      await api.uploadWithProgress(endpoint, files, setProgress);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    envoyer(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        className={`dropzone ${dragOver ? 'over' : ''} ${compact ? 'dropzone-sm' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={isDoc ? ACCEPT_DOCS : ACCEPT_VISUELS}
          hidden
          onChange={(e) => envoyer(e.target.files)}
        />
        {busy
          ? <span>Envoi en cours… {progress}%</span>
          : (isDoc
              ? <span>📎 Ajouter des documents (bon de commande, rendu 3D…)<br />
                  <small className="muted">JPG, PNG, PDF, Word, Excel, CSV — conservés, jamais supprimés automatiquement</small></span>
              : (compact
                  ? <span>📤 Ajouter des visuels à cette ligne</span>
                  : <span>📤 Glissez-déposez vos visuels ici, ou cliquez pour parcourir<br />
                      <small className="muted">JPG, PNG, GIF, WEBP, PDF — gros fichiers : utilisez le lien WeTransfer/Smash</small></span>))}
      </div>
      {busy && (
        <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
