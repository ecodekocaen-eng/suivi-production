// ─────────────────────────────────────────────────────────────
//  Fiche commande : infos éditables, statut, visuels, historique.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { STATUTS, STATUT_LABELS } from '../constants.js';
import StatutBadge from '../components/StatutBadge.jsx';
import GalerieVisuels from '../components/GalerieVisuels.jsx';
import UploadZone from '../components/UploadZone.jsx';
import LignesEditor from '../components/LignesEditor.jsx';
import Thumb from '../components/Thumb.jsx';
import ReglageLigne from '../components/ReglageLigne.jsx';
import DocumentsList from '../components/DocumentsList.jsx';
import { fmtDate, fmtDateTime, fmtNumber } from '../format.js';

// Clé de correspondance d'un visuel (identique à la normalisation backend).
const normVisuel = (s) => (s || '').replace(/\s+/g, ' ').trim().toUpperCase();

// Convertit une date ISO en valeur pour <input type="date"> (yyyy-mm-dd).
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

export default function CommandeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [lignes, setLignes] = useState([]);
  const [statut, setStatut] = useState('');
  const [error, setError] = useState(null);
  const [produitsByNom, setProduitsByNom] = useState({});

  const load = useCallback(async () => {
    const d = await api.get(`/commandes/${id}`);
    setData(d);
    setStatut(d.commande.statut);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/produits')
      .then((d) => setProduitsByNom(Object.fromEntries(d.produits.map((p) => [p.nom, p]))))
      .catch(() => {});
  }, []);

  if (!data) return <p className="muted">Chargement…</p>;
  const { commande, logs } = data;
  const reglages = data.reglages || {};

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

  // Marge (réservée ADMIN) : (prix de vente − coût unitaire) × quantité.
  const isAdmin = user?.role === 'ADMIN';
  const coutU = commande.prixEsat != null ? commande.prixEsat : (produitsByNom[commande.typeMug]?.prixAchat ?? 0);
  const qte = commande.quantite || 0;
  const marge = commande.prixVente != null ? (commande.prixVente - coutU) * qte : null;
  const caTotal = commande.prixVente != null ? commande.prixVente * qte : null;
  const tauxMarge = (marge != null && caTotal > 0) ? Math.round((marge / caTotal) * 100) : null;

  const startEdit = () => {
    setForm({
      client: commande.client || '',
      dateCommande: toDateInput(commande.dateCommande),
      dateSortieTexte: commande.dateSortieTexte || '',
      prixEsat: commande.prixEsat != null ? String(commande.prixEsat) : '',
      prixVente: commande.prixVente != null ? String(commande.prixVente) : '',
      atelier: commande.atelier || '',
      rebut: commande.rebut ?? 0,
      noteTransport: commande.noteTransport || '',
      aFacturer: commande.aFacturer || '',
      notes: commande.notes || '',
    });
    // Lignes existantes, ou une ligne dérivée de l'en-tête (commandes importées).
    setLignes(commande.lignes?.length
      ? commande.lignes.map((l) => ({
          id: l.id, // conserve l'identité (et donc les visuels rattachés)
          typeMug: l.typeMug || '', visuel: l.visuel || '',
          quantite: l.quantite ?? '', commentaire: l.commentaire || '', lien: l.lien || '',
        }))
      : [{ typeMug: commande.typeMug || '', visuel: commande.designation || '',
           quantite: commande.quantite ?? '', commentaire: '' }]);
    setEditing(true);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.patch(`/commandes/${id}`, { ...form, lignes });
      setEditing(false);
      load();
    } catch (err) { setError(err.message); }
  };

  const appliquerStatut = async () => {
    if (statut === commande.statut) return;
    await api.patch(`/commandes/${id}/statut`, { statut });
    load();
  };

  const supprimer = async () => {
    if (!window.confirm('Mettre cette commande à la corbeille ?')) return;
    await api.del(`/commandes/${id}`);
    navigate('/');
  };

  const restaurer = async () => { await api.post(`/commandes/${id}/restore`); load(); };

  return (
    <>
      <p className="breadcrumb"><Link to="/">← Tableau</Link></p>

      <div className="detail-head">
        <div>
          <h1 className="page-title">{commande.client} — {commande.designation}</h1>
          <span className="mono muted">{commande.reference}</span> <StatutBadge statut={commande.statut} />
          {commande.supprime && <span className="badge st-deleted">Corbeille</span>}
        </div>
        <div className="detail-actions">
          {!editing && <button className="btn btn-primary btn-sm" onClick={startEdit}>Modifier</button>}
          {user?.role === 'ADMIN' && !commande.supprime && (
            <button className="btn btn-danger btn-sm" onClick={supprimer}>Supprimer</button>
          )}
          {user?.role === 'ADMIN' && commande.supprime && (
            <button className="btn btn-primary btn-sm" onClick={restaurer}>Restaurer</button>
          )}
        </div>
      </div>

      {/* Barre de statut */}
      <div className="status-bar">
        <label>Statut :</label>
        <select value={statut} onChange={(e) => setStatut(e.target.value)}>
          {STATUTS.map((s) => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={appliquerStatut} disabled={statut === commande.statut}>
          Appliquer
        </button>
        <span className="hint">🗓️ Les visuels sont conservés 60 jours après l'expédition, puis supprimés automatiquement.</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Informations / édition */}
      <div className="card">
        <h2>Informations</h2>
        {!editing ? (
          <dl className="info-grid">
            <dt>Référence</dt><dd className="mono">{commande.reference}</dd>
            <dt>Client</dt><dd>{commande.client}</dd>
            <dt>Désignation</dt><dd>{commande.designation}</dd>
            <dt>Type de mug</dt><dd>{commande.typeMug || '—'}</dd>
            <dt>Quantité</dt><dd>{commande.quantite}</dd>
            <dt>Prix ESAT</dt><dd>{commande.prixEsat != null ? `${commande.prixEsat} €` : '—'}</dd>
            {isAdmin && <><dt>Prix de vente</dt><dd>{commande.prixVente != null ? `${commande.prixVente} €/u` : '—'}</dd></>}
            {isAdmin && marge != null && (
              <><dt>Marge</dt><dd className={marge >= 0 ? 'marge-pos' : 'marge-neg'}>
                <strong>{fmtNumber(Math.round(marge * 100) / 100)} €</strong>
                {tauxMarge != null && <span className="muted"> ({tauxMarge}%)</span>}
                <span className="muted small"> · CA {fmtNumber(Math.round(caTotal * 100) / 100)} €</span>
              </dd></>
            )}
            <dt>Date de commande</dt><dd>{fmtDate(commande.dateCommande)}</dd>
            <dt>Date de sortie</dt><dd>{commande.dateSortieTexte || fmtDate(commande.dateLivraison)}</dd>
            <dt>Atelier</dt><dd>{commande.atelier || '—'}</dd>
            <dt>Rebut</dt><dd>{commande.rebut || 0}</dd>
            <dt>Note transport</dt><dd>{commande.noteTransport || '—'}</dd>
            <dt>À facturer / arrêt</dt><dd>{commande.aFacturer || '—'}</dd>
            <dt>Notes</dt><dd>{commande.notes || '—'}</dd>
          </dl>
        ) : (
          <form onSubmit={save}>
            <div className="form-grid">
              <label>Client<input value={form.client} onChange={set('client')} required /></label>
              <label>Prix ESAT
                <div className="esat-buttons">
                  <button type="button" className={`btn btn-sm ${form.prixEsat === '0.2' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setForm({ ...form, prixEsat: form.prixEsat === '0.2' ? '' : '0.2' })}>0,20 €</button>
                  <button type="button" className={`btn btn-sm ${form.prixEsat === '0.3' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setForm({ ...form, prixEsat: form.prixEsat === '0.3' ? '' : '0.3' })}>0,30 €</button>
                </div>
              </label>
              {isAdmin && (
                <label>Prix de vente (€ / unité)
                  <input value={form.prixVente} onChange={set('prixVente')} placeholder="2.50" />
                </label>
              )}
              <label>Date de commande<input type="date" value={form.dateCommande} onChange={set('dateCommande')} /></label>
              <label>Date de sortie (texte)<input value={form.dateSortieTexte} onChange={set('dateSortieTexte')} /></label>
              <label>Atelier<input value={form.atelier} onChange={set('atelier')} /></label>
              <label>Rebut<input type="number" min="0" value={form.rebut} onChange={set('rebut')} /></label>
              <label>Note transport<input value={form.noteTransport} onChange={set('noteTransport')} /></label>
              <label>À facturer / arrêt<input value={form.aFacturer} onChange={set('aFacturer')} /></label>
            </div>

            <LignesEditor lignes={lignes} onChange={setLignes} />

            <label className="full">Notes générales<textarea rows="2" value={form.notes} onChange={set('notes')} /></label>
            <div className="form-actions">
              <button className="btn btn-primary">Enregistrer</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </form>
        )}
      </div>

      {/* Visuels */}
      <div className="card" id="visuels">
        <div className="card-head">
          <h2>Visuels ({visuels.length})</h2>
          {visuels.length > 0 && (
            <a className="btn btn-primary btn-sm" href={`/api/commandes/${commande.id}/fichiers/zip`}>
              ⬇ Tout télécharger (zip)
            </a>
          )}
        </div>

        {commande.fichiersSupprimes && (
          <div className="alert alert-info">
            🗑️ Les visuels ont été supprimés automatiquement le {fmtDateTime(commande.fichiersSupprimesAt)} (rétention de 60 jours après l'expédition).
          </div>
        )}

        {!commande.fichiersSupprimes && expediee && commande.dateExpedition && (
          <div className="alert alert-info">
            🗓️ Commande expédiée : les visuels sont <strong>conservés jusqu'au {fmtDate(new Date(new Date(commande.dateExpedition).getTime() + 60 * 86400000))}</strong> (SAV), puis supprimés automatiquement.
          </div>
        )}

        {commande.lignes?.length > 0 ? (
          <>
            {/* Une galerie + une zone d'upload par ligne */}
            {commande.lignes.map((l) => (
              <div className="ligne-block" key={l.id}>
                <div className="ligne-block-head">
                  <span className="strong ligne-block-title">
                    {produitsByNom[l.typeMug]?.image && (
                      <Thumb src={`/api/produits/${produitsByNom[l.typeMug].id}/image`} alt={l.typeMug} size={32} />
                    )}
                    {l.typeMug || '—'} · {l.visuel || '(sans visuel)'}
                  </span>
                  <span className="muted">
                    {fmtNumber(l.quantite)} mug(s){l.commentaire ? ` · ${l.commentaire}` : ''}
                    {l.lien && <> · 🔗 <a href={l.lien} target="_blank" rel="noopener noreferrer">lien de transfert</a></>}
                  </span>
                </div>
                <ReglageLigne visuel={l.visuel} reglage={reglages[normVisuel(l.visuel)]} onSaved={load} />
                <GalerieVisuels commandeId={commande.id} fichiers={filesByLigne[l.id] || []} onChange={load} showZip={false} />
                {!expediee && (
                  <UploadZone commandeId={commande.id} ligneId={l.id} onUploaded={load} compact />
                )}
              </div>
            ))}

            {/* Visuels éventuels non rattachés à une ligne */}
            {filesGeneral.length > 0 && (
              <div className="ligne-block">
                <div className="ligne-block-head"><span className="strong">Visuels non rattachés à une ligne</span></div>
                <GalerieVisuels commandeId={commande.id} fichiers={filesGeneral} onChange={load} showZip={false} />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Commande sans lignes : visuels au niveau commande */}
            <ReglageLigne visuel={commande.designation} reglage={reglages[normVisuel(commande.designation)]} onSaved={load} />
            <GalerieVisuels commandeId={commande.id} fichiers={visuels} onChange={load} showZip={false} />
            {!expediee && (
              <div style={{ marginTop: '1rem' }}>
                <UploadZone commandeId={commande.id} onUploaded={load} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Documents (bons de commande, rendus 3D…) */}
      <div className="card">
        <div className="card-head">
          <h2>Documents ({documents.length})</h2>
          <span className="muted small">Bons de commande, rendus 3D… — conservés, jamais supprimés automatiquement</span>
        </div>
        <DocumentsList commandeId={commande.id} fichiers={documents} onChange={load} />
        <div style={{ marginTop: '.75rem' }}>
          <UploadZone commandeId={commande.id} onUploaded={load} categorie="document" compact />
        </div>
      </div>

      {/* Historique */}
      <div className="card">
        <h2>Historique</h2>
        {logs.length === 0 ? <p className="muted">Aucun événement.</p> : (
          <ul className="history">
            {logs.map((l) => (
              <li key={l.id}>
                <span className="hist-date">{fmtDateTime(l.createdAt)}</span>
                <span className="hist-desc">{l.detail || l.action}</span>
                {l.user && <span className="hist-user">— {l.user.nom}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
