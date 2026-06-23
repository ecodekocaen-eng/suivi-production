// ─────────────────────────────────────────────────────────────
//  Import des données de la Google Sheet (export CSV) → base Prisma.
//
//  Usage :
//    npm run import -- --file "/chemin/export.csv"
//    npm run import -- --file "/chemin/export.csv" --reset
//
//  - Idempotent : chaque ligne reçoit une référence stable IMP-00001…
//    (basée sur sa position). Relancer l'import ne crée pas de doublon.
//  - --reset : vide d'abord les commandes/fichiers/logs.
//  - Rapport final : importées / ignorées (doublons) / erreurs.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { prisma } from '../src/prisma.js';
import { parseFrDate, parseIntSafe, parsePrice, cleanStr } from '../src/utils/parse.js';

// ── Arguments ──
const argv = process.argv.slice(2);
const reset = argv.includes('--reset');
const fileIdx = argv.indexOf('--file');
const csvPath = fileIdx !== -1 ? argv[fileIdx + 1]
  : '/Users/alexandrebance/Documents/COMPTA/1606/MAYOTTE/SUIVI PRODUCTION MUG - SUIVI GENERALE.csv';

if (!csvPath || !fs.existsSync(csvPath)) {
  console.error(`❌ Fichier introuvable : ${csvPath}`);
  process.exit(1);
}

// ── Mapping du statut de la feuille → statut de l'application ──
function mapStatut(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s === '') return 'EN_ATTENTE';
  if (s.includes('impression')) return 'EN_PRODUCTION';
  if (s.includes('cours de prod') || s.includes('en cours')) return 'EN_PRODUCTION';
  if (s.startsWith('termin')) return 'PRET_A_EXPEDIER';
  if (s.startsWith('exp')) return 'EXPEDIEE';
  return 'EN_ATTENTE';
}

// ── Scinde la colonne REBUS : nombre OU note de transport ──
function splitRebus(raw) {
  const val = cleanStr(raw);
  if (!val) return { rebut: 0, noteTransport: null };
  if (/^\d+$/.test(val)) return { rebut: parseInt(val, 10), noteTransport: null };
  return { rebut: 0, noteTransport: val };
}

// ── Lecture du CSV ──
const content = fs.readFileSync(csvPath, 'utf8');
const records = parse(content, { relax_column_count: true, skip_empty_lines: true });
const dataRows = records.slice(3); // ignore titre + bandeau + en-têtes

if (reset) {
  await prisma.log.deleteMany({});
  await prisma.fichier.deleteMany({});
  await prisma.commande.deleteMany({});
  console.log('🧹 Tables commandes/fichiers/logs vidées (--reset).');
}

let imported = 0; let ignored = 0; let errors = 0;

for (let i = 0; i < dataRows.length; i++) {
  const row = dataRows[i];
  // Colonnes : 0 Date | 1 Client | 2 TypeMug | 3 Fichier | 4 Quantité
  // 5 Statut | 6 PrixESAT | 7 DateSortie | 8 Atelier | 9 Rebus
  // 10 Commentaire | 11 AFacturer
  const client = cleanStr(row[1]);
  const designation = cleanStr(row[3]);

  // Ligne totalement vide → ignorée.
  if (!client && !designation && !cleanStr(row[0])) { ignored++; continue; }

  // Référence stable basée sur la position (idempotence).
  const reference = `IMP-${String(i + 1).padStart(5, '0')}`;

  try {
    const existing = await prisma.commande.findUnique({ where: { reference } });
    if (existing) { ignored++; continue; } // doublon → ignoré

    const statut = mapStatut(row[5]);
    const { rebut, noteTransport } = splitRebus(row[9]);
    const dateSortieTexte = cleanStr(row[7]);

    await prisma.commande.create({
      data: {
        reference,
        client: client || 'Inconnu',
        designation: designation || '(sans visuel)',
        quantite: parseIntSafe(row[4], 0),
        statut,
        dateCommande: parseFrDate(row[0]),
        dateLivraison: parseFrDate(dateSortieTexte),
        // On ne fabrique pas de date d'expédition pour l'historique (inconnue) :
        // le délai moyen se calcule sur les expéditions réelles à venir.
        dateExpedition: null,
        typeMug: cleanStr(row[2]),
        prixEsat: parsePrice(row[6]),
        atelier: cleanStr(row[8]),
        rebut,
        noteTransport,
        aFacturer: cleanStr(row[11]),
        dateSortieTexte,
        notes: cleanStr(row[10]),
        fichiersSupprimes: statut === 'EXPEDIEE',
        fichiersSupprimesAt: statut === 'EXPEDIEE' ? parseFrDate(row[0]) : null,
      },
    });
    imported++;
  } catch (err) {
    console.error(`Erreur ligne ${i + 1} :`, err.message);
    errors++;
  }
}

console.log('─────────────────────────────────────────');
console.log(`✅ Import terminé`);
console.log(`   Importées : ${imported}`);
console.log(`   Ignorées (doublons/vides) : ${ignored}`);
console.log(`   Erreurs : ${errors}`);
console.log('─────────────────────────────────────────');

await prisma.$disconnect();
process.exit(0);
