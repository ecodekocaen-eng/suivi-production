// ─────────────────────────────────────────────────────────────
//  Une commande faite par ECO'DEKO (atelier ECO'DEKO) n'est visible que des
//  admins : l'ESAT ne doit pas la produire en double. Pour les autres, toute
//  route qui la vise par son identifiant répond « introuvable ».
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { faiteParEcodeko } from '../constants.js';

export async function exigerCommandeVisible(req, res, next) {
  try {
    const id = Number(req.params.id ?? req.params.commandeId);
    if (req.user?.role === 'ADMIN' || !Number.isInteger(id)) return next();
    const commande = await prisma.commande.findUnique({ where: { id }, select: { atelier: true } });
    if (commande && faiteParEcodeko(commande)) return res.status(404).json({ error: 'Commande introuvable.' });
    return next();
  } catch (err) {
    return next(err);
  }
}
