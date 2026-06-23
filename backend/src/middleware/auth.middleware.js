// ─────────────────────────────────────────────────────────────
//  Middleware d'authentification : vérifie le JWT (cookie httpOnly)
//  et attache l'utilisateur courant à req.user.
// ─────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../prisma.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Non authentifié.' });

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.actif) {
      return res.status(401).json({ error: 'Compte introuvable ou désactivé.' });
    }

    req.user = { id: user.id, email: user.email, nom: user.nom, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}
