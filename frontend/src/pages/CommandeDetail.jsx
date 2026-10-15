// ─────────────────────────────────────────────────────────────
//  Fiche commande : en-tête (infos clés + avancement cliquable),
//  lignes de production (réglage presse + visuels), documents,
//  détails et historique. Modification dans une fenêtre dédiée.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Download, Trash, ArchiveRestore, Package, CalendarClock, CalendarDays, Factory, Euro,
  Layers, FolderOpen, Info, Check, Undo2, Truck, MessageSquareText, Link2, ExternalLink, ListChecks,
  ScrollText, Plus, Upload, Flag, Thermometer, CircleDot, FileX, Receipt,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS, STATUT_CLASS } from '../constants.js';
import { fmtDate, fmtDateTime, fmtNumber, fmtEuro, fmtRelative, echeance, plural } from '../format.js';
import { Loading, EmptyState, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import { StatutBadge, StatutIcon, Echeance } from '../components/Statut.jsx';
import GalerieVisuels from '../components/GalerieVisuels.jsx';
import UploadZone from '../components/UploadZone.jsx';
import Thumb, { imageProduit } from '../components/Thumb.jsx';
import ReglageLigne from '../components/ReglageLigne.jsx';
import DocumentsList from '../components/DocumentsList.jsx';
import CommandeFormModal from '../components/CommandeFormModal.jsx';

// Clé de correspondance d'un visuel (identique à la normalisation backend).
const normVisuel = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

const RETENTION_JOURS = 60;

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
};

function Fact({ icon: Icone, label, children, tone = null }) {
  return (
    <div className={`fact${tone ? ` is-${tone}` : ''}`}>
      <span className="fact-icon"><Icone /></span>
      <span className="fact-text">
        <span className="fact-label">{label}</span>
        <span className="fact-value">{children}</span>
      </span>
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
  const [statutBusy, setStatutBusy] = useState(false);
  const [produitsByNom, setProduitsByNom] = useState({});

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

  const restaurer = async () => {
    try {
      await api.post(`/commandes/${id}/restore`);
      toast.success('Commande restaurée');
      load();
    } catch (err) { toast.error(err.message); }
  };

  const sortieTexte = commande.dateSortieTexte || fmtDate(commande.dateLivraison);
  const rendLigne = (l) => {
    const prod = produitsByNom[l.typeMug];
    const accessoire = prod?.compteMugs === false;
    return (
      <div className="line" key={l.id}>
        <div className="line-head">
          <Thumb src={imageProduit(prod)} alt={l.typeMug || ''} size={44} />
          <div className="line-head-text">
            <span className="line-visuel">{l.visuel || 'Visuel sans nom'}</span>
            <span className="line-type">{l.typeMug || 'Type non précisé'}{accessoire ? ' · accessoire' : ''}</span>
          </div>
          <div className="line-qty">
            <strong>{fmtNumber(l.quantite)}</strong>
            <span>{accessoire ? 'pièces' : 'mugs'}</span>
          </div>
        </div>
        <div className="line-body">
          {(l.commentaire || l.lien) && (
            <div className="line-notes">
              {l.commentaire && <span><MessageSquareText />{l.commentaire}</span>}
              {l.lien && (
                <a href={l.lien} target="_blank" rel="noopener noreferrer"><Link2 />Lien de transfert<ExternalLink size={12} /></a>
              )}
            </div>
          )}
          <ReglageLigne visuel={l.visuel} reglage={reglages[normVisuel(l.visuel)]} onSaved={load} />
          <GalerieVisuels commandeId={commande.id} fichiers={filesByLigne[l.id] || []} onChange={load} />
          {!expediee && <UploadZone commandeId={commande.id} ligneId={l.id} onUploaded={load} compact />}
        </div>
      </div>
    );
  };

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

      {/* En-tête : identité, infos clés, actions, avancement */}
      <div className="card">
        <div className="order-hero">
          <div className="order-hero-top">
            <div style={{ minWidth: 0 }}>
              <div className="order-hero-id">
                <span className="ref">{commande.reference}</span>
                <StatutBadge statut={commande.statut} />
                <Echeance commande={commande} />
              </div>
              <h1 className="order-title">{commande.client}</h1>
              <p className="order-sub">{commande.nom || commande.designation}</p>
            </div>
            <div className="page-actions">
              {visuels.length > 0 && (
                <a className="btn btn-secondary" href={`/api/commandes/${commande.id}/fichiers/zip`}>
                  <Download />Tous les visuels (.zip)
                </a>
              )}
              <button className="btn btn-primary" onClick={() => setEdition(true)}><Pencil />Modifier</button>
              {isAdmin && !commande.supprime && (
                <button className="btn btn-danger-ghost btn-icon" onClick={supprimer}
                        title="Mettre à la corbeille" aria-label="Mettre à la corbeille"><Trash /></button>
              )}
            </div>
          </div>

          <div className="facts">
            <Fact icon={Package} label="Quantité">{plural(qte, 'mug')}</Fact>
            <Fact icon={CalendarClock} label="Date de sortie"
                  tone={ech?.type === 'late' ? 'alert' : (ech ? 'warn' : null)}>
              {sortieTexte}
            </Fact>
            <Fact icon={CalendarDays} label="Commandée le">{fmtDate(commande.dateCommande)}</Fact>
            <Fact icon={Factory} label="Atelier">{commande.atelier || '—'}</Fact>
            <Fact icon={Euro} label="Prix ESAT">
              {commande.prixEsat != null ? `${fmtEuro(commande.prixEsat)} / mug` : '—'}
            </Fact>
          </div>
        </div>

        <div className="stepper-wrap">
          <div className="stepper-head">
            <h2 className="section-title">Avancement</h2>
            {!commande.supprime && (
              <span className="stepper-hint"><Info />Cliquez sur une étape pour changer le statut</span>
            )}
          </div>
          <div className="stepper">
            {STATUTS.map((s, i) => {
              const etat = i < indexStatut ? 'is-done' : (i === indexStatut ? `is-current ${STATUT_CLASS[s]}` : '');
              return (
                <button key={s} type="button" className={`step ${etat}`}
                        disabled={i === indexStatut || statutBusy || commande.supprime}
                        onClick={() => changerStatut(s)}
                        aria-current={i === indexStatut ? 'step' : undefined}
                        title={i === indexStatut ? 'Statut actuel' : `Passer à « ${STATUT_LABELS[s]} »`}>
                  <span className="step-dot">{i < indexStatut ? <Check strokeWidth={3} /> : <StatutIcon statut={s} />}</span>
                  <span className="step-label">{STATUT_LABELS[s]}</span>
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
            <div className="card-header">
              <h2 className="card-title"><Layers />Production
                <span className="count">· {plural(commande.lignes?.length || 1, 'ligne')}</span>
              </h2>
              <span className="card-subtitle">{plural(visuels.length, 'visuel')}</span>
            </div>
            <div className="card-body">
              {commande.fichiersSupprimes && (
                <div className="alert alert-info">
                  <Info />
                  <span>Les visuels ont été supprimés automatiquement le {fmtDateTime(commande.fichiersSupprimesAt)} ({RETENTION_JOURS} jours après l’expédition).</span>
                </div>
              )}
              {!commande.fichiersSupprimes && expediee && commande.dateExpedition && (
                <div className="alert alert-info">
                  <Info />
                  <span>Commande expédiée : les visuels sont conservés jusqu’au <strong>{fmtDate(new Date(new Date(commande.dateExpedition).getTime() + RETENTION_JOURS * 86400000))}</strong> (SAV), puis supprimés automatiquement.</span>
                </div>
              )}

              {commande.lignes?.length > 0 ? (
                <>
                  {commande.lignes.map(rendLigne)}
                  {/* Visuels éventuels non rattachés à une ligne */}
                  {filesGeneral.length > 0 && (
                    <div className="line">
                      <div className="line-head">
                        <div className="line-head-text"><span className="line-visuel">Visuels non rattachés à une ligne</span></div>
                      </div>
                      <div className="line-body">
                        <GalerieVisuels commandeId={commande.id} fichiers={filesGeneral} onChange={load} />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Commande sans lignes (import) : visuels au niveau commande */
                <div className="line">
                  <div className="line-head">
                    <Thumb src={imageProduit(produitsByNom[commande.typeMug])} alt="" size={44} />
                    <div className="line-head-text">
                      <span className="line-visuel">{commande.designation || 'Visuel sans nom'}</span>
                      <span className="line-type">{commande.typeMug || 'Type non précisé'}</span>
                    </div>
                    <div className="line-qty"><strong>{fmtNumber(qte)}</strong><span>mugs</span></div>
                  </div>
                  <div className="line-body">
                    <ReglageLigne visuel={commande.designation} reglage={reglages[normVisuel(commande.designation)]} onSaved={load} />
                    <GalerieVisuels commandeId={commande.id} fichiers={visuels} onChange={load} />
                    {!expediee && <UploadZone commandeId={commande.id} onUploaded={load} />}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Documents (bons de commande, rendus 3D…) */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title"><FolderOpen />Documents <span className="count">· {documents.length}</span></h2>
              <span className="card-subtitle">Bons de commande, rendus 3D… conservés, jamais supprimés automatiquement</span>
            </div>
            <div className="card-body stack" style={{ gap: '.75rem' }}>
              <DocumentsList commandeId={commande.id} fichiers={documents} onChange={load} />
              <UploadZone commandeId={commande.id} onUploaded={load} categorie="document" compact />
            </div>
          </div>
        </div>

        <aside className="detail-side">
          {/* Détails */}
          <div className="card">
            <div className="card-header"><h2 className="card-title"><ListChecks />Détails</h2></div>
            <div className="card-body">
              <dl className="kv">
                <dt>Référence</dt><dd className="mono">{commande.reference}</dd>
                <dt>Client</dt><dd>{commande.client}</dd>
                <dt>Nom</dt><dd>{commande.nom || '—'}</dd>
                <dt>Désignation</dt><dd>{commande.designation || '—'}</dd>
                <dt>Type de mug</dt><dd>{commande.typeMug || '—'}</dd>
                <dt>Quantité</dt><dd className="tnum">{fmtNumber(qte)}</dd>
                <dt>Rebut</dt><dd className="tnum">{fmtNumber(commande.rebut || 0)}</dd>
                <div className="kv-sep" />
                <dt>Prix ESAT</dt><dd>{commande.prixEsat != null ? fmtEuro(commande.prixEsat) : '—'}</dd>
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
                <div className="kv-sep" />
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

          {/* Historique */}
          <div className="card">
            <div className="card-header"><h2 className="card-title"><ScrollText />Historique</h2></div>
            <div className="card-body">
              {logs.length === 0 ? <p className="muted small">Aucun événement.</p> : (
                <ul className="timeline">
                  {logs.map((l) => {
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

      {edition && (
        <CommandeFormModal
          commande={commande}
          onClose={() => setEdition(false)}
          onSaved={() => { setEdition(false); toast.success('Commande enregistrée'); load(); }}
        />
      )}
    </>
  );
}
