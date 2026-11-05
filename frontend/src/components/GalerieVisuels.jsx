// ─────────────────────────────────────────────────────────────
//  Visuels d'une ligne, dans son panneau de détail : grand aperçu,
//  ouverture, téléchargement, remplacement et suppression (avec confirmation).
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Download, ExternalLink, LoaderCircle, Trash, Upload } from 'lucide-react';
import { api } from '../api.js';
import { fmtSize, fmtDate } from '../format.js';
import { envoyerFichiers } from '../televersement.js';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import ApercuVisuel from './ApercuVisuel.jsx';
import { ACCEPT_VISUELS } from './UploadZone.jsx';

export default function GalerieVisuels({ commandeId, ligneId = null, fichiers, apercus, remplacable = false, onChange }) {
  const base = `/api/commandes/${commandeId}/fichiers`;
  const confirmer = useConfirm();
  const toast = useToast();
  const selecteur = useRef(null);
  const [aRemplacer, setARemplacer] = useState(null);
  const [remplacement, setRemplacement] = useState(false);

  const supprimer = async (f) => {
    const ok = await confirmer({
      title: 'Supprimer ce visuel ?',
      message: <>« {f.nom} » sera définitivement supprimé.</>,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      // `base` sert aux liens du navigateur ; api.* ajoute déjà « /api ».
      await api.del(`/commandes/${commandeId}/fichiers/${f.id}`);
      toast.success('Visuel supprimé');
      onChange();
    } catch (err) { toast.error(err.message); }
  };

  // Le nouveau fichier d'abord : si son envoi échoue, l'ancien reste en place.
  const remplacer = async (nouveau) => {
    if (!nouveau || !aRemplacer) return;
    setRemplacement(true);
    try {
      await envoyerFichiers({ commandeId, ligneId, files: [nouveau] });
      await api.del(`/commandes/${commandeId}/fichiers/${aRemplacer.id}`);
      toast.success('Visuel remplacé');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemplacement(false);
      setARemplacer(null);
      onChange();
    }
  };

  if (fichiers.length === 0) return null;

  return (
    <div className="visuels">
      <input ref={selecteur} type="file" accept={ACCEPT_VISUELS} hidden
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; remplacer(f); }} />
      {fichiers.map((f) => (
        <figure className="visuel" key={f.id}>
          <a href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer" title={`Ouvrir ${f.nom}`}>
            <ApercuVisuel commandeId={commandeId} fichier={f} apercu={apercus?.[f.id]} />
          </a>
          <figcaption>
            <span className="visuel-nom" title={f.nom}>{f.nom}</span>
            <span className="visuel-meta">{fmtSize(f.taille)} · {fmtDate(f.createdAt)}</span>
          </figcaption>
          <div className="visuel-boutons">
            <a className="btn btn-secondary btn-sm" href={`${base}/${f.id}/view`} target="_blank" rel="noopener noreferrer"><ExternalLink />Ouvrir</a>
            <a className="btn btn-secondary btn-sm" href={`${base}/${f.id}/download`}><Download />Télécharger</a>
            {remplacable && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={remplacement}
                      onClick={() => { setARemplacer(f); selecteur.current?.click(); }}>
                {remplacement && aRemplacer?.id === f.id ? <LoaderCircle className="spin" /> : <Upload />}Remplacer
              </button>
            )}
            <button type="button" className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => supprimer(f)}
                    title="Supprimer" aria-label={`Supprimer ${f.nom}`}><Trash /></button>
          </div>
        </figure>
      ))}
    </div>
  );
}
