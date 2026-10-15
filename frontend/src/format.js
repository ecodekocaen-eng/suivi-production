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

// Date ISO → « il y a 5 min », « hier à 14:05 », « le 12/10/2026 à 14:05 ».
export function fmtRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 60) return 'à l’instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  if (d >= auj) return `aujourd’hui à ${heure}`;
  const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
  if (d >= hier) return `hier à ${heure}`;
  return `le ${d.toLocaleDateString('fr-FR')} à ${heure}`;
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

// Date du jour au format "YYYY-MM-DD" (heure locale), pour <input type="date">.
export function aujourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// Montant en euros : '1 234,50 €' (ou '—').
export function fmtEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

// Temps de presse en secondes → '60 s' ou '1 min 30 s'.
export function fmtTemps(s) {
  if (s == null || s === '') return '—';
  const n = Number(s);
  if (Number.isNaN(n)) return '—';
  if (n < 60) return `${n} s`;
  const min = Math.floor(n / 60);
  const sec = n % 60;
  return sec ? `${min} min ${sec} s` : `${min} min`;
}

// Taille en octets → Ko/Mo lisible.
export function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Pluriel simple : plural(3, 'mug') → '3 mugs'.
export function plural(n, mot, pluriel = `${mot}s`) {
  return `${fmtNumber(n)} ${Math.abs(Number(n)) > 1 ? pluriel : mot}`;
}

// Initiales d'un nom (avatar) : « Admin local » → « AL ».
export function initiales(nom) {
  const parts = String(nom || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Échéance d'une commande, d'après sa date de sortie :
//   late (dépassée) · today · soon (≤ 3 jours) · asap (texte « ASAP », « urgent »…)
// Même règle que les « retards » des statistiques : tant que la commande
// n'est pas expédiée, une date de sortie dépassée est un retard.
export function echeance(c) {
  if (!c || c.statut === 'Expédié' || c.supprime) return null;
  if (c.dateLivraison) {
    const d = new Date(c.dateLivraison); // minuit UTC du jour de sortie
    const sortie = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const n = new Date();
    const jour = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    const jours = Math.round((sortie - jour) / 86400000);
    if (jours < 0) return { type: 'late', jours: -jours, label: `Retard ${-jours} j`, titre: `Date de sortie dépassée de ${-jours} jour(s)` };
    if (jours === 0) return { type: 'today', jours, label: 'Aujourd’hui', titre: 'Sortie prévue aujourd’hui' };
    if (jours <= 3) return { type: 'soon', jours, label: `J-${jours}`, titre: `Sortie dans ${jours} jour(s)` };
    return null;
  }
  const texte = (c.dateSortieTexte || '').trim();
  if (/asap|urgent|express|rapide|vite/i.test(texte)) {
    return { type: 'asap', label: texte.length <= 8 ? texte.toUpperCase() : 'Urgent', titre: `Sortie : ${texte}` };
  }
  return null;
}
