// ─────────────────────────────────────────────────────────────
//  Ligne de production d'une commande : une rangée de la liste (visuel,
//  type, état d'impression, quantité) et son panneau de détail (réglage
//  presse, fichiers, notes), ouvert d'un clic sur la rangée.
// ─────────────────────────────────────────────────────────────
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, ImagePlus, Link2, MessageSquareText,
} from 'lucide-react';
import { fmtNumber, fmtTemps, plural } from '../format.js';
import Modal from '../ui/Modal.jsx';
import ApercuVisuel from './ApercuVisuel.jsx';
import GalerieVisuels from './GalerieVisuels.jsx';
import ReglageLigne from './ReglageLigne.jsx';
import Thumb from './Thumb.jsx';
import UploadZone from './UploadZone.jsx';

const texteReglage = (r) => [
  r?.temperature != null ? `${r.temperature} °C` : null,
  r?.tempsSecondes != null ? fmtTemps(r.tempsSecondes) : null,
].filter(Boolean).join(' · ');

const typeDe = (ligne) => `${ligne.typeMug || 'Type non précisé'}${ligne.accessoire ? ' · accessoire' : ''}`;
const unite = (ligne) => (ligne.accessoire ? 'pièces' : 'mugs');

export function LigneProduction({ ligne, commandeId, apercus, grande, avecEtat, etat, ajoutPossible, onOuvrir }) {
  const { fichiers } = ligne;
  const [premier] = fichiers;
  const base = `/api/commandes/${commandeId}/fichiers`;
  const sousTitre = [
    ligne.nonRattachee ? null : typeDe(ligne),
    texteReglage(ligne.reglage) || null,
    fichiers.length > 1 ? plural(fichiers.length, 'visuel') : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`ligne${grande ? ' is-grande' : ''}${avecEtat ? ' avec-etat' : ''}${ligne.manquante ? ' is-manquante' : ''}`} onClick={onOuvrir}>
      {premier
        ? <ApercuVisuel commandeId={commandeId} fichier={premier} apercu={apercus[premier.id]} />
        : <span className="apercu is-vide"><Thumb src={ligne.imageProduit} alt={ligne.typeMug || ''} size={38} /></span>}
      <div className="ligne-texte">
        <strong title={ligne.visuel}>{ligne.visuel}</strong>
        {sousTitre && <span>{sousTitre}</span>}
        {ligne.manquante && <span className="text-warning">Aucun visuel sur cette ligne</span>}
        {ligne.commentaire && <span className="ligne-note" title={ligne.commentaire}><MessageSquareText />{ligne.commentaire}</span>}
      </div>
      {avecEtat && <div className="ligne-etat">{etat}</div>}
      <div className="ligne-qte">
        {ligne.quantite != null && <><strong>{fmtNumber(ligne.quantite)}</strong><span>{unite(ligne)}</span></>}
      </div>
      <div className="ligne-actions" onClick={(e) => e.stopPropagation()}>
        {fichiers.length === 1 && (
          <>
            <a className="btn btn-ghost btn-icon btn-sm" href={`${base}/${premier.id}/view`} target="_blank" rel="noopener noreferrer"
               title="Ouvrir" aria-label={`Ouvrir ${premier.nom}`}><ExternalLink /></a>
            <a className="btn btn-ghost btn-icon btn-sm" href={`${base}/${premier.id}/download`}
               title="Télécharger" aria-label={`Télécharger ${premier.nom}`}><Download /></a>
          </>
        )}
        {ligne.manquante && ajoutPossible && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={onOuvrir}><ImagePlus />Ajouter</button>
        )}
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onOuvrir}
                title="Détail de la ligne" aria-label={`Détail de ${ligne.visuel}`}><ChevronRight /></button>
      </div>
    </div>
  );
}

export function PanneauLigne({
  ligne, numero, total, commandeId, apercus, etat, ajoutPossible, onClose, onChange, onPrecedente, onSuivante,
}) {
  const description = ligne.nonRattachee ? plural(ligne.fichiers.length, 'visuel') : [
    total > 1 ? `Ligne ${numero} sur ${total}` : null,
    ligne.quantite != null ? `${fmtNumber(ligne.quantite)} ${unite(ligne)}` : null,
    typeDe(ligne),
  ].filter(Boolean).join(' · ');

  return (
    <Modal
      className="modal-panneau"
      title={ligne.visuel}
      description={description}
      onClose={onClose}
      bare
      footer={total > 1 && (
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onPrecedente} disabled={numero === 1}><ChevronLeft />Précédente</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSuivante} disabled={numero === total}>Suivante<ChevronRight /></button>
        </>
      )}
    >
      <div className="panneau-corps">
        {etat?.length > 0 && <div className="panneau-etat">{etat}</div>}
        {(ligne.commentaire || ligne.lien) && (
          <div className="ligne-notes">
            {ligne.commentaire && <span><MessageSquareText />{ligne.commentaire}</span>}
            {ligne.lien && (
              <a href={ligne.lien} target="_blank" rel="noopener noreferrer"><Link2 />Lien de transfert<ExternalLink size={12} /></a>
            )}
          </div>
        )}
        <GalerieVisuels commandeId={commandeId} ligneId={ligne.ligneId} fichiers={ligne.fichiers} apercus={apercus}
                        remplacable={ajoutPossible} onChange={onChange} />
        {ajoutPossible && <UploadZone commandeId={commandeId} ligneId={ligne.ligneId} onUploaded={onChange} compact mini={ligne.fichiers.length > 0} />}
        {!ligne.nonRattachee && <ReglageLigne key={ligne.cle} visuel={ligne.visuel} reglage={ligne.reglage} onSaved={onChange} />}
      </div>
    </Modal>
  );
}
