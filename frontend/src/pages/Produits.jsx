// ─────────────────────────────────────────────────────────────
//  Gestion du catalogue produits (types de mug) — réservé ADMIN.
//  Cartes produit (miniature, prix d'achat, stock) + fenêtre d'édition.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash, Coffee, ImagePlus, Camera, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { fmtEuro, fmtNumber } from '../format.js';
import { PageHeader, EmptyState, Loading, Switch, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import Modal from '../ui/Modal.jsx';
import { imageProduit } from '../components/Thumb.jsx';
import MugIllustration from '../components/MugIllustration.jsx';

// Fenêtre de création / modification d'un produit.
function ProduitModal({ produit = null, onClose, onSaved }) {
  const edition = !!produit;
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    nom: produit?.nom || '',
    prixAchat: produit?.prixAchat ?? '',
    stock: produit?.stock ?? '',
    compteMugs: produit ? produit.compteMugs !== false : true,
    actif: produit ? produit.actif : true,
  });
  const [image, setImage] = useState(null);
  const [apercu, setApercu] = useState(imageProduit(produit));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (image) URL.revokeObjectURL(apercu); }, [image, apercu]);

  const choisirImage = (f) => {
    if (!f) return;
    setImage(f);
    setApercu(URL.createObjectURL(f));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    const champs = {
      prixAchat: String(form.prixAchat ?? '').replace(',', '.'),
      stock: form.stock === '' ? '' : String(form.stock),
      compteMugs: String(form.compteMugs),
    };
    try {
      if (edition) {
        await api.multipart('PATCH', `/produits/${produit.id}`, { ...champs, actif: String(form.actif) }, image);
      } else {
        await api.multipart('POST', '/produits', { nom: form.nom, ...champs }, image);
      }
      onSaved(edition ? 'Produit enregistré' : `Produit « ${form.nom.trim()} » créé`);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title={edition ? produit.nom : 'Nouveau produit'}
      description={edition ? 'Prix d’achat, stock, miniature et options du produit.' : 'Ajoutez un type de mug (ou un accessoire) au catalogue.'}
      icon={<Coffee />}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle className="spin" />}{edition ? 'Enregistrer' : 'Créer le produit'}</button>
        </>
      )}
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stack">
        {!edition && (
          <label className="field">
            <span className="field-label">Nom <span className="req">*</span></span>
            <input value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required placeholder="ex : MUG BLANC MAT" />
          </label>
        )}
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Prix d’achat (€)</span>
            <input value={form.prixAchat} inputMode="decimal" onChange={(e) => setForm({ ...form, prixAchat: e.target.value })} placeholder="0,45" />
          </label>
          <label className="field">
            <span className="field-label">Stock disponible</span>
            <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Non suivi" />
            <span className="field-hint">Vide = stock non suivi. Se décompte à l’entrée en production.</span>
          </label>
        </div>
        <div className="field">
          <span className="field-label">Miniature</span>
          <div className="image-pick">
            <span className="image-pick-preview">{apercu ? <img src={apercu} alt="" /> : <MugIllustration nom={form.nom || produit?.nom} />}</span>
            <div className="stack" style={{ gap: '.35rem' }}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => choisirImage(e.target.files[0])} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus />{apercu ? 'Changer l’image' : 'Choisir une image'}
              </button>
              <span className="field-hint">{image ? image.name : 'JPG ou PNG, idéalement carrée.'}</span>
            </div>
          </div>
        </div>
        <div className="stack" style={{ gap: '.6rem' }}>
          <Switch checked={form.compteMugs} onChange={(v) => setForm({ ...form, compteMugs: v })}
                  label="Compté dans la quantité de mugs (décocher pour un accessoire : étiquette…)" />
          {edition && (
            <Switch checked={form.actif} onChange={(v) => setForm({ ...form, actif: v })}
                    label="Actif (proposé dans les lignes de commande)" />
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Produits() {
  usePageTitle('Produits');
  const toast = useToast();
  const confirmer = useConfirm();
  const [produits, setProduits] = useState(null);
  const [modal, setModal] = useState(null); // { produit } | { nouveau: true }

  const load = async () => setProduits((await api.get('/produits')).produits);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const maj = async (p, fields, file = null, message = 'Produit mis à jour') => {
    try {
      await api.multipart('PATCH', `/produits/${p.id}`, fields, file);
      toast.success(message);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const supprimer = async (p) => {
    const ok = await confirmer({
      title: `Supprimer « ${p.nom} » ?`,
      message: 'Le produit disparaîtra du catalogue. Les commandes existantes gardent leur type de mug. Pour simplement ne plus le proposer, désactivez-le.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/produits/${p.id}`);
      toast.success('Produit supprimé');
      load();
    } catch (err) { toast.error(err.message); }
  };

  if (!produits) return <><PageHeader title="Produits" /><Loading /></>;

  return (
    <>
      <PageHeader
        title="Produits"
        subtitle="Types de mug proposés dans les lignes de commande : prix d’achat, stock et miniature. Le stock se décompte quand une commande entre en production."
        actions={<button className="btn btn-primary" onClick={() => setModal({ nouveau: true })}><Plus />Nouveau produit</button>}
      />

      {produits.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Coffee />} title="Catalogue vide" text="Ajoutez vos types de mug pour les choisir dans les commandes."
                      action={<button className="btn btn-primary btn-sm" onClick={() => setModal({ nouveau: true })}><Plus />Nouveau produit</button>} />
        </div>
      ) : (
        <div className="product-grid">
          {produits.map((p) => {
            const rupture = p.stock != null && p.stock <= 0;
            return (
              <div key={p.id} className={`card product-card${p.actif ? '' : ' is-inactive'}`}>
                <div className="product-media">
                  {p.image
                    ? <img src={imageProduit(p)} alt={p.nom} loading="lazy" />
                    : <MugIllustration nom={p.nom} className="product-illu" />}
                  <span className="product-flags">
                    {!p.actif && <span className="badge">Inactif</span>}
                    {p.compteMugs === false && <span className="badge badge-info">Accessoire</span>}
                    {!p.image && <span className="badge" title="Illustration par défaut : ajoutez une photo avec le bouton appareil photo">Sans photo</span>}
                  </span>
                  <label className="btn btn-secondary btn-icon btn-sm product-photo-btn" title="Changer la photo">
                    <Camera />
                    <input type="file" accept="image/*" hidden
                           onChange={(e) => e.target.files[0] && maj(p, {}, e.target.files[0], 'Photo mise à jour')} />
                  </label>
                </div>
                <div className="product-body">
                  <div className="product-name">{p.nom}</div>
                  <div className="product-stats">
                    <div className="product-stat"><span>Prix d’achat</span><strong>{p.prixAchat != null ? fmtEuro(p.prixAchat) : '—'}</strong></div>
                    <div className={`product-stat${rupture ? ' is-danger' : ''}`} title={rupture ? 'Rupture / stock négatif' : ''}>
                      <span>Stock</span><strong>{p.stock == null ? 'Non suivi' : fmtNumber(p.stock)}</strong>
                    </div>
                  </div>
                  <div className="product-foot">
                    <Switch checked={p.actif} label="Actif" onChange={(v) => maj(p, { actif: String(v) }, null, v ? 'Produit activé' : 'Produit désactivé')} />
                    <span className="row" style={{ gap: '.25rem' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setModal({ produit: p })}><Pencil />Modifier</button>
                      <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => supprimer(p)} title="Supprimer" aria-label={`Supprimer ${p.nom}`}><Trash /></button>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ProduitModal
          produit={modal.produit || null}
          onClose={() => setModal(null)}
          onSaved={(message) => { setModal(null); toast.success(message); load(); }}
        />
      )}
    </>
  );
}

