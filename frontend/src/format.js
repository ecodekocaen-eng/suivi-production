// Helpers de formatage d'affichage.

// Date ISO → JJ/MM/AAAA (ou '—').
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR');
}

// Date ISO → JJ/MM/AAAA HH:mm.
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// Nombre avec séparateur de milliers (format FR).
export function fmtNumber(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('fr-FR');
}

// 'YYYY-MM' → 'mois AAAA' abrégé (ex : 'janv. 2026').
export function fmtMois(ym) {
  const [y, m] = ym.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

// Ajoute n jours ouvrés (lun-ven) à une date "YYYY-MM-DD" → "JJ/MM/AAAA".
export function addJoursOuvres(dateStr, n) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  let ajoutes = 0;
  while (ajoutes < n) {
    d.setDate(d.getDate() + 1);
    const jour = d.getDay(); // 0 = dimanche, 6 = samedi
    if (jour !== 0 && jour !== 6) ajoutes += 1;
  }
  return d.toLocaleDateString('fr-FR');
}

// Taille en octets → Ko/Mo lisible.
export function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
