// ─────────────────────────────────────────────────────────────
//  File de la Zebra (/api/print-jobs) pour l'agent du PC atelier (ObjetliaPrintAgent),
//  même contrat que l'atelier Objetlia et Transfert Club : GET / → [{ id, orderId, parcelId }],
//  GET /:id/pdf, POST /:id/done, POST /:id/error { detail }. Pas de session : clé de l'agent
//  dans l'en-tête « x-agent-jeton » (créée dans Administration › Chronopost).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cleAgentValide } from '../services/chronopost/reglages.js';
import * as c from '../controllers/expeditions.controller.js';

const router = Router();
router.use(asyncHandler(async (req, res, next) => {
  if (!(await cleAgentValide(req.get('x-agent-jeton')))) return res.status(401).json({ error: 'Clé d’agent refusée ou absente.' });
  return next();
}));

router.get('/', asyncHandler(c.agentTravaux));
router.get('/:id/pdf', asyncHandler(c.agentPdf));
router.post('/:id/done', asyncHandler(c.agentFait));
router.post('/:id/error', asyncHandler(c.agentErreur));

export default router;
