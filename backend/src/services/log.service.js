// ─────────────────────────────────────────────────────────────
//  Service de journalisation (table Log)
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';

// Enregistre une action. Ne fait jamais échouer l'opération principale.
export async function addLog({ action, detail = null, userId = null, commandeId = null }) {
  try {
    await prisma.log.create({ data: { action, detail, userId, commandeId } });
  } catch (err) {
    console.error('Échec écriture log :', err.message);
  }
}

// Historique chronologique d'une commande (avec auteur).
export function getLogsForCommande(commandeId) {
  return prisma.log.findMany({
    where: { commandeId },
    include: { user: { select: { nom: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
