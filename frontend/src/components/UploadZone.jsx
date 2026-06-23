// ─────────────────────────────────────────────────────────────
//  Zone d'upload : glisser-déposer + sélection par clic.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function UploadZone({ commandeId, ligneId = null, onUploaded, compact = false }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Endpoint : par ligne si ligneId fourni, sinon au niveau commande.
  const endpoint = ligneId
    ? `/commandes/${commandeId}/fichiers/ligne/${ligneId}`
    : `/commandes/${commandeId}/fichiers`;

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
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          hidden
          onChange={(e) => envoyer(e.target.files)}
        />
        {busy
          ? <span>Envoi en cours… {progress}%</span>
          : (compact
              ? <span>📤 Ajouter des visuels à cette ligne</span>
              : <span>📤 Glissez-déposez vos visuels ici, ou cliquez pour parcourir<br />
                  <small className="muted">JPG, PNG, GIF, WEBP, PDF — 10 Mo max par fichier</small></span>)}
      </div>
      {busy && (
        <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
