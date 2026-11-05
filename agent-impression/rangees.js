// ─────────────────────────────────────────────────────────────
//  Rangées prêtes : les transferts à l'unité d'une commande sont regroupés
//  dans des PDF de plusieurs pages, un par rangée de la largeur du papier.
//  Edge Print traite un PDF de plusieurs pages comme un travail imbriqué : il
//  place les pages côte à côte, avec le réglage rapide « ×1 » (rotation,
//  miroir, couleurs) et son espacement habituel. Rien à imbriquer à la main.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from './vendor/pdf-lib.esm.min.js';
import { marqueur, mettreEnPlace, nomPropre } from './depot.js';

const MM_PAR_POINT = 25.4 / 72;

// Rouleau de 44 pouces (1 118 mm) : 10 transferts de 100 mm et leurs espaces tiennent.
export const REGLAGES_RANGEES = { parRangee: 10, largeurUtileMm: 1100, ecartMm: 10 };

// Visuel regroupable : un PDF lisible d'une seule page. Sinon rien : il partira seul.
export async function lireVisuel(chemin) {
  try {
    const doc = await PDFDocument.load(fs.readFileSync(chemin), { updateMetadata: false });
    if (doc.getPageCount() !== 1) return null;
    const page = doc.getPage(0);
    const { width, height } = page.getCropBox();
    const couchee = page.getRotation().angle % 180 !== 0;
    // Le réglage rapide tourne la page de 90° : sa hauteur devient sa largeur sur le papier.
    return { doc, largeurMm: (couchee ? width : height) * MM_PAR_POINT };
  } catch {
    return null;
  }
}

// Remplit les rangées dans l'ordre reçu : jamais plus que le nombre prévu par rangée,
// ni plus que la largeur utile du papier.
export function enRangees(transferts, { parRangee, largeurUtileMm, ecartMm }) {
  const rangees = [];
  let courante = null;
  for (const transfert of transferts) {
    const largeur = courante ? courante.largeur + ecartMm + transfert.largeurMm : 0;
    if (!courante || courante.transferts.length >= parRangee || largeur > largeurUtileMm) {
      courante = { transferts: [transfert], largeur: transfert.largeurMm };
      rangees.push(courante);
    } else {
      courante.transferts.push(transfert);
      courante.largeur = largeur;
    }
  }
  return rangees;
}

// Compose une rangée en mémoire : les pages sont recopiées telles quelles.
async function composer(rangee) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  for (const { doc } of rangee.transferts) {
    const [page] = await pdf.copyPages(doc, [0]);
    pdf.addPage(page);
  }
  // Sans flux d'objets : le format le plus classique, lu par tous les logiciels d'impression.
  return pdf.save({ useObjectStreams: false });
}

// « 2026-0162 Rangée 1 sur 5 [EDK142-3f9a1c-R1].pdf »
const nomRangee = (reference, numero, total, reperes) => `${nomPropre(reference)} Rangée ${numero} sur ${total} ${reperes}.pdf`;

// Prépare les fichiers des rangées dans le dossier de travail, sans rien déposer :
// une erreur ici laisse tout le monde partir à l'unité. `premier` : l'envoi qui donne
// son identifiant au marqueur (le lot le rend unique).
export async function composerRangees(transferts, reglages, dossierTravail, premier) {
  const rangees = enRangees(transferts, reglages);
  const fichiers = [];
  try {
    for (const [index, rangee] of rangees.entries()) {
      const numero = index + 1;
      const reperes = marqueur(premier, `R${numero}`);
      const temporaire = path.join(dossierTravail, `rangee-${premier.id}-${numero}.pdf`);
      fs.writeFileSync(temporaire, await composer(rangee));
      fichiers.push({
        temporaire,
        transferts: rangee.transferts,
        nom: nomRangee(premier.commande.reference, numero, rangees.length, reperes),
        marqueur: reperes,
      });
    }
  } catch (err) {
    for (const f of fichiers) fs.rmSync(f.temporaire, { force: true });
    throw err;
  }
  return fichiers;
}

// Dépose une rangée préparée dans le dossier « ×1 » : renvoie l'entrée du journal.
export function deposerRangee(fichier, dossier) {
  mettreEnPlace(fichier.temporaire, dossier, fichier.nom);
  return { nom: fichier.nom, dossier, copies: 1, marqueur: fichier.marqueur, rangee: true };
}
