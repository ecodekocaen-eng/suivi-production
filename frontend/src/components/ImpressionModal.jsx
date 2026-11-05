// ─────────────────────────────────────────────────────────────
//  Fenêtre « Envoyer à l'impression » : choix des visuels (par ligne),
//  du nombre de transferts et de l'imprimante (ou répartition entre les
//  deux), puis envoi dans la file que l'agent du PC atelier dépose dans
//  Edge Print. Sert à la fiche commande (une commande) et à la page
//  Impression (plusieurs).
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Printer, Send, LoaderCircle, TriangleAlert, Info } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import { Segmented, useStoredState } from '../ui/bits.jsx';
import { useToast } from '../ui/feedback.jsx';
import { api } from '../api.js';
import { fmtNumber, plural } from '../format.js';
import { IMPRIMANTES, IMPRIMANTE_NUMEROS } from '../constants.js';
import { ImpressionBadge, PosteStatut, libelleImprimante, derniersEnvoisPar } from './ImpressionEtat.jsx';
import ApercuVisuel from './ApercuVisuel.jsx';

const QUANTITE_MAX = 2000;
// Choix « Les deux » : chaque visuel se répartit entre les deux imprimantes.
const LES_DEUX = 'LES_DEUX';
// Visuel déjà dans la file, dans Edge Print ou imprimé : il n'est pas recoché d'office.
const DEJA_PARTI = ['EN_FILE', 'ENVOYE', 'IMPRIME'];
// On propose la dizaine supérieure pour garder du stock (36 → 40), sauf sur une
// commande nominative : plus de 2 visuels, en majorité à 1 ou 2 mugs chacun. Sur
// 1 ou 2 visuels, on arrondit toujours ; chacun peut y être accompagné de sa maquette.
const VISUELS_SOLO = 2;
const MUGS_NOMINATIF = 2;
function aArrondir(groupes) {
  const solo = groupes.length <= VISUELS_SOLO && groupes.every((g) => g.fichiers.length <= VISUELS_SOLO);
  const nominatives = groupes.filter((g) => g.quantite <= MUGS_NOMINATIF * g.fichiers.length);
  return solo || nominatives.length * 2 <= groupes.length;
}
const dizaineSuperieure = (n) => Math.ceil(n / 10) * 10;
const surLa = (code) => `sur la ${IMPRIMANTE_NUMEROS[code]}`;

// Partage d'un visuel entre les deux imprimantes : moitié-moitié, et par dizaines
// quand la quantité est ronde, pour rester sur les dossiers ×10 (370 → 190 + 180).
function partager(quantite) {
  const total = Number(quantite);
  if (!Number.isInteger(total) || total < 1) return { A: '', B: '' };
  const A = total % 10 === 0 ? dizaineSuperieure(total / 2) : Math.ceil(total / 2);
  return { A: String(A), B: String(total - A) };
}
const totalParts = (parts) => Number(parts.A) + Number(parts.B);

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

export default function ImpressionModal({ commandes, apercus, onClose, onSent }) {
  const toast = useToast();
  const [poste, setPoste] = useState(null);
  const [imprimante, setImprimante] = useStoredState('impression-imprimante', 'A');
  const [repartir, setRepartir] = useState(false); // « Les deux » n'est pas retenu d'un envoi à l'autre
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Derniers envois de chaque visuel (ils arrivent du plus récent au plus ancien).
  const derniersEnvois = useMemo(
    () => derniersEnvoisPar(commandes.flatMap((c) => c.impressions || []), (i) => i.fichierId),
    [commandes],
  );
  const blocs = useMemo(
    () => commandes.map((c) => ({ commande: c, groupes: groupesDe(c) })).filter((b) => b.groupes.length > 0),
    [commandes],
  );

  // Coché d'office : le seul visuel d'une ligne, s'il n'est pas déjà parti.
  // Quantité proposée : le nombre de mugs de la ligne, arrondi sauf pour le nominatif.
  const [choix, setChoix] = useState(() => {
    const init = {};
    for (const b of blocs) {
      const arrondir = aArrondir(b.groupes);
      for (const g of b.groupes) {
        const mugs = Math.max(1, g.quantite || 1);
        const quantite = String(arrondir && g.quantite ? dizaineSuperieure(mugs) : mugs);
        for (const f of g.fichiers) {
          const dejaParti = (derniersEnvois.get(f.id) || []).some((i) => DEJA_PARTI.includes(i.statut));
          init[f.id] = { coche: g.fichiers.length === 1 && !dejaParti, quantite };
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
  const quantite = (id, valeur) => { setErreur(null); setChoix((c) => ({ ...c, [id]: { ...c[id], quantite: valeur, coche: true } })); };
  const part = (id, code, valeur) => {
    setErreur(null);
    setChoix((c) => ({ ...c, [id]: { ...c[id], parts: { ...c[id].parts, [code]: valeur }, coche: true } }));
  };

  // Passage à « Les deux » : chaque quantité est partagée. Au retour sur une
  // seule imprimante, chaque visuel reprend le total de ses deux parts.
  const choisirImprimante = (valeur) => {
    setErreur(null);
    const deux = valeur === LES_DEUX;
    if (deux !== repartir) {
      setChoix((c) => Object.fromEntries(Object.entries(c).map(([id, v]) => [id, deux
        ? { ...v, parts: partager(v.quantite) }
        : { ...v, quantite: String(totalParts(v.parts)) }])));
    }
    setRepartir(deux);
    if (!deux) setImprimante(valeur);
  };

  const coches = Object.entries(choix).filter(([, v]) => v.coche);
  // Une part vide ou à 0 : rien sur cette imprimante.
  const elements = coches.flatMap(([id, v]) => (repartir
    ? IMPRIMANTES.map((code) => ({ fichierId: Number(id), quantite: Number(v.parts[code]), imprimante: code }))
      .filter((x) => x.quantite !== 0)
    : [{ fichierId: Number(id), quantite: Number(v.quantite), imprimante }]));
  const totalSur = (code) => elements.reduce(
    (s, x) => s + (x.imprimante === code && Number.isInteger(x.quantite) ? x.quantite : 0), 0,
  );
  const transferts = IMPRIMANTES.reduce((s, code) => s + totalSur(code), 0);
  const utilisees = IMPRIMANTES.filter((code) => totalSur(code) > 0);
  const detail = utilisees.map((code) => `${fmtNumber(totalSur(code))} ${surLa(code)}`).join(' · ');

  const envoyer = async (e) => {
    e.preventDefault();
    if (coches.length === 0) { setErreur('Cochez au moins un visuel à imprimer.'); return; }
    const sansQuantite = repartir && coches.some(([, v]) => !Number(v.parts.A) && !Number(v.parts.B));
    if (sansQuantite || elements.some((x) => !Number.isInteger(x.quantite) || x.quantite < 1 || x.quantite > QUANTITE_MAX)) {
      setErreur(`Indiquez entre 1 et ${QUANTITE_MAX} transferts par visuel.`);
      return;
    }
    setBusy(true);
    try {
      await api.post('/impressions', { elements });
      toast.success(<>{plural(transferts, 'transfert')} envoyé{transferts > 1 ? 's' : ''}{utilisees.length > 1 ? ' : ' : ' '}<strong>{utilisees.length > 1 ? detail : surLa(utilisees[0])}</strong></>);
      onSent?.();
      onClose();
    } catch (err) {
      setErreur(err.message);
      setBusy(false);
    }
  };

  const options = [
    ...IMPRIMANTES.map((code) => ({ value: code, label: libelleImprimante(poste, code) })),
    { value: LES_DEUX, label: 'Les deux' },
  ];
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
          <span className="footer-info"><strong>{plural(transferts, 'transfert')}</strong> · {repartir && detail ? detail : plural(coches.length, 'visuel')}</span>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <Send />}Envoyer {repartir ? 'sur les deux' : surLa(imprimante)}
          </button>
        </>
      )}
    >
      <div className="imp-head">
        <div className="field">
          <span className="field-label">Imprimante</span>
          <Segmented value={repartir ? LES_DEUX : imprimante} onChange={choisirImprimante} options={options} label="Imprimante" />
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
          {aArrondir(groupes) && groupes.some((g) => g.quantite % 10 !== 0) && (
            <p className="field-hint"><Info />Quantités arrondies à la dizaine supérieure pour garder du stock.</p>
          )}
          {groupes.map((g) => {
            const infos = [g.type, g.quantite ? plural(g.quantite, 'mug') : null].filter(Boolean);
            // Une ligne à un seul visuel tient sur une rangée ; à plusieurs, on la titre pour choisir.
            const seul = g.fichiers.length === 1;
            return (
              <div className={`imp-groupe${seul ? ' is-seul' : ''}`} key={g.cle}>
                {!seul && (
                  <>
                    <div className="imp-groupe-titre">
                      <span className="cell-main">{g.titre}</span>
                      <span className="cell-sub">{infos.join(' · ')}</span>
                    </div>
                    <p className="field-hint"><Info />Plusieurs visuels sur cette ligne : cochez celui (ou ceux) à imprimer.</p>
                  </>
                )}
                {g.fichiers.map((f) => {
                  const c = choix[f.id];
                  const envois = derniersEnvois.get(f.id) || [];
                  const idCase = `imp-fichier-${f.id}`;
                  // Le nom de la ligne, s'il ne se lit pas déjà dans celui du fichier.
                  const nomLigne = f.nom.toLowerCase().includes(g.titre.toLowerCase()) ? [] : [g.titre];
                  return (
                    <div className={`imp-fichier${c.coche ? ' is-checked' : ''}`} key={f.id}>
                      <input type="checkbox" id={idCase} checked={c.coche} onChange={(e) => cocher(f.id, e.target.checked)} />
                      <a className="imp-apercu" href={`/api/commandes/${commande.id}/fichiers/${f.id}/view`}
                         target="_blank" rel="noopener noreferrer" title={`Ouvrir ${f.nom}`}>
                        <ApercuVisuel commandeId={commande.id} fichier={f} apercu={apercus?.[f.id]} />
                      </a>
                      <label htmlFor={idCase}>
                        {f.nom}
                        {seul && <span className="cell-sub">{[...nomLigne, ...infos].join(' · ')}</span>}
                      </label>
                      {envois.map((i) => <ImpressionBadge impression={i} key={i.id} />)}
                      {repartir ? (
                        <>
                          {IMPRIMANTES.map((code) => (
                            <span className="imp-qte" key={code}>
                              {libelleImprimante(poste, code)}
                              <input type="number" min="0" max={QUANTITE_MAX} inputMode="numeric" className="input-qte"
                                     value={c.parts[code]} onChange={(e) => part(f.id, code, e.target.value)}
                                     aria-label={`Nombre de transferts pour ${f.nom} ${surLa(code)}`} />
                            </span>
                          ))}
                          <span className="imp-qte">= {fmtNumber(totalParts(c.parts))}</span>
                        </>
                      ) : (
                        <span className="imp-qte">
                          <input type="number" min="1" max={QUANTITE_MAX} inputMode="numeric" className="input-qte"
                                 value={c.quantite} onChange={(e) => quantite(f.id, e.target.value)}
                                 aria-label={`Nombre de transferts pour ${f.nom}`} />
                          transferts
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}

      {erreur && <div className="alert alert-error imp-erreur"><TriangleAlert /><span>{erreur}</span></div>}
      <p className="field-hint imp-note">Edge Print applique le réglage rapide de l’imprimante (miroir, couleurs). Vous imbriquez et lancez ensuite depuis Edge Print, comme d’habitude.</p>
    </Modal>
  );
}
