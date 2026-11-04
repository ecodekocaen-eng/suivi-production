// ─────────────────────────────────────────────────────────────
//  Lecture des fichiers Excel (.xlsx, .xls) et CSV dans le navigateur, chargée
//  seulement à l'usage. Rend les cellules de chaque feuille, rangée par rangée ;
//  demandePrix.js › analyserTableau y repère ensuite les colonnes.
// ─────────────────────────────────────────────────────────────

// Une demande tient largement dans ces limites : protège d'un fichier démesuré.
const RANGEES_MAX = 5000;

// Encodage d'un CSV : UTF-8, UTF-16 (« Texte Unicode » d'Excel), ou Windows-1252,
// celui d'Excel français (« CSV (séparateur : point-virgule) »).
function texteDuCsv(octets) {
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder('utf-16le').decode(octets);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

export async function feuillesDuTableur(fichier) {
  const XLSX = await import('xlsx');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const classeur = /\.csv$/i.test(fichier.name)
    // raw : le texte reste tel quel (« 36,00 », « 20/10/2026 »), analyserTableau l'interprète.
    ? XLSX.read(texteDuCsv(octets), { type: 'string', raw: true, sheetRows: RANGEES_MAX })
    : XLSX.read(octets, { type: 'array', cellDates: true, sheetRows: RANGEES_MAX });
  return classeur.SheetNames.map((nom) => XLSX.utils.sheet_to_json(classeur.Sheets[nom], {
    header: 1, raw: true, defval: '', blankrows: false,
  }));
}
