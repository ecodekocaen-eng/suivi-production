// ─────────────────────────────────────────────────────────────
//  Éditeur de lignes de commande (plusieurs visuels / types de mug).
//  Le type de mug est choisi dans le catalogue produits (avec miniature).
//  Chaque ligne : produit · nom du visuel · quantité · commentaire · lien
//  de transfert (+ à la création : sélection des fichiers visuels).
// ─────────────────────────────────────────────────────────────
import { useRef } from 'react';
import { Plus, Trash, Paperclip, Link2, X } from 'lucide-react';
import Thumb, { imageProduit } from './Thumb.jsx';
import { fmtNumber, fmtSize } from '../format.js';
import { useTailleMax, libelleTailleMax } from '../televersement.js';

export const ligneVide = () => ({ typeMug: '', visuel: '', quantite: '', commentaire: '', lien: '', files: [] });

// Totaux : les produits « non comptés » (étiquettes…) n'entrent pas dans le total de mugs.
export function totauxLignes(lignes, produitsByNom = {}) {
  const compte = (l) => produitsByNom[l.typeMug]?.compteMugs !== false;
  const q = (l) => parseInt(l.quantite, 10) || 0;
  return {
    mugs: lignes.filter(compte).reduce((s, l) => s + q(l), 0),
    accessoires: lignes.filter((l) => !compte(l)).reduce((s, l) => s + q(l), 0),
  };
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';

export default function LignesEditor({ lignes, onChange, produits = [], allowFiles = false }) {
  const fileRefs = useRef({});
  const tailleMax = useTailleMax();
  const actifs = produits.filter((p) => p.actif);
  const byNom = Object.fromEntries(produits.map((p) => [p.nom, p]));

  const update = (i, key, val) => onChange(lignes.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  const ajouter = () => onChange([...lignes, ligneVide()]);
  const retirer = (i) => onChange(lignes.filter((_, idx) => idx !== i));
  const ajouterFichiers = (i, liste) => update(i, 'files', [...(lignes[i].files || []), ...liste]);
  const retirerFichier = (i, f) => update(i, 'files', lignes[i].files.filter((x) => x !== f));

  const { mugs, accessoires } = totauxLignes(lignes, byNom);

  return (
    <div className="lines-editor">
      {lignes.map((l, i) => {
        const prod = byNom[l.typeMug];
        const horsCatalogue = l.typeMug && !prod;
        return (
          <div className="line-edit" key={l.id ?? `n${i}`}>
            <div className="line-edit-head">
              <span className="line-edit-num"><b>{i + 1}</b>Ligne</span>
              <button type="button" className="btn btn-danger-ghost btn-xs" onClick={() => retirer(i)}
                      disabled={lignes.length <= 1} title="Retirer cette ligne">
                <Trash />Retirer
              </button>
            </div>

            <div className="line-edit-grid">
              <label className="field">
                <span className="field-label">Type de mug</span>
                <span className="product-pick">
                  <Thumb src={imageProduit(prod)} alt={l.typeMug} size={40} />
                  <select value={l.typeMug || ''} onChange={(e) => update(i, 'typeMug', e.target.value)}>
                    <option value="">— Choisir —</option>
                    {actifs.map((p) => <option key={p.id} value={p.nom}>{p.nom}</option>)}
                    {horsCatalogue && <option value={l.typeMug}>{l.typeMug} (hors catalogue)</option>}
                  </select>
                </span>
              </label>
              <label className="field">
                <span className="field-label">Nom du visuel</span>
                <input value={l.visuel} placeholder="ex : Logo mairie" onChange={(e) => update(i, 'visuel', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Quantité</span>
                <input type="number" min="0" inputMode="numeric" value={l.quantite} placeholder="0"
                       onChange={(e) => update(i, 'quantite', e.target.value)} />
              </label>
            </div>

            <div className="line-edit-grid-2">
              <label className="field">
                <span className="field-label">Commentaire</span>
                <input value={l.commentaire} placeholder="Couleur, position, consigne…"
                       onChange={(e) => update(i, 'commentaire', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label"><Link2 size={14} />Lien de transfert</span>
                <input type="url" value={l.lien || ''} placeholder="WeTransfer / Smash (gros fichiers)"
                       onChange={(e) => update(i, 'lien', e.target.value)} />
              </label>
            </div>

            {allowFiles && (
              <div className="file-pick">
                <input ref={(el) => { fileRefs.current[i] = el; }} type="file" multiple hidden accept={ACCEPT}
                       onChange={(e) => { ajouterFichiers(i, [...e.target.files]); e.target.value = ''; }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRefs.current[i]?.click()}>
                  <Paperclip />Joindre des visuels
                </button>
                {(l.files || []).map((f, k) => (
                  <span className="file-chip" key={`${f.name}-${k}`} title={f.name}>
                    <span>{f.name}</span>
                    <button type="button" onClick={() => retirerFichier(i, f)} aria-label={`Retirer ${f.name}`}><X /></button>
                  </span>
                ))}
                {!(l.files || []).length && (
                  <span className="field-hint">JPG, PNG, GIF, WEBP ou PDF{tailleMax ? ` · ${libelleTailleMax(tailleMax)}` : ''}</span>
                )}
                {(l.files || []).some((f) => tailleMax && f.size > tailleMax) && (
                  <span className="field-hint text-danger">Un fichier dépasse la limite de {fmtSize(tailleMax)} : retirez-le ou passez par un lien WeTransfer/Smash.</span>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" className="add-line" onClick={ajouter}><Plus />Ajouter une ligne</button>

      <div className="lines-total">
        <span>Total de la commande</span>
        <span>
          <strong>{fmtNumber(mugs)}</strong> mug{mugs > 1 ? 's' : ''}
          {accessoires > 0 && <> · {fmtNumber(accessoires)} accessoire{accessoires > 1 ? 's' : ''} non compté{accessoires > 1 ? 's' : ''}</>}
        </span>
      </div>
    </div>
  );
}
