// ─────────────────────────────────────────────────────────────
//  Fiche commande : en-tête compact (infos clés + avancement cliquable),
//  liste des lignes de production avec leur visuel, panneau de détail
//  d'une ligne, documents, détails et historique. Modification dans une
//  fenêtre dédiée.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Download, Trash, ArchiveRestore, Layers, FolderOpen, Info, Check, Undo2, Truck, ListChecks,
  ScrollText, Plus, Upload, Flag, Thermometer, CircleDot, FileX, Receipt, Mail, Printer, PrinterCheck, Ban,
  TriangleAlert, Ellipsis,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import { fmtDate, fmtDateTime, fmtNumber, fmtEuro, fmtRelative, echeance, plural } from '../format.js';
import { Loading, EmptyState, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import { StatutBadge, StatutIcon, Echeance } from '../components/Statut.jsx';
import UploadZone from '../components/UploadZone.jsx';
import { imageProduit } from '../components/Thumb.jsx';
import { LigneProduction, PanneauLigne } from '../components/LigneProduction.jsx';
import DocumentsList from '../components/DocumentsList.jsx';
import CommandeFormModal from '../components/CommandeFormModal.jsx';
import ImpressionModal from '../components/ImpressionModal.jsx';
import { ImpressionBadge, derniersEnvoisPar } from '../components/ImpressionEtat.jsx';

// Clé de correspondance d'un visuel (identique à la normalisation backend).
const normVisuel = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

const RETENTION_JOURS = 60;
// Jusqu'à ce nombre de lignes, le visuel s'affiche en grand.
const LIGNES_GRANDES = 3;
// Événements de l'historique visibles avant « Tout voir ».
const HISTORIQUE_COURT = 3;

// Icône et teinte d'un événement de l'historique.
const EVENEMENTS = {
  COMMANDE_CREEE: { Icone: Plus, cls: 'is-status' },
  COMMANDE_MODIFIEE: { Icone: Pencil },
  STATUT_MODIFIE: { Icone: Flag, cls: 'is-status' },
  FICHIER_AJOUTE: { Icone: Upload, cls: 'is-file' },
  FICHIER_SUPPRIME: { Icone: Trash, cls: 'is-danger' },
  FICHIERS_SUPPRIMES: { Icone: FileX, cls: 'is-danger' },
  COMMANDE_SUPPRIMEE: { Icone: Trash, cls: 'is-danger' },
  COMMANDE_RESTAUREE: { Icone: ArchiveRestore, cls: 'is-status' },
  REGLAGE_ENREGISTRE: { Icone: Thermometer },
  IMPRESSION_DEMANDEE: { Icone: Printer, cls: 'is-file' },
  IMPRESSION_TERMINEE: { Icone: PrinterCheck, cls: 'is-status' },
  IMPRESSION_ERREUR: { Icone: TriangleAlert, cls: 'is-danger' },
  IMPRESSION_ANNULEE: { Icone: Ban },
};

function Fait({ label, tone = null, children }) {
  return (
    <div className={`fait${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

// Actions secondaires, derrière le bouton « … ».
function MenuPlus({ children }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    const clic = (e) => { if (!racine.current?.contains(e.target)) setOuvert(false); };
    const touche = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  return (
    <div className="menu" ref={racine}>
      <button type="button" className="btn btn-secondary btn-icon" aria-haspopup="menu" aria-expanded={ouvert}
              title="Plus d’actions" aria-label="Plus d’actions" onClick={() => setOuvert((o) => !o)}><Ellipsis /></button>
      {ouvert && <div className="menu-liste" role="menu" onClick={() => setOuvert(false)}>{children}</div>}
    </div>
  );
}

export default function CommandeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirmer = useConfirm();
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [edition, setEdition] = useState(false);
  const [impression, setImpression] = useState(false);
  const [statutBusy, setStatutBusy] = useState(false);
  const [produitsByNom, setProduitsByNom] = useState({});
  const [ligneOuverte, setLigneOuverte] = useState(null);
  const [historiqueComplet, setHistoriqueComplet] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/commandes/${id}`));
      setErreur(null);
    } catch (err) {
      setErreur(err.status === 404 ? 'introuvable' : err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/produits')
      .then((d) => setProduitsByNom(Object.fromEntries(d.produits.map((p) => [p.nom, p]))))
      .catch(() => {});
  }, []);

  usePageTitle(data ? `${data.commande.reference} · ${data.commande.client}` : 'Commande');

  if (erreur) {
    return (
      <div className="card">
        <EmptyState
          icon={<FileX />}
          title={erreur === 'introuvable' ? 'Commande introuvable' : 'Impossible de charger la commande'}
          text={erreur === 'introuvable' ? 'Elle a peut-être été supprimée.' : erreur}
          action={<Link className="btn btn-secondary btn-sm" to="/">Retour au tableau</Link>}
        />
      </div>
    );
  }
  if (!data) return <Loading label="Chargement de la commande…" />;

  const { commande, logs } = data;
  const reglages = data.reglages || {};
  const apercus = data.apercus || {};
  const isAdmin = user?.role === 'ADMIN';
  const peutFacturer = isAdmin || user?.role === 'COMPTABLE' || user?.accesFacturation;

  // Sépare documents (bons de commande, rendus 3D…) et visuels,
  // puis regroupe les visuels par ligne (et ceux non rattachés à une ligne).
  const documents = commande.fichiers.filter((f) => f.categorie === 'DOCUMENT');
  const visuels = commande.fichiers.filter((f) => f.categorie !== 'DOCUMENT');
  const filesByLigne = {};
  const filesGeneral = [];
  for (const f of visuels) {
    if (f.ligneId) (filesByLigne[f.ligneId] ||= []).push(f);
    else filesGeneral.push(f);
  }
  const expediee = commande.statut === 'Expédié';
  const indexStatut = STATUTS.indexOf(commande.statut);
  const ech = echeance(commande);

  // Envois à l'impression (du plus récent au plus ancien) : derniers états par ligne.
  const impressions = data.impressions || [];
  const derniersEnvois = derniersEnvoisPar(impressions, (i) => i.ligneId ?? 'commande');
  const badgesEnvois = (cle) => (derniersEnvois.get(cle) || []).map((i) => <ImpressionBadge impression={i} key={i.id} />);
  const peutImprimer = visuels.length > 0 && !commande.supprime;
  // « Imprimer » est l'action principale tant que la commande attend son impression.
  const imprimerEnAvant = peutImprimer && commande.statut === 'En attente';

  // Marge (réservée ADMIN) : (prix de vente − coût unitaire) × quantité.
  const coutU = commande.prixEsat != null ? commande.prixEsat : (produitsByNom[commande.typeMug]?.prixAchat ?? 0);
  const qte = commande.quantite || 0;
  const marge = commande.prixVente != null ? (commande.prixVente - coutU) * qte : null;
  const caTotal = commande.prixVente != null ? commande.prixVente * qte : null;
  const tauxMarge = (marge != null && caTotal > 0) ? Math.round((marge / caTotal) * 100) : null;

  const changerStatut = async (statut) => {
    if (statut === commande.statut || statutBusy) return;
    if (statut === 'Expédié') {
      const ok = await confirmer({
        title: 'Marquer la commande comme expédiée ?',
        message: `Les visuels seront conservés ${RETENTION_JOURS} jours (SAV), puis supprimés automatiquement. L’ajout de visuels sera désactivé.`,
        confirmLabel: 'Marquer expédiée',
        icon: <Truck />,
      });
      if (!ok) return;
    }
    const avant = commande.statut;
    setStatutBusy(true);
    try {
      await api.patch(`/commandes/${id}/statut`, { statut });
      toast.success(<>Statut : <strong>{STATUT_LABELS[statut]}</strong></>, {
        action: {
          label: 'Annuler',
          icon: <Undo2 />,
          onClick: async () => {
            try { await api.patch(`/commandes/${id}/statut`, { statut: avant }); } catch (err) { toast.error(err.message); }
            load();
          },
        },
      });
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStatutBusy(false);
    }
  };

  const supprimer = async () => {
    const ok = await confirmer({
      title: 'Mettre cette commande à la corbeille ?',
      message: 'Elle disparaîtra du tableau. Un administrateur pourra la restaurer depuis la corbeille.',
      confirmLabel: 'Mettre à la corbeille',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/commandes/${id}`);
      toast.success(`Commande ${commande.reference} mise à la corbeille`);
      navigate('/');
    } catch (err) { toast.error(err.message); }
  };

  // Retour au tableau aussitôt : rouvrir la fiche la marquerait de nouveau comme lue.
  const remettreNonLue = async () => {
    try {
      await api.patch(`/commandes/${id}/lecture`, { lue: false });
      toast.success(<>Commande <strong>{commande.reference}</strong> remise en non lue</>);
      navigate('/');
    } catch (err) { toast.error(err.message); }
  };

  const restaurer = async () => {
    try {
      await api.post(`/commandes/${id}/restore`);
      toast.success('Commande restaurée');
      load();
    } catch (err) { toast.error(err.message); }
  };

  // Une rangée par ligne de commande ; sans lignes (import), une seule rangée pour la
  // commande ; et les visuels éventuels non rattachés à une ligne à la fin.
  const decrireLigne = (l) => {
    const produit = produitsByNom[l.typeMug];
    const accessoire = produit?.compteMugs === false;
    const fichiers = l.fichiers;
    return {
      ...l,
      accessoire,
      imageProduit: imageProduit(produit),
      reglage: reglages[normVisuel(l.visuel)],
      visuel: l.visuel || 'Visuel sans nom',
      manquante: fichiers.length === 0 && !accessoire && !commande.fichiersSupprimes,
    };
  };
  const lignes = (commande.lignes?.length > 0
    ? commande.lignes.map((l) => ({ ...l, cle: l.id, ligneId: l.id, fichiers: filesByLigne[l.id] || [] }))
    : [{ cle: 'commande', ligneId: null, visuel: commande.designation, typeMug: commande.typeMug, quantite: qte, fichiers: visuels }]
  ).map(decrireLigne);
  if (commande.lignes?.length > 0 && filesGeneral.length > 0) {
    lignes.push({ cle: 'commande', ligneId: null, visuel: 'Visuels non rattachés à une ligne', fichiers: filesGeneral, nonRattachee: true });
  }
  const grandesLignes = lignes.length <= LIGNES_GRANDES;
  const indexOuvert = lignes.findIndex((l) => l.cle === ligneOuverte);
  const ajoutPossible = (l) => !expediee && !commande.supprime && !l.nonRattachee;
  const logsVisibles = historiqueComplet ? logs : logs.slice(0, HISTORIQUE_COURT);
  const sortieTexte = commande.dateSortieTexte || fmtDate(commande.dateLivraison);

  return (
    <>
      <Link to="/" className="back-link"><ArrowLeft />Tableau de suivi</Link>

      {commande.supprime && (
        <div className="alert alert-warning">
          <Trash />
          <span className="spacer">Cette commande est dans la corbeille : elle n’apparaît plus dans le tableau.</span>
          {isAdmin && <button className="btn btn-secondary btn-sm" onClick={restaurer}><ArchiveRestore />Restaurer</button>}
        </div>
      )}
      {data.manques?.length > 0 && (
        <div className="alert alert-warning">
          <TriangleAlert />
          <span><strong>À compléter :</strong> {data.manques.join(', ')}</span>
        </div>
      )}

      {/* En-tête : identité, actions, infos clés, avancement */}
      <div className="card">
        <div className="order-hero">
          <div className="order-hero-top">
            <div style={{ minWidth: 0 }}>
              <div className="order-hero-id">
                <span className="ref">{commande.reference}</span>
                <StatutBadge statut={commande.statut} />
                <Echeance commande={commande} />
              </div>
              <h1 className="order-title">
                {commande.client}{(commande.nom || commande.designation) && <span> · {commande.nom || commande.designation}</span>}
              </h1>
            </div>
            <div className="page-actions">
              {peutImprimer && (
                <button className={`btn ${imprimerEnAvant ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setImpression(true)}
                        title="Envoyer les transferts au PC atelier (Edge Print)"><Printer />Imprimer</button>
              )}
              {visuels.length > 0 && (
                <a className="btn btn-secondary" href={`/api/commandes/${commande.id}/fichiers/zip`}><Download />Visuels (.zip)</a>
              )}
              <button className={`btn ${imprimerEnAvant ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setEdition(true)}><Pencil />Modifier</button>
              {!commande.supprime && (
                <MenuPlus>
                  <button type="button" role="menuitem" className="menu-item" onClick={remettreNonLue}
                          title="La commande redevient « non lue » dans le tableau de suivi"><Mail />Marquer non lue</button>
                  {isAdmin && <button type="button" role="menuitem" className="menu-item is-danger" onClick={supprimer}><Trash />Mettre à la corbeille</button>}
                </MenuPlus>
              )}
            </div>
          </div>

          <div className="faits">
            <Fait label="Quantité">{plural(qte, 'mug')}</Fait>
            <Fait label="Visuels">{fmtNumber(visuels.length)}</Fait>
            <Fait label="Date de sortie" tone={ech?.type === 'late' ? 'alert' : (ech ? 'warn' : null)}>{sortieTexte}</Fait>
            <Fait label="Commandée le">{fmtDate(commande.dateCommande)}</Fait>
            <Fait label="Atelier">{commande.atelier || '—'}</Fait>
            <Fait label="Prix ESAT">{commande.prixEsat != null ? `${fmtEuro(commande.prixEsat)} / mug` : '—'}</Fait>
          </div>

          <div className="etapes">
            {STATUTS.map((s, i) => {
              const etat = i < indexStatut ? 'is-fait' : (i === indexStatut ? `is-actuelle ${STATUT_CLASS[s]}` : '');
              return (
                <button key={s} type="button" className={`etape ${etat}`}
                        disabled={i === indexStatut || statutBusy || commande.supprime}
                        onClick={() => changerStatut(s)}
                        aria-current={i === indexStatut ? 'step' : undefined}
                        title={i === indexStatut ? 'Statut actuel' : `Passer à « ${STATUT_LABELS[s]} »`}>
                  {i < indexStatut && <Check strokeWidth={3} />}
                  {i === indexStatut && <StatutIcon statut={s} />}
                  {STATUT_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          {/* Lignes de production */}
          <div className="card">
            <div className="card-header is-fin">
              <h2 className="card-title"><Layers />Production
                <span className="count">· {plural(commande.lignes?.length || 1, 'ligne')}</span>
              </h2>
            </div>
            {(commande.fichiersSupprimes || (expediee && commande.dateExpedition)) && (
              <div className="card-body is-fin">
                {commande.fichiersSupprimes ? (
                  <div className="alert alert-info">
                    <Info />
                    <span>Les visuels ont été supprimés automatiquement le {fmtDateTime(commande.fichiersSupprimesAt)} ({RETENTION_JOURS} jours après l’expédition).</span>
                  </div>
                ) : (
                  <div className="alert alert-info">
                    <Info />
                    <span>Commande expédiée : les visuels sont conservés jusqu’au <strong>{fmtDate(new Date(new Date(commande.dateExpedition).getTime() + RETENTION_JOURS * 86400000))}</strong> (SAV), puis supprimés automatiquement.</span>
                  </div>
                )}
              </div>
            )}
            {lignes.map((l) => (
              <LigneProduction
                key={l.nonRattachee ? 'non-rattachee' : l.cle}
                ligne={l}
                commandeId={commande.id}
                apercus={apercus}
                grande={grandesLignes}
                avecEtat={impressions.length > 0}
                etat={badgesEnvois(l.cle)}
                ajoutPossible={ajoutPossible(l)}
                onOuvrir={() => setLigneOuverte(l.cle)}
              />
            ))}
          </div>
        </div>

        <aside className="detail-side">
          {/* Détails */}
          <div className="card">
            <div className="card-header is-fin"><h2 className="card-title"><ListChecks />Détails</h2></div>
            <div className="card-body is-fin">
              <dl className="kv">
                <dt>Rebut</dt><dd className="tnum">{fmtNumber(commande.rebut || 0)}</dd>
                <dt>Montant ESAT</dt><dd>{commande.prixEsat != null ? fmtEuro(commande.prixEsat * qte) : '—'}</dd>
                {isAdmin && (
                  <>
                    <dt>Prix de vente <span className="admin-tag">admin</span></dt>
                    <dd>{commande.prixVente != null ? `${fmtEuro(commande.prixVente)} / mug` : '—'}</dd>
                    {marge != null && (
                      <>
                        <dt>Chiffre d’affaires</dt><dd>{fmtEuro(caTotal)}</dd>
                        <dt>Marge</dt>
                        <dd className={marge >= 0 ? 'marge-pos' : 'marge-neg'}>
                          <strong>{fmtEuro(marge)}</strong>{tauxMarge != null && <span className="muted"> ({tauxMarge} %)</span>}
                        </dd>
                      </>
                    )}
                  </>
                )}
                <dt>Facturation ESAT</dt>
                <dd>
                  {commande.factureAt
                    ? (commande.releveId && peutFacturer
                        ? <Link to={`/facturation/releves/${commande.releveId}`}><Receipt size={13} /> Facturée le {fmtDate(commande.factureAt)}</Link>
                        : `Facturée le ${fmtDate(commande.factureAt)}`)
                    : <span className="muted">À facturer</span>}
                </dd>
                <dt>Note transport</dt><dd>{commande.noteTransport || '—'}</dd>
                <dt>À facturer / arrêt</dt><dd>{commande.aFacturer || '—'}</dd>
              </dl>
              {commande.notes && (
                <div className="notes-box">
                  <div className="notes-box-title">Notes</div>
                  {commande.notes}
                </div>
              )}
            </div>
          </div>

          {/* Documents (bons de commande, rendus 3D…) */}
          <div className="card">
            <div className="card-header is-fin">
              <h2 className="card-title" title="Bons de commande, rendus 3D… conservés, jamais supprimés automatiquement">
                <FolderOpen />Documents <span className="count">· {documents.length}</span>
              </h2>
            </div>
            <div className="card-body is-fin stack" style={{ gap: '.5rem' }}>
              <DocumentsList commandeId={commande.id} fichiers={documents} onChange={load} />
              <UploadZone commandeId={commande.id} onUploaded={load} categorie="document" compact mini />
            </div>
          </div>

          {/* Historique */}
          <div className="card">
            <div className="card-header is-fin">
              <h2 className="card-title"><ScrollText />Historique</h2>
              {logs.length > HISTORIQUE_COURT && (
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setHistoriqueComplet((v) => !v)}>
                  {historiqueComplet ? 'Réduire' : `Tout voir (${logs.length})`}
                </button>
              )}
            </div>
            <div className="card-body is-fin">
              {logs.length === 0 ? <p className="muted small">Aucun événement.</p> : (
                <ul className="timeline">
                  {logsVisibles.map((l) => {
                    const ev = EVENEMENTS[l.action] || { Icone: CircleDot };
                    return (
                      <li key={l.id} className="timeline-item">
                        <span className={`timeline-dot ${ev.cls || ''}`}><ev.Icone /></span>
                        <div className="timeline-text">
                          <div className="timeline-desc">{l.detail || l.action}</div>
                          <div className="timeline-meta" title={fmtDateTime(l.createdAt)}>
                            {fmtRelative(l.createdAt)}{l.user && ` · ${l.user.nom}`}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>

      {indexOuvert >= 0 && (
        <PanneauLigne
          ligne={lignes[indexOuvert]}
          numero={indexOuvert + 1}
          total={lignes.length}
          commandeId={commande.id}
          apercus={apercus}
          etat={badgesEnvois(lignes[indexOuvert].cle)}
          ajoutPossible={ajoutPossible(lignes[indexOuvert])}
          onClose={() => setLigneOuverte(null)}
          onChange={load}
          onPrecedente={() => setLigneOuverte(lignes[indexOuvert - 1].cle)}
          onSuivante={() => setLigneOuverte(lignes[indexOuvert + 1].cle)}
        />
      )}
      {edition && (
        <CommandeFormModal
          commande={commande}
          onClose={() => setEdition(false)}
          onSaved={() => { setEdition(false); toast.success('Commande enregistrée'); load(); }}
        />
      )}
      {impression && (
        <ImpressionModal
          commandes={[{ ...commande, impressions }]}
          onClose={() => setImpression(false)}
          onSent={load}
        />
      )}
    </>
  );
}
