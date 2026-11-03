// ─────────────────────────────────────────────────────────────
//  Routes de l'agent d'impression du PC atelier. Pas de login :
//  jeton dédié IMPRESSION_AGENT_TOKEN (voir agent.middleware.js).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAgent } from '../middleware/agent.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/impressions.controller.js';

const router = Router();
router.use(requireAgent);

// Signe de vie + travaux à déposer dans Edge Print ou à surveiller.
router.post('/impression/synchro', asyncHandler(c.agentSynchro));
router.get('/impression/fichiers/:fichierId', asyncHandler(c.agentFichier));
router.post('/impression/travaux/:id/etat', asyncHandler(c.agentEtat));

export default router;
