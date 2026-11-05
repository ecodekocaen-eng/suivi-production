// ─────────────────────────────────────────────────────────────
//  Routes de la file d'impression (rôles de production)
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireProduction } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/impressions.controller.js';

const router = Router();
router.use(requireAuth, requireProduction);

router.get('/', asyncHandler(c.index));
router.get('/poste', asyncHandler(c.poste));
router.post('/', asyncHandler(c.create));
router.post('/:id/annuler', asyncHandler(c.annuler));
router.post('/:id/relancer', asyncHandler(c.relancer));
router.post('/:id/imprime', asyncHandler(c.imprime));
router.post('/commandes/:commandeId/annuler', asyncHandler(c.annulerCommande));
router.post('/commandes/:commandeId/relancer', asyncHandler(c.relancerCommande));
router.post('/commandes/:commandeId/imprime', asyncHandler(c.imprimeCommande));

export default router;
