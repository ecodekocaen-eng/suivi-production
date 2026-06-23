// ─────────────────────────────────────────────────────────────
//  Éditeur de lignes de commande (plusieurs visuels / types de mug).
//  Le type de mug est choisi dans le catalogue produits (avec miniature).
//  Chaque ligne : produit · nom du visuel · quantité · commentaire (+ lien, fichiers).
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Thumb from './Thumb.jsx';

export const ligneVide = () => ({ typeMug: '', visuel: '', quantite: '', commentaire: '', lien: '', files: [] });

export default function LignesEditor({ lignes, onChange, allowFiles = false }) {
  const [produits, setProduits] = useState([]);

  useEffect(() => {
    api.get('/produits').then((d) => setProduits(d.produits)).catch(() => {});
  }, []);

  const actifs = produits.filter((p) => p.actif);
  const byNom = Object.fromEntries(produits.map((p) => [p.nom, p]));

  const update = (i, key, val) => onChange(lignes.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  const ajouter = () => onChange([...lignes, ligneVide()]);
  const retirer = (i) => onChange(lignes.filter((_, idx) => idx !== i));

  const total = lignes.reduce((s, l) => s + (parseInt(l.quantite, 10) || 0), 0);

  return (
    <div className="lignes-editor">
      <div className="lignes-head">
        <h3>Lignes (visuels / types de mug)</h3>
        <span className="muted">Total : <strong>{total}</strong> mug(s)</span>
      </div>

      <div className="lignes-table">
        <div className="ligne-row ligne-header">
          <span>Type de mug</span><span>Nom du visuel</span><span>Qté</span><span>Commentaire</span><span></span>
        </div>
        {lignes.map((l, i) => {
          const prod = byNom[l.typeMug];
          const horsCatalogue = l.typeMug && !prod;
          return (
            <div className="ligne-row" key={i}>
              <div className="ligne-type">
                {prod?.image && <Thumb src={`/api/produits/${prod.id}/image`} alt={prod.nom} size={30} />}
                <select value={l.typeMug || ''} onChange={(e) => update(i, 'typeMug', e.target.value)}>
                  <option value="">— Type —</option>
                  {actifs.map((p) => <option key={p.id} value={p.nom}>{p.nom}</option>)}
                  {horsCatalogue && <option value={l.typeMug}>{l.typeMug} (hors catalogue)</option>}
                </select>
              </div>
              <input value={l.visuel} placeholder="Nom du visuel"
                     onChange={(e) => update(i, 'visuel', e.target.value)} />
              <input type="number" min="0" value={l.quantite} placeholder="0"
                     onChange={(e) => update(i, 'quantite', e.target.value)} />
              <input value={l.commentaire} placeholder="Commentaire"
                     onChange={(e) => update(i, 'commentaire', e.target.value)} />
              <button type="button" className="btn btn-danger btn-xs" title="Retirer la ligne"
                      onClick={() => retirer(i)} disabled={lignes.length <= 1}>✕</button>

              {/* Ligne complémentaire : lien de transfert + (à la création) sélection de visuels */}
              <div className="ligne-extra">
                <input type="url" className="ligne-lien" value={l.lien || ''}
                       placeholder="🔗 Lien WeTransfer / Smash (gros fichiers)"
                       onChange={(e) => update(i, 'lien', e.target.value)} />
                {allowFiles && (
                  <label className="ligne-files">
                    <span className="btn btn-ghost btn-xs">📎 Visuels…</span>
                    <input type="file" multiple hidden
                           accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                           onChange={(e) => update(i, 'files', [...e.target.files])} />
                    {l.files?.length > 0 && <span className="muted ligne-files-count">{l.files.length} fichier(s)</span>}
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn btn-ghost btn-sm" onClick={ajouter}>+ Ajouter une ligne</button>
    </div>
  );
}
