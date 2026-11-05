// ─────────────────────────────────────────────────
//  Éditeur de lignes de commande (plusieurs visuels / types de mug).
//  Le type de mug est choisi dans le catalogue produits (avec miniature).
//  Chaque ligne : produit · nom du visuel · quantité · commentaire · lien
//  de transfert (+ à la création : sélection des fichiers visuels).
//  Commande nominative : plusieurs fichiers déposés d'un coup donnent une
//  ligne chacun. Au-delà de quelques lignes, l'affichage passe en rangées.
// ─────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Plus, Trash, Paperclip, Link2, X, Images, MessageSquareText } from 'lucide-react';
import Thumb, { imageProduit } from './Thumb.jsx';
import { fmtNumber, fmtSize } from '../format.js';
import { useTailleMax, libelleTailleMax } from '../televersement.js';
import { useToast } from '../ui/feedback.jsx';

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
const TYPE_PAR_DEFAUT = 'MUG BLANC';
// Au-delà, chaque ligne tient sur une rangée (commentaire et lien à la demande).
const LIGNES_COMPACTES = 5;

const estVide = (l) => !(l.typeMug || l.visuel || l.quantite || l.commentaire || l.lien || l.files?.length);
const nomDuVisuel = (fichier) => fichier.name.normalize('NFC').replace(/\.[a-z0-9]{2,5}$/i, '');
const empreinte = (fichier) => `${fichier.name}|${fichier.size}`;

function ChoixType({ valeur, actifs, vide = '— Choisir —', label, onChange }) {
  const horsCatalogue = valeur && !actifs.some((p) => p.nom === valeur);
  return (
    <select value={valeur || ''} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vide}</option>
      {actifs.map((p) => <option key={p.id} value={p.nom}>{p.nom}</option>)}
      {horsCatalogue && <option value={valeur}>{valeur} (hors catalogue)</option>}
    </select>
  );
}

// Dépôt de plusieurs visuels : chacun deviendra une ligne.
function ZoneVisuels({ mini, onFichiers }) {
  const entree = useRef(null);
  const [survol, setSurvol] = useState(false);
  const ouvrir = () => entree.current?.click();
  return (
    <div
      className={`dropzone dropzone-compact${mini ? ' dropzone-mini' : ''}${survol ? ' is-over' : ''}`}
      role="button" tabIndex={0}
      title="Une ligne de 1 mug par fichier · JPG, PNG, GIF, WEBP ou PDF"
      onClick={ouvrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
      onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); onFichiers([...e.dataTransfer.files]); }}
    >
      <input ref={entree} type="file" multiple hidden accept={ACCEPT} onClick={(e) => e.stopPropagation()}
             onChange={(e) => { onFichiers([...e.target.files]); e.target.value = ''; }} />
      <span className="dropzone-icon"><Images /></span>
      <span className="dropzone-text">
        <strong>Déposer plusieurs visuels</strong>
        {!mini && <span>Commande nominative : chaque fichier devient une ligne de 1 mug.</span>}
      </span>
    </div>
  );
}

function RangeeLigne({ ligne, numero, actifs, allowFiles, tailleMax, peutRetirer, onUpdate, onRetirer }) {
  const [details, setDetails] = useState(false);
  const entree = useRef(null);
  const fichiers = ligne.files || [];
  const tropGros = tailleMax && fichiers.some((f) => f.size > tailleMax);
  return (
    <div className="ligne-c-bloc">
      <div className={`ligne-c${allowFiles ? ' avec-fichiers' : ''}`}>
        <span className="ligne-c-num">{numero}</span>
        <ChoixType valeur={ligne.typeMug} actifs={actifs} label={`Type de mug, ligne ${numero}`} onChange={(v) => onUpdate('typeMug', v)} />
        <input value={ligne.visuel} placeholder="Nom du visuel" aria-label={`Nom du visuel, ligne ${numero}`}
               onChange={(e) => onUpdate('visuel', e.target.value)} />
        <input type="number" min="0" inputMode="numeric" value={ligne.quantite} placeholder="0" aria-label={`Quantité, ligne ${numero}`}
               onChange={(e) => onUpdate('quantite', e.target.value)} />
        {allowFiles && (
          <span className={`ligne-c-fichier${tropGros ? ' text-danger' : ''}`} title={fichiers.map((f) => f.name).join('\n') || undefined}>
            <input ref={entree} type="file" multiple hidden accept={ACCEPT}
                   onChange={(e) => { onUpdate('files', [...fichiers, ...e.target.files]); e.target.value = ''; }} />
            {fichiers.length === 0 && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => entree.current?.click()}><Paperclip />Joindre</button>
            )}
            {fichiers.length > 0 && (
              <>
                <span className="ligne-c-nom">{fichiers.length > 1 ? `${fichiers.length} fichiers` : `${fmtSize(fichiers[0].size)}`}</span>
                <button type="button" className="btn btn-ghost btn-icon btn-xs" onClick={() => onUpdate('files', [])}
                        title="Retirer le fichier" aria-label={`Retirer le fichier de la ligne ${numero}`}><X /></button>
              </>
            )}
          </span>
        )}
        <span className="ligne-c-actions">
          <button type="button" className={`btn btn-ghost btn-icon btn-xs${ligne.commentaire || ligne.lien ? ' is-on' : ''}`}
                  onClick={() => setDetails((v) => !v)} aria-expanded={details}
                  title="Commentaire et lien" aria-label={`Commentaire et lien, ligne ${numero}`}><MessageSquareText /></button>
          <button type="button" className="btn btn-danger-ghost btn-icon btn-xs" onClick={onRetirer} disabled={!peutRetirer}
                  title="Retirer cette ligne" aria-label={`Retirer la ligne ${numero}`}><Trash /></button>
        </span>
      </div>
      {details && (
        <div className="ligne-c-details">
          <input value={ligne.commentaire} placeholder="Commentaire : couleur, position, consigne…" aria-label={`Commentaire, ligne ${numero}`}
                 onChange={(e) => onUpdate('commentaire', e.target.value)} />
          <input type="url" value={ligne.lien || ''} placeholder="Lien de transfert (WeTransfer / Smash)" aria-label={`Lien de transfert, ligne ${numero}`}
                 onChange={(e) => onUpdate('lien', e.target.value)} />
        </div>
      )}
    </div>
  );
}

export default function LignesEditor({ lignes, onChange, produits = [], allowFiles = false }) {
  const fileRefs = useRef({});
  const toast = useToast();
  const tailleMax = useTailleMax();
  const actifs = produits.filter((p) => p.actif);
  const byNom = Object.fromEntries(produits.map((p) => [p.nom, p]));
  const compact = lignes.length > LIGNES_COMPACTES;

  const update = (i, key, val) => onChange(lignes.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  const pourToutes = (key, val) => onChange(lignes.map((l) => ({ ...l, [key]: val })));
  const ajouter = () => onChange([...lignes, ligneVide()]);
  const retirer = (i) => onChange(lignes.filter((_, idx) => idx !== i));
  const ajouterFichiers = (i, liste) => update(i, 'files', [...(lignes[i].files || []), ...liste]);
  const retirerFichier = (i, f) => update(i, 'files', lignes[i].files.filter((x) => x !== f));

  // Une ligne de 1 mug par fichier, dans l'ordre des noms ; un fichier déjà là n'est pas repris.
  const deposerVisuels = (fichiers) => {
    const acceptes = fichiers.filter((f) => ACCEPT.split(',').includes(f.type));
    const presents = new Set(lignes.flatMap((l) => l.files || []).map(empreinte));
    const nouveaux = acceptes.filter((f) => !presents.has(empreinte(f)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    const refuses = fichiers.length - acceptes.length;
    if (refuses > 0) toast.error(`${refuses} fichier${refuses > 1 ? 's' : ''} ignoré${refuses > 1 ? 's' : ''} : déposez des JPG, PNG, GIF, WEBP ou PDF.`);
    if (nouveaux.length === 0) return;
    const typeMug = lignes.find((l) => l.typeMug)?.typeMug || (actifs.some((p) => p.nom === TYPE_PAR_DEFAUT) ? TYPE_PAR_DEFAUT : '');
    onChange([
      ...lignes.filter((l) => !estVide(l)),
      ...nouveaux.map((f) => ({ ...ligneVide(), typeMug, visuel: nomDuVisuel(f), quantite: '1', files: [f] })),
    ]);
  };

  const { mugs, accessoires } = totauxLignes(lignes, byNom);
  const memeValeur = (key) => (lignes.every((l) => String(l[key] ?? '') === String(lignes[0][key] ?? '')) ? lignes[0][key] ?? '' : '');

  return (
    <div className="lines-editor">
      {allowFiles && <ZoneVisuels mini={compact} onFichiers={deposerVisuels} />}

      {compact ? (
        <div className="lignes-compactes" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); }}>
          <div className="lignes-toutes">
            <span>Toutes les lignes</span>
            <ChoixType valeur={memeValeur('typeMug')} actifs={actifs} vide="Type de mug…" label="Type de mug pour toutes les lignes"
                       onChange={(v) => pourToutes('typeMug', v)} />
            <label>
              Quantité
              <input type="number" min="0" inputMode="numeric" value={memeValeur('quantite')} placeholder="—"
                     aria-label="Quantité pour toutes les lignes" onChange={(e) => pourToutes('quantite', e.target.value)} />
            </label>
          </div>
          <div className="lignes-rangees">
            {lignes.map((l, i) => (
              <RangeeLigne
                key={l.id ?? `n${i}-${l.files?.[0]?.name ?? ''}`}
                ligne={l}
                numero={i + 1}
                actifs={actifs}
                allowFiles={allowFiles}
                tailleMax={tailleMax}
                peutRetirer={lignes.length > 1}
                onUpdate={(key, val) => update(i, key, val)}
                onRetirer={() => retirer(i)}
              />
            ))}
          </div>
        </div>
      ) : lignes.map((l, i) => {
        const prod = byNom[l.typeMug];
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
                  <ChoixType valeur={l.typeMug} actifs={actifs} onChange={(v) => update(i, 'typeMug', v)} />
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
                  <span className="field-hint text-danger">Un fichier dépasse la limite de {fmtSize(tailleMax)} : retirez-le ou passez par un lien WeTransfer / Smash.</span>
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
