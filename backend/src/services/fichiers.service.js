// ─────────────────────────────────────────────────────────────
//  Service fichiers : enregistrement, suppression, purge à l'expédition
//  Les fichiers sont sur disque (uploads/commande_<id>/), seules les
//  métadonnées sont en base.
// ─────────────────────────────────────────────────────────────
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { addLog } from './log.service.js';
import { LOG_ACTIONS } from '../constants.js';

export function getOrderDir(commandeId) {
  return path.join(config.uploadDir, `commande_${commandeId}`);
}

export function getAbsolutePath(fichier) {
  return path.join(config.uploadDir, fichier.chemin);
}

// Enregistre en base un fichier déjà écrit sur disque par multer.
// ligneId : rattache le visuel à une ligne précise (optionnel).
export async function recordFichier(commandeId, file, userId, ligneId = null) {
  // Chemin relatif au dossier d'upload (gère le sous-dossier ligne_<id>).
  const chemin = path.relative(config.uploadDir, file.path);
  const fichier = await prisma.fichier.create({
    data: {
      nom: file.originalname,
      nomStockage: file.filename,
      chemin,
      taille: file.size,
      type: file.mimetype,
      commandeId,
      ligneId,
    },
  });
  await addLog({
    action: LOG_ACTIONS.FICHIER_AJOUTE,
    detail: `Ajout du visuel « ${file.originalname} »`,
    userId,
    commandeId,
  });
  return fichier;
}

// Supprime un visuel : disque + base + log.
export async function deleteFichier(fichier, userId) {
  const absPath = getAbsolutePath(fichier);
  try {
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  } catch (err) {
    console.error('Erreur suppression fichier disque :', err.message);
  }
  await prisma.fichier.delete({ where: { id: fichier.id } });
  await addLog({
    action: LOG_ACTIONS.FICHIER_SUPPRIME,
    detail: `Suppression du visuel « ${fichier.nom} »`,
    userId,
    commandeId: fichier.commandeId,
  });
}

// Supprime tous les visuels rattachés à une ligne (disque + base + logs).
// Utilisé quand une ligne est retirée lors de l'édition d'une commande.
export async function deleteFichiersForLigne(ligneId, userId) {
  const files = await prisma.fichier.findMany({ where: { ligneId } });
  for (const f of files) await deleteFichier(f, userId);
  return files.length;
}

// ── Purge automatique à l'expédition ──
// Supprime TOUS les fichiers d'une commande (disque + base), conserve la
// commande, met à jour fichiersSupprimes/At et journalise l'opération.
export async function purgeFichiers(commandeId, userId) {
  const fichiers = await prisma.fichier.findMany({ where: { commandeId } });
  const count = fichiers.length;

  // Suppression physique des fichiers.
  for (const f of fichiers) {
    const absPath = getAbsolutePath(f);
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (err) {
      console.error('Erreur purge fichier disque :', err.message);
    }
  }

  // Suppression du dossier de la commande.
  const dir = getOrderDir(commandeId);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    console.error('Erreur suppression dossier commande :', err.message);
  }

  // Suppression des métadonnées de fichiers (on garde la commande).
  await prisma.fichier.deleteMany({ where: { commandeId } });

  // Marque la commande.
  const now = new Date();
  await prisma.commande.update({
    where: { id: commandeId },
    data: { fichiersSupprimes: true, fichiersSupprimesAt: now },
  });

  // Journalise.
  const dateStr = now.toLocaleString('fr-FR');
  await addLog({
    action: LOG_ACTIONS.FICHIERS_SUPPRIMES,
    detail: count > 0
      ? `${count} fichier(s) supprimé(s) à l'expédition le ${dateStr}`
      : `Passage à Expédiée le ${dateStr} : aucun fichier à supprimer`,
    userId,
    commandeId,
  });

  return count;
}
