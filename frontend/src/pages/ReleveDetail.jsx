// ─────────────────────────────────────────────────────────────
//  Détail d'un relevé de facturation — mise en page imprimable
//  (Imprimer → PDF depuis le navigateur) + export CSV.
//  Les lignes sont figées au moment de la création du relevé.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, Download, Trash } from 'lucide-react';
import { api } from '../api.js';
import { exportReleveCsv } from '../csv.js';
import { fmtDate, fmtEuro, fmtNumber } from '../format.js';
import { PageHeader, Loading, usePageTitle } from '../ui/bits.jsx';
import { useConfirm, useToast } from '../ui/feedback.jsx';
import logo from '../assets/logo-ecodeko.png';

export default function ReleveDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirmer = useConfirm();
  const [releve, setReleve] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/facturation/releves/${id}`)
      .then((d) => setReleve(d.releve))
      .catch((e) => setError(e.message));
  }, [id]);

  usePageTitle(releve ? `Relevé ${releve.numero}` : 'Relevé');

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!releve) return <Loading />;

  const totalMugs = releve.lignes.reduce((s, l) => s + (l.quantite || 0), 0);

  const annuler = async () => {
    const ok = await confirmer({
      title: `Annuler le relevé ${releve.numero} ?`,
      message: 'Ses commandes redeviendront « à facturer ».',
      confirmLabel: 'Annuler le relevé',
      cancelLabel: 'Garder',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.del(`/facturation/releves/${releve.id}`);
      toast.success(`Relevé ${releve.numero} annulé`);
      navigate('/facturation');
    } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          back={{ to: '/facturation', label: 'Facturation ESAT' }}
          title={`Relevé ${releve.numero}`}
          subtitle={releve.libelle || `Établi le ${fmtDate(releve.createdAt)}`}
          actions={(
            <>
              <button className="btn btn-danger-ghost" onClick={annuler}><Trash />Annuler ce relevé</button>
              <button className="btn btn-secondary" onClick={() => exportReleveCsv(releve)}><Download />Export CSV</button>
              <button className="btn btn-primary" onClick={() => window.print()}><Printer />Imprimer / PDF</button>
            </>
          )}
        />
      </div>

      {/* Document imprimable */}
      <div className="card releve">
        <div className="releve-head">
          <div>
            <img src={logo} alt="ECO'DEKO — Objets et textiles promotionnels" className="releve-logo" />
            <h1 className="releve-title">Relevé de facturation ESAT</h1>
            <p className="muted">Production de mugs</p>
          </div>
          <dl className="releve-meta">
            <dt>Numéro</dt><dd className="mono">{releve.numero}</dd>
            {releve.libelle && <><dt>Période</dt><dd>{releve.libelle}</dd></>}
            <dt>Établi le</dt><dd>{fmtDate(releve.createdAt)}</dd>
            {releve.creePar && <><dt>Par</dt><dd>{releve.creePar.nom}</dd></>}
          </dl>
        </div>

        <div className="table-wrap">
          <table className="table">
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
                  <td className="num tnum">{fmtNumber(l.quantite)}</td>
                  <td className="num tnum">{l.prixEsat != null ? fmtEuro(l.prixEsat) : '—'}</td>
                  <td className="num tnum">{fmtEuro(l.montant)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3">Total</td>
                <td className="num tnum">{fmtNumber(totalMugs)}</td>
                <td />
                <td className="num tnum">{fmtEuro(releve.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="releve-foot">
          Relevé établi via l’application Suivi de production ECO'DEKO — {releve.lignes.length} commande(s),
          montants = quantité × prix ESAT unitaire.
        </p>
      </div>
    </>
  );
}
