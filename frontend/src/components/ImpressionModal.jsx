// ─────────────────────────────────────────────────────────────
//  Fenêtre « Envoyer à l'impression » : choix des visuels (par ligne),
//  du nombre de transferts et de l'imprimante, puis envoi dans la file
//  que l'agent du PC atelier dépose dans Edge Print. Sert à la fiche
//  commande (une commande) et à la page Impression (plusieurs).
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Printer, Send, FileText, Image as ImageIcon, LoaderCircle, TriangleAlert, Info } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { Segmented, useStoredState } from '../ui/bits.jsx';
import { useToast } from '../ui/feedback.jsx';
import { api } from '../api.js';
import { plural } from '../format.js';
import { IMPRIMANTES } from '../constants.js';
import { ImpressionBadge, PosteStatut, libelleImprimante } from './ImpressionEtat.jsx';

const QUANTITE_MAX = 500;
// Visuel déjà dans la file, dans Edge Print ou imprimé : il n'est pas recoché d'office.
const DEJA_PARTI = ['EN_FILE', 'ENVOYE', 'IMPRIME'];

// Groupes « ligne → visuels » d'une commande ; les visuels sans ligne forment un dernier groupe.
function groupesDe(commande) {
  const visuels = (commande.fichiers || []).filter((f) => f.categorie !== 'DOCUMENT');
  const groupes = (commande.lignes || [])
    .map((l) => ({
      cle: `ligne-${l.id}`, titre: l.visuel || 'Visuel sans nom', type: l.typeMug, quantite: l.quantite,
      fichiers: visuels.filter((f) => f.ligneId === l.id),
    }))
    .filter((g) => g.fichiers.length > 0);
  const sansLigne = visuels.filter((f) => !f.ligneId);
  if (sansLigne.length) {
    groupes.push({
      cle: 'commande',
      titre: commande.lignes?.length ? 'Visuels non rattachés à une ligne' : (commande.designation || 'Visuels de la commande'),
      type: commande.typeMug, quantite: commande.quantite, fichiers: sansLigne,
    });
  }
  return groupes;
}

// Dernier envoi de chaque visuel (les envois arrivent du plus récent au plus ancien).
function dernierEnvoiParFichier(commandes) {
  const m = new Map();
  for (const c of commandes) {
    for (const i of c.impressions || []) if (i.fichierId && !m.has(i.fichierId)) m.set(i.fichierId, i);
  }
  return m;
}

export default function ImpressionModal({ commandes, onClose, onSent }) {
  const toast = useToast();
  const [poste, setPoste] = useState(null);
  const [imprimante, setImprimante] = useStoredState('impression-imprimante', 'A');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  const dernierEnvoi = useMemo(() => dernierEnvoiParFichier(commandes), [commandes]);
  const blocs = useMemo(
    () => commandes.map((c) => ({ commande: c, groupes: groupesDe(c) })).filter((b) => b.groupes.length > 0),
    [commandes],
  );

  // Coché d'office : le seul visuel d'une ligne, s'il n'est pas déjà parti.
  // Quantité proposée : le nombre de mugs de la ligne.
  const [choix, setChoix] = useState(() => {
    const init = {};
    for (const b of blocs) {
      for (const g of b.groupes) {
        for (const f of g.fichiers) {
          const dejaParti = DEJA_PARTI.includes(dernierEnvoi.get(f.id)?.statut);
          init[f.id] = { coche: g.fichiers.length === 1 && !dejaParti, quantite: String(Math.max(1, g.quantite || 1)) };
        }
      }
    }
    return init;
  });

  useEffect(() => {
    api.get('/impressions/poste').then((d) => setPoste(d.poste)).catch(() => setPoste(null));
  }, []);

  const cocher = (id, coche) => { setErreur(null); setChoix((c) => ({ ...c, [id]: { ...c[id], coche } })); };
  // Saisir une quantité coche le visuel.
  const quantite = (id, valeur) => { setErreur(null); setChoix((c) => ({ ...c, [id]: { quantite: valeur, coche: true } })); };

  const elements = Object.entries(choix)
    .filter(([, v]) => v.coche)
    .map(([id, v]) => ({ fichierId: Number(id), quantite: Number(v.quantite) }));
  const transferts = elements.reduce((s, e) => s + (Number.isInteger(e.quantite) ? e.quantite : 0), 0);

  const envoyer = async (e) => {
    e.preventDefault();
    if (elements.length === 0) { setErreur('Cochez au moins un visuel à imprimer.'); return; }
    if (elements.some((x) => !Number.isInteger(x.quantite) || x.quantite < 1 || x.quantite > QUANTITE_MAX)) {
      setErreur(`Indiquez entre 1 et ${QUANTITE_MAX} transferts par visuel.`);
      return;
    }
    setBusy(true);
    try {
      await api.post('/impressions', { imprimante, elements });
      toast.success(<>{plural(transferts, 'transfert')} envoyé{transferts > 1 ? 's' : ''} vers l’imprimante <strong>{imprimante}</strong></>);
      onSent?.();
      onClose();
    } catch (err) {
      setErreur(err.message);
      setBusy(false);
    }
  };

  const options = IMPRIMANTES.map((code) => ({ value: code, label: libelleImprimante(poste, code) }));
  const description = commandes.length === 1
    ? `${commandes[0].reference} · ${commandes[0].client}`
    : `${plural(blocs.length, 'commande')} sélectionnée${blocs.length > 1 ? 's' : ''}`;

  return (
    <Modal
      title="Envoyer à l’impression"
      description={description}
      icon={<Printer />}
      size="lg"
      onClose={onClose}
      onSubmit={envoyer}
      busy={busy}
      footer={(
        <>
          <span className="footer-info"><strong>{plural(transferts, 'transfert')}</strong> · {plural(elements.length, 'visuel')}</span>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <Send />}Envoyer sur {imprimante}
          </button>
        </>
      )}
    >
      <div className="imp-head">
        <div className="field">
          <span className="field-label">Imprimante</span>
          <Segmented value={imprimante} onChange={setImprimante} options={options} label="Imprimante" />
        </div>
        <PosteStatut poste={poste} />
      </div>

      {poste && !poste.enLigne && (
        <div className="alert alert-warning">
          <TriangleAlert />
          <span>{poste.connu
            ? 'Le PC atelier ne répond pas : l’envoi attendra son retour dans la file.'
            : 'L’agent d’impression n’est pas encore installé sur le PC atelier : l’envoi restera dans la file.'}</span>
        </div>
      )}

      {blocs.length === 0 && <p className="empty-inline">Aucun visuel à imprimer dans cette sélection.</p>}

      {blocs.map(({ commande, groupes }) => (
        <div className="imp-commande" key={commande.id}>
          {blocs.length > 1 && (
            <div className="imp-commande-titre"><span className="ref">{commande.reference}</span>{commande.client}</div>
          )}
          {groupes.map((g) => (
            <div className="imp-groupe" key={g.cle}>
              <div className="imp-groupe-titre">
                <span className="cell-main">{g.titre}</span>
                <span className="cell-sub">{[g.type, g.quantite ? plural(g.quantite, 'mug') : null].filter(Boolean).join(' · ')}</span>
              </div>
              {g.fichiers.length > 1 && (
                <p className="field-hint"><Info />Plusieurs visuels sur cette ligne : cochez celui (ou ceux) à imprimer.</p>
              )}
              {g.fichiers.map((f) => {
                const c = choix[f.id];
                const envoi = dernierEnvoi.get(f.id);
                const Icone = f.type?.startsWith('image/') ? ImageIcon : FileText;
                const idCase = `imp-fichier-${f.id}`;
                return (
                  <div className={`imp-fichier${c.coche ? ' is-checked' : ''}`} key={f.id}>
                    <input type="checkbox" id={idCase} checked={c.coche} onChange={(e) => cocher(f.id, e.target.checked)} />
                    <label htmlFor={idCase}><Icone />{f.nom}</label>
                    {envoi && <ImpressionBadge impression={envoi} />}
                    <span className="imp-qte">
                      <input type="number" min="1" max={QUANTITE_MAX} inputMode="numeric" className="input-qte"
                             value={c.quantite} onChange={(e) => quantite(f.id, e.target.value)}
                             aria-label={`Nombre de transferts pour ${f.nom}`} />
                      transferts
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {erreur && <div className="alert alert-error imp-erreur"><TriangleAlert /><span>{erreur}</span></div>}
      <p className="field-hint imp-note">Edge Print applique le réglage rapide de l’imprimante (miroir, couleurs). Vous imbriquez et lancez ensuite depuis Edge Print, comme d’habitude.</p>
    </Modal>
  );
}
