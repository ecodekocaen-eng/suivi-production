// ─────────────────────────────────────────────────────────────
//  Lecture SEULE de la base d'Edge Print, sur une copie : Edge Print n'est
//  jamais bloqué ni modifié. Retrouve les travaux déposés par l'agent grâce
//  au marqueur [EDK…] de leur nom de fichier, et dit s'ils sont imprimés,
//  seuls ou au sein d'une imbrication (« Nesting Job »).
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function lireTravauxAgent(cheminDb, dossierTravail) {
  const copie = path.join(dossierTravail, 'edgeprint-copie.db');
  // Lecture Node (fichier partagé) plutôt que copie Windows : Edge Print n'est jamais gêné.
  fs.writeFileSync(copie, fs.readFileSync(cheminDb));
  const db = new DatabaseSync(copie, { readOnly: true });
  try {
    return db.prepare(`
      SELECT j.JobID AS id, j.OriginalFileName AS fichier, j.ParentJobID AS parent,
             COALESCE(l.PrintTimes, 0) AS impressions, l.FinishPrintTime AS fin,
             COALESCE(lp.PrintTimes, 0) AS impressionsParent, lp.FinishPrintTime AS finParent
      FROM Job j
      LEFT JOIN Log l ON l.JobID = j.JobID
      LEFT JOIN Log lp ON lp.JobID = j.ParentJobID AND j.ParentJobID > 0
      WHERE instr(j.OriginalFileName, '[EDK') > 0`).all();
  } finally {
    db.close();
  }
}

// Imprimé seul, ou dans son imbrication.
export const estImprime = (travail) => travail.impressions > 0 || travail.impressionsParent > 0;

// Heure de fin d'impression (texte d'Edge Print, ex. « 03/11/2026 15:07:11 »).
export const finImpression = (travail) => (travail.impressions > 0 ? travail.fin : travail.finParent) || null;
