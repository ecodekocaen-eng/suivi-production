// ─────────────────────────────────────────────────────────────
//  Zone d'upload : glisser-déposer + sélection par clic (ou clavier).
//  categorie "document" : bons de commande, rendus 3D… (types élargis,
//  conservés après expédition) — sinon visuels de production.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Upload, FilePlus, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../ui/feedback.jsx';

const ACCEPT_VISUELS = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
const ACCEPT_DOCS = `${ACCEPT_VISUELS},.doc,.docx,.xls,.xlsx,.csv`;

export default function UploadZone({ commandeId, ligneId = null, onUploaded, compact = false, categorie = 'visuel' }) {
  const inputRef = useRef(null);
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const isDoc = categorie === 'document';

  // Endpoint : documents, ligne précise, ou visuels au niveau commande.
  const endpoint = isDoc
    ? `/commandes/${commandeId}/fichiers/documents`
    : (ligneId
        ? `/commandes/${commandeId}/fichiers/ligne/${ligneId}`
        : `/commandes/${commandeId}/fichiers`);

  const envoyer = async (files) => {
    if (!files || files.length === 0 || busy) return;
    const n = files.length;
    setBusy(true);
    setProgress(0);
    try {
      await api.uploadWithProgress(endpoint, files, setProgress);
      toast.success(isDoc
        ? `${n} document${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`
        : `${n} visuel${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`);
      onUploaded();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    envoyer(e.dataTransfer.files);
  };

  const titre = isDoc ? 'Ajouter des documents' : (compact ? 'Ajouter des visuels à cette ligne' : 'Ajouter des visuels');
  const aide = isDoc
    ? 'Glissez-déposez ou cliquez · PDF, images, Word, Excel, CSV'
    : (compact
        ? 'Glissez-déposez ou cliquez · JPG, PNG, GIF, WEBP, PDF'
        : 'Glissez-déposez ou cliquez · JPG, PNG, GIF, WEBP, PDF — gros fichiers : lien WeTransfer/Smash');

  return (
    <div>
      <div
        className={`dropzone${dragOver ? ' is-over' : ''}${compact ? ' dropzone-compact' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" multiple accept={isDoc ? ACCEPT_DOCS : ACCEPT_VISUELS} hidden
               onChange={(e) => envoyer(e.target.files)} />
        <span className="dropzone-icon">
          {busy ? <LoaderCircle className="spin" /> : (isDoc ? <FilePlus /> : <Upload />)}
        </span>
        <span className="dropzone-text">
          <strong>{busy ? `Envoi en cours… ${progress} %` : titre}</strong>
          {!busy && <span>{aide}</span>}
        </span>
      </div>
      {busy && <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>}
    </div>
  );
}
