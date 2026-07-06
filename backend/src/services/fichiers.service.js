// ─────────────────────────────────────────────────────────────
//  Service fichiers : enregistrement, suppression, purge à l'expédition.
//  Le stockage physique est délégué à la couche storage (disk ou Blob).
//  La base ne contient que les métadonnées (clé, url, taille…).
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { addLog } from './log.service.js';
import { LOG_ACTIONS, STATUT_EXPEDIEE } from '../constants.js';
import { saveBuffer, deleteByKey, deletePrefix, makeFilename } from '../storage.js';

// Enregistre un fichier (buffer multer) : stockage + métadonnées + log.
// ligneId : rattache le visuel à une ligne précise (optionnel).
// categorie DOCUMENT (bon de commande, rendu 3D…) : stocké sous un préfixe
// séparé (documents/…) pour échapper à la purge des visuels à l'expédition.
export async function recordFichier(commandeId, file, userId, ligneId = null, categorie = 'VISUEL') {
  const filename = makeFilename(file.originalname);
  const subdir = categorie === 'DOCUMENT'
    ? `documents/commande_${commandeId}`
    : (ligneId ? `commande_${commandeId}/ligne_${ligneId}` : `commande_${commandeId}`);
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
      categorie,
      commandeId,
      ligneId,
    },
  });
  await addLog({
    action: LOG_ACTIONS.FICHIER_AJOUTE,
    detail: `Ajout du ${categorie === 'DOCUMENT' ? 'document' : 'visuel'} « ${file.originalname} »`,
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

// Supprime un fichier (visuel ou document) : stockage + base + log.
export async function deleteFichier(fichier, userId) {
  await deleteByKey(fichier.chemin, fichier.url);
  await prisma.fichier.delete({ where: { id: fichier.id } });
  await addLog({
    action: LOG_ACTIONS.FICHIER_SUPPRIME,
    detail: `Suppression du ${fichier.categorie === 'DOCUMENT' ? 'document' : 'visuel'} « ${fichier.nom} »`,
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
// Ne concerne QUE les visuels : les documents (bons de commande, rendus 3D…)
// sont conservés (stockés sous documents/…, hors du préfixe purgé).
export async function purgeFichiers(commandeId, userId) {
  const count = await prisma.fichier.count({ where: { commandeId, categorie: 'VISUEL' } });

  // Supprime tout le préfixe visuels de la commande (toutes ses lignes incluses).
  await deletePrefix(`commande_${commandeId}`);
  await prisma.fichier.deleteMany({ where: { commandeId, categorie: 'VISUEL' } });

  const now = new Date();
  await prisma.commande.update({
    where: { id: commandeId },
    data: { fichiersSupprimes: true, fichiersSupprimesAt: now },
  });

  const dateStr = now.toLocaleString('fr-FR');
  await addLog({
    action: LOG_ACTIONS.FICHIERS_SUPPRIMES,
    detail: count > 0
      ? `${count} visuel(s) supprimé(s) automatiquement le ${dateStr} (rétention ${config.retentionDays} j après expédition) — documents conservés`
      : `Nettoyage le ${dateStr} : aucun visuel à supprimer`,
    userId,
    commandeId,
  });
  return count;
}

// ── Nettoyage périodique : purge les visuels des commandes expédiées
//    depuis plus de RETENTION_DAYS jours (appelé par le cron).
export async function purgeExpiredFichiers() {
  const cutoff = new Date(Date.now() - config.retentionDays * 86400000);
  const commandes = await prisma.commande.findMany({
    where: {
      statut: STATUT_EXPEDIEE,
      fichiersSupprimes: false,
      dateExpedition: { not: null, lte: cutoff },
    },
    select: { id: true },
  });

  let fichiers = 0;
  for (const c of commandes) fichiers += await purgeFichiers(c.id, null);
  return { commandes: commandes.length, fichiers, retentionDays: config.retentionDays };
}
