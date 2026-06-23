// ─────────────────────────────────────────────────────────────
//  Service fichiers : enregistrement, suppression, purge à l'expédition.
//  Le stockage physique est délégué à la couche storage (disk ou Blob).
//  La base ne contient que les métadonnées (clé, url, taille…).
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { addLog } from './log.service.js';
import { LOG_ACTIONS } from '../constants.js';
import { saveBuffer, deleteByKey, deletePrefix, makeFilename } from '../storage.js';

// Enregistre un fichier (buffer multer) : stockage + métadonnées + log.
// ligneId : rattache le visuel à une ligne précise (optionnel).
export async function recordFichier(commandeId, file, userId, ligneId = null) {
  const filename = makeFilename(file.originalname);
  const subdir = ligneId
    ? `commande_${commandeId}/ligne_${ligneId}`
    : `commande_${commandeId}`;
  const { key, url } = await saveBuffer(file.buffer, {
    subdir, filename, contentType: file.mimetype,
  });

  const fichier = await prisma.fichier.create({
    data: {
      nom: file.originalname,
      nomStockage: filename,
      chemin: key,
      url,
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

export function getAttachments(commandeId) {
  return prisma.fichier.findMany({ where: { commandeId }, orderBy: { createdAt: 'asc' } });
}

export function getAttachment(id) {
  return prisma.fichier.findUnique({ where: { id: Number(id) } });
}

// Supprime un visuel : stockage + base + log.
export async function deleteFichier(fichier, userId) {
  await deleteByKey(fichier.chemin, fichier.url);
  await prisma.fichier.delete({ where: { id: fichier.id } });
  await addLog({
    action: LOG_ACTIONS.FICHIER_SUPPRIME,
    detail: `Suppression du visuel « ${fichier.nom} »`,
    userId,
    commandeId: fichier.commandeId,
  });
}

// Supprime tous les visuels d'une ligne (utilisé quand une ligne est retirée).
export async function deleteFichiersForLigne(ligneId, userId) {
  const files = await prisma.fichier.findMany({ where: { ligneId } });
  for (const f of files) await deleteFichier(f, userId);
  return files.length;
}

// ── Purge automatique à l'expédition ──
export async function purgeFichiers(commandeId, userId) {
  const count = await prisma.fichier.count({ where: { commandeId } });

  // Supprime tout le préfixe de la commande (toutes ses lignes incluses).
  await deletePrefix(`commande_${commandeId}`);
  await prisma.fichier.deleteMany({ where: { commandeId } });

  const now = new Date();
  await prisma.commande.update({
    where: { id: commandeId },
    data: { fichiersSupprimes: true, fichiersSupprimesAt: now },
  });

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
