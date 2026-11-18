// ─────────────────────────────────────────────────────────────
//  Réglages Chronopost (/api/chronopost) : admins seulement.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireProduction } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/expeditions.controller.js';

const router = Router();
// Liste des expéditeurs (noms et villes) pour le formulaire de commande : rôles de production.
router.get('/expediteurs', requireAuth, requireProduction, asyncHandler(c.expediteurs));
router.use(requireAuth, requireAdmin);

router.get('/', asyncHandler(c.lireReglages));
router.put('/', asyncHandler(c.enregistrerReglages));
router.post('/tester', asyncHandler(c.tester));
router.post('/cle-agent', asyncHandler(c.cleAgent));

export default router;
