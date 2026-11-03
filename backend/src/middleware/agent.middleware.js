// ─────────────────────────────────────────────────────────────
//  Authentification de l'agent d'impression (PC atelier) : jeton dédié
//  IMPRESSION_AGENT_TOKEN, envoyé en « Authorization: Bearer … ».
//  Sans jeton configuré (ou trop court), les routes de l'agent restent fermées.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

const LONGUEUR_MIN = 32;

// Empreintes de même longueur : comparaison en temps constant, quel que soit le jeton reçu.
const empreinte = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function requireAgent(req, res, next) {
  const attendu = process.env.IMPRESSION_AGENT_TOKEN || '';
  if (attendu.length < LONGUEUR_MIN) {
    return res.status(503).json({ error: 'Agent d’impression non configuré sur le serveur.' });
  }
  const recu = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!recu || !crypto.timingSafeEqual(empreinte(recu), empreinte(attendu))) {
    return res.status(401).json({ error: 'Jeton d’agent invalide.' });
  }
  next();
}
