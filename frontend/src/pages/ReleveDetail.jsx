// ─────────────────────────────────────────────────────────────
//  Détail d'un relevé de facturation — mise en page imprimable
//  (Imprimer → PDF depuis le navigateur) + export CSV.
//  Les lignes sont figées au moment de la création du relevé.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { exportReleveCsv } from '../csv.js';
import { fmtDate, fmtEuro, fmtNumber } from '../format.js';

export default function ReleveDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [releve, setReleve] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/facturation/releves/${id}`)
      .then((d) => setReleve(d.releve))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!releve) return <p className="muted">Chargement…</p>;

  const totalMugs = releve.lignes.reduce((s, l) => s + (l.quantite || 0), 0);

  const annuler = async () => {
    if (!window.confirm(`Annuler le relevé ${releve.numero} ? Ses commandes redeviendront « à facturer ».`)) return;
    await api.del(`/facturation/releves/${releve.id}`);
    navigate('/facturation');
  };

  return (
    <>
      <div className="no-print">
        <p className="breadcrumb"><Link to="/facturation">← Facturation</Link></p>
        <div className="detail-actions" style={{ marginBottom: '1rem' }}>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨 Imprimer / PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportReleveCsv(releve)}>⬇ Export CSV</button>
          <button className="btn btn-danger btn-sm" onClick={annuler}>Annuler ce relevé</button>
        </div>
      </div>

      {/* Document imprimable */}
      <div className="card releve-doc">
        <div className="releve-head">
          <div>
            <h1 className="releve-title">Relevé de facturation ESAT</h1>
            <p className="muted">Production de mugs — ECODEKO</p>
          </div>
          <div className="releve-meta">
            <div><span className="muted">Numéro :</span> <strong className="mono">{releve.numero}</strong></div>
            {releve.libelle && <div><span className="muted">Période :</span> <strong>{releve.libelle}</strong></div>}
            <div><span className="muted">Établi le :</span> {fmtDate(releve.createdAt)}</div>
            {releve.creePar && <div><span className="muted">Par :</span> {releve.creePar.nom}</div>}
          </div>
        </div>

        <table className="orders releve-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Client</th>
              <th>Désignation</th>
              <th className="num">Quantité</th>
              <th className="num">Prix ESAT</th>
              <th className="num">Montant</th>
            </tr>
          </thead>
          <tbody>
            {releve.lignes.map((l, i) => (
              <tr key={i}>
                <td className="mono">{l.reference}</td>
                <td>{l.client}</td>
                <td>{l.designation}</td>
                <td className="num">{fmtNumber(l.quantite)}</td>
                <td className="num">{l.prixEsat != null ? fmtEuro(l.prixEsat) : '—'}</td>
                <td className="num">{fmtEuro(l.montant)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="releve-total">
              <td colSpan="3"><strong>Total</strong></td>
              <td className="num"><strong>{fmtNumber(totalMugs)}</strong></td>
              <td></td>
              <td className="num"><strong>{fmtEuro(releve.total)}</strong></td>
            </tr>
          </tfoot>
        </table>

        <p className="muted releve-foot">
          Relevé établi via l'application Suivi production ECODEKO —
          {releve.lignes.length} commande(s), montants = quantité × prix ESAT unitaire.
        </p>
      </div>
    </>
  );
}
