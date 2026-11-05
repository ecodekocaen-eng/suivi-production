// ─────────────────────────────────────────────────────────────
//  Dépôt dans les dossiers surveillés d'Edge Print : découpage de la
//  quantité selon les réglages rapides disponibles (ex. ×10 et ×1),
//  noms de fichiers lisibles avec un marqueur [EDK<envoi>-<lot>-<n>], et dépôt
//  « d'un coup » (Edge Print ne voit jamais un fichier à moitié copié).
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

// Découpe une quantité selon les dossiers disponibles, du plus gros lot au plus petit :
// 12 avec des dossiers ×10 et ×1 → 1 fichier dans ×10 + 2 fichiers dans ×1.
export function decouper(quantite, dossiers) {
  const tries = [...dossiers].sort((a, b) => b.copies - a.copies);
  let reste = quantite;
  const plan = [];
  for (const d of tries) {
    const nombre = Math.floor(reste / d.copies);
    if (nombre > 0) {
      plan.push({ ...d, nombre });
      reste -= nombre * d.copies;
    }
  }
  if (reste !== 0) throw new Error(`Impossible de faire ${quantite} transferts avec les dossiers configurés (il faut un dossier « copies : 1 »).`);
  return plan;
}

// Marqueur du fichier dans Edge Print. Le début du lot le rend unique : un numéro
// d'envoi seul pourrait resservir (essais locaux) et désigner un ancien travail imprimé.
export const marqueur = (travail, numero) => `[EDK${travail.id}-${String(travail.lot).slice(0, 6)}-${numero}]`;

// Caractères interdits dans un nom de fichier Windows.
export const nomPropre = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

// « 2026-0138 104HE-22 Mug Je t'aime x10 [EDK57-3f9a1c-1].pdf » : lisible dans la
// liste d'Edge Print, et le marqueur permet de retrouver le travail dans sa base.
export function nomDepot(travail, copies, numero, extension) {
  const visuel = nomPropre(travail.ligne?.visuel || path.parse(travail.fichierNom || '').name).slice(0, 70);
  return `${nomPropre(travail.commande.reference)} ${visuel} x${copies} ${marqueur(travail, numero)}${extension}`;
}

// Déplacement du dossier de travail vers le dossier surveillé : sur le même disque,
// le fichier y apparaît d'un coup, complet.
export function mettreEnPlace(temporaire, dossier, nom) {
  try {
    fs.renameSync(temporaire, path.join(dossier, nom));
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    // Autre disque : copie directe (le dossier de travail devrait être sur le même disque).
    fs.copyFileSync(temporaire, path.join(dossier, nom));
    fs.rmSync(temporaire, { force: true });
  }
}

// Dépose le fichier téléchargé selon le plan ; renvoie les fichiers déposés.
export function deposer(source, travail, plan, extension, dossierTravail) {
  const deposes = [];
  let numero = 0;
  try {
    for (const lot of plan) {
      for (let i = 0; i < lot.nombre; i += 1) {
        numero += 1;
        const nom = nomDepot(travail, lot.copies, numero, extension);
        const temporaire = path.join(dossierTravail, `depot-${travail.id}-${numero}${extension}`);
        fs.copyFileSync(source, temporaire);
        mettreEnPlace(temporaire, lot.chemin, nom);
        deposes.push({ nom, dossier: lot.chemin, copies: lot.copies, marqueur: marqueur(travail, numero) });
      }
    }
  } catch (err) {
    err.deposes = deposes; // dépôt incomplet : l'appelant garde la trace de ce qui est parti
    throw err;
  }
  return deposes;
}
