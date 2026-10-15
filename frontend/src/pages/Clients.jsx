// ─────────────────────────────────────────────────────────────
//  Gestion des clients (ADMIN) : fusion des variantes + nettoyage.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Merge, Eraser, X, Building, LoaderCircle } from 'lucide-react';
import { api } from '../api.js';
import { fmtNumber, plural } from '../format.js';
import { PageHeader, EmptyState, SearchInput, Loading, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';

export default function Clients() {
  usePageTitle('Clients');
  const toast = useToast();
  const confirmer = useConfirm();
  const [clients, setClients] = useState(null);
  const [selection, setSelection] = useState(new Set());
  const [cible, setCible] = useState('');
  const [filtre, setFiltre] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => setClients((await api.get('/clients')).clients);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (nom) => setSelection((prev) => {
    const s = new Set(prev);
    if (s.has(nom)) s.delete(nom); else s.add(nom);
    return s;
  });

  // Pré-remplit la cible avec le 1er nom sélectionné (le plus fréquent) ;
  // la vide quand plus rien n'est sélectionné.
  useEffect(() => {
    if (selection.size === 0) setCible('');
    else setCible((c) => c || [...selection][0]);
  }, [selection]);

  const vider = () => { setSelection(new Set()); setCible(''); };

  const fusionner = async () => {
    const ok = await confirmer({
      title: 'Fusionner ces clients ?',
      message: <>Les commandes de {plural(selection.size, 'variante')} seront réattribuées à « <strong>{cible.trim()}</strong> ». Cette action est irréversible.</>,
      confirmLabel: 'Fusionner',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { updated } = await api.post('/clients/merge', { from: [...selection], to: cible });
      toast.success(`Fusion effectuée : ${plural(updated, 'commande')} réattribuée${updated > 1 ? 's' : ''} à « ${cible.trim()} »`);
      vider();
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const nettoyer = async () => {
    try {
      const { updated } = await api.post('/clients/normalize');
      toast.success(updated ? `Espaces nettoyés sur ${plural(updated, 'commande')}` : 'Rien à nettoyer : les noms sont déjà propres');
      await load();
    } catch (err) { toast.error(err.message); }
  };

  if (!clients) return <><PageHeader title="Clients" /><Loading /></>;

  const visibles = clients.filter((c) => c.client.toLowerCase().includes(filtre.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Fusionnez les variantes d’orthographe d’un même client (ex : « PUBLI SOUVENIR » et « PUBLI SOUVENIRS »)."
        actions={(
          <button className="btn btn-secondary" onClick={nettoyer} title="Supprime les espaces superflus dans tous les noms de clients">
            <Eraser />Nettoyer les espaces
          </button>
        )}
      />

      <div className="card">
        <div className="toolbar">
          <SearchInput value={filtre} onChange={setFiltre} placeholder="Filtrer les clients…" />
          <span className="spacer" />
          <span className="toolbar-info"><span><strong>{visibles.length}</strong> client{visibles.length > 1 ? 's' : ''}</span></span>
        </div>
        {visibles.length === 0 ? (
          <EmptyState icon={<Building />} title="Aucun client" text={filtre ? `Aucun client ne contient « ${filtre} ».` : 'Les clients apparaissent avec les commandes.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th className="col-check" aria-label="Sélection" /><th>Client</th><th className="num">Commandes</th><th className="num">Mugs</th></tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.client} className={`is-clickable${selection.has(c.client) ? ' is-selected' : ''}`} onClick={() => toggle(c.client)}>
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selection.has(c.client)} onChange={() => toggle(c.client)}
                             aria-label={`Sélectionner ${c.client}`} />
                    </td>
                    <td className="strong">{c.client}</td>
                    <td className="num tnum">{fmtNumber(c.commandes)}</td>
                    <td className="num tnum">{fmtNumber(c.quantite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barre de fusion flottante */}
      {selection.size > 0 && (
        <div className="selection-bar" role="region" aria-label="Fusion de clients">
          <div className="sel-stats">
            <span><strong>{selection.size}</strong> variante{selection.size > 1 ? 's' : ''} sélectionnée{selection.size > 1 ? 's' : ''}</span>
            <span>→ fusionner vers</span>
          </div>
          <div className="sel-actions">
            <input list="clients-list" value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Nom à conserver" aria-label="Nom du client à conserver" />
            <datalist id="clients-list">
              {clients.map((c) => <option key={c.client} value={c.client} />)}
            </datalist>
            <button className="btn btn-primary" disabled={!cible.trim() || busy} onClick={fusionner}>
              {busy ? <LoaderCircle className="spin" /> : <Merge />}Fusionner
            </button>
            <button className="btn btn-ghost btn-icon" onClick={vider} title="Vider la sélection" aria-label="Vider la sélection"><X /></button>
          </div>
        </div>
      )}
    </>
  );
}
