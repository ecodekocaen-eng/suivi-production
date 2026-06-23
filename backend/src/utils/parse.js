// ─────────────────────────────────────────────────────────────
//  Utilitaires de parsing (dates FR, nombres, prix) — partagés
//  par le formulaire et le script d'import CSV.
// ─────────────────────────────────────────────────────────────

// "JJ/MM/AAAA" → objet Date (ou null si non reconnaissable).
export function parseFrDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  const m = str.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;

  let [, day, month, year] = m;
  day = parseInt(day, 10);
  month = parseInt(month, 10);
  year = parseInt(year, 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Entier sûr (ou valeur par défaut).
export function parseIntSafe(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(String(value).replace(/\s/g, ''), 10);
  return Number.isNaN(n) ? fallback : n;
}

// Prix "0,2" (FR) → 0.2 (ou null).
export function parsePrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = parseFloat(String(value).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isNaN(n) ? null : n;
}

// Chaîne nettoyée (ou null si vide).
export function cleanStr(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}
