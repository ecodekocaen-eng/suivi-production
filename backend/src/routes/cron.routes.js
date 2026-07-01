// ─────────────────────────────────────────────────────────────
//  Route de nettoyage automatique (appelée par le cron Vercel).
//  Supprime les visuels des commandes expédiées depuis > RETENTION_DAYS.
//  Non protégée par login : sécurisée par CRON_SECRET si défini.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { purgeExpiredFichiers } from '../services/fichiers.service.js';

const router = Router();

async function runPurge(req, res) {
  // Vercel Cron ajoute l'en-tête Authorization: Bearer <CRON_SECRET> si la
  // variable CRON_SECRET est définie. On la vérifie quand elle existe.
  const secret = process.env.CRON_SECRET;
  if (secret && req.get('authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  const result = await purgeExpiredFichiers();
  res.json({ ok: true, ...result });
}

router.get('/purge', asyncHandler(runPurge));
router.post('/purge', asyncHandler(runPurge));

export default router;
