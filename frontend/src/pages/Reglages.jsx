// ─────────────────────────────────────────────────────────────
//  Bibliothèque des réglages de presse par visuel.
//  Recherche + création/modification (clé = visuel) + suppression.
//  Accessible et modifiable par tout utilisateur connecté.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash, Thermometer, Timer, LoaderCircle, SearchX } from 'lucide-react';
import { api } from '../api.js';
import { fmtDate, fmtTemps } from '../format.js';
import { PageHeader, EmptyState, SearchInput, Loading, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import Modal from '../ui/Modal.jsx';

const emptyForm = { visuel: '', temperature: '', tempsSecondes: '', note: '' };

function ReglageModal({ reglage = null, onClose, onSaved }) {
  const [form, setForm] = useState(reglage ? {
    visuel: reglage.visuel,
    temperature: reglage.temperature ?? '',
    tempsSecondes: reglage.tempsSecondes ?? '',
    note: reglage.note ?? '',
  } : emptyForm);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await api.post('/reglages', form);
      onSaved(`Réglage « ${form.visuel.trim()} » enregistré`);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <Modal
      title={reglage ? 'Modifier le réglage' : 'Nouveau réglage presse'}
      description="Température et temps de presse d’un visuel, retrouvés automatiquement sur ses prochaines commandes."
      icon={<Thermometer />}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle className="spin" />}Enregistrer</button>
        </>
      )}
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="stack">
        <label className="field">
          <span className="field-label">Visuel <span className="req">*</span></span>
          <input value={form.visuel} onChange={set('visuel')} placeholder="ex : Logo Mairie de Caen" required />
          <span className="field-hint">Un visuel déjà présent dans la bibliothèque voit son réglage mis à jour.</span>
        </label>
        <div className="form-grid">
          <label className="field">
            <span className="field-label"><Thermometer size={14} />Température (°C)</span>
            <input type="number" value={form.temperature} onChange={set('temperature')} placeholder="200" />
          </label>
          <label className="field">
            <span className="field-label"><Timer size={14} />Temps de presse (secondes)</span>
            <input type="number" value={form.tempsSecondes} onChange={set('tempsSecondes')} placeholder="60" />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Note</span>
          <input value={form.note} onChange={set('note')} placeholder="Astuce, pression, sens de pose…" />
        </label>
      </div>
    </Modal>
  );
}

export default function Reglages() {
  usePageTitle('Réglages presse');
  const toast = useToast();
  const confirmer = useConfirm();
  const [reglages, setReglages] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // { reglage } | { nouveau: true }

  // Anti-rebond : la recherche (qui interroge la base) n'est lancée que
  // 350 ms après la dernière frappe.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    try {
      setReglages((await api.get(`/reglages${qs}`)).reglages);
    } catch (err) { toast.error(err.message); }
  }, [search, toast]);

  useEffect(() => { load(); }, [load]);

  const supprimer = async (r) => {
    const ok = await confirmer({
      title: 'Supprimer ce réglage ?',
      message: <>Le réglage du visuel « {r.visuel} » sera supprimé de la bibliothèque.</>,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/reglages/${r.id}`);
      toast.success('Réglage supprimé');
      load();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <>
      <PageHeader
        title="Réglages presse"
        subtitle="Température et temps de presse par visuel. Renseignés une fois, ils s’affichent automatiquement sur chaque commande du même visuel."
        actions={<button className="btn btn-primary" onClick={() => setModal({ nouveau: true })}><Plus />Nouveau réglage</button>}
      />

      <div className="card">
        <div className="toolbar">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Rechercher un visuel…" />
          <span className="spacer" />
          {reglages && <span className="toolbar-info"><span><strong>{reglages.length}</strong> réglage{reglages.length > 1 ? 's' : ''}</span></span>}
        </div>

        {!reglages ? <Loading /> : reglages.length === 0 ? (
          search ? (
            <EmptyState icon={<SearchX />} title="Aucun résultat" text={`Aucun réglage pour « ${search} ».`} />
          ) : (
            <EmptyState icon={<Thermometer />} title="Bibliothèque vide"
                        text="Enregistrez la température et le temps de presse d’un visuel : ils seront rappelés sur ses prochaines commandes."
                        action={<button className="btn btn-primary btn-sm" onClick={() => setModal({ nouveau: true })}><Plus />Nouveau réglage</button>} />
          )
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Visuel</th>
                  <th>Température</th>
                  <th>Temps de presse</th>
                  <th>Note</th>
                  <th>Dernière commande</th>
                  <th className="num" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {reglages.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.visuel}</td>
                    <td className="nowrap">
                      {r.temperature != null
                        ? <span className="press-val"><Thermometer size={15} className="text-success" />{r.temperature} °C</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="nowrap">
                      {r.tempsSecondes != null
                        ? <span className="press-val"><Timer size={15} className="text-success" />{fmtTemps(r.tempsSecondes)}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="muted">{r.note || '—'}</td>
                    <td className="nowrap">
                      {r.derniere
                        ? <span className="muted"><span className="ref">{r.derniere.reference}</span> · {fmtDate(r.derniere.date)}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="num nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal({ reglage: r })}><Pencil />Modifier</button>
                      <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => supprimer(r)}
                              title="Supprimer" aria-label={`Supprimer le réglage de ${r.visuel}`}><Trash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ReglageModal
          reglage={modal.reglage || null}
          onClose={() => setModal(null)}
          onSaved={(message) => { setModal(null); toast.success(message); load(); }}
        />
      )}
    </>
  );
}
