// ─────────────────────────────────────────────────────────────
//  Routes des commandes (toutes protégées par authentification)
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireProduction } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/commandes.controller.js';

const router = Router();
router.use(requireAuth, requireProduction);

router.get('/', asyncHandler(c.index));
// Avant /:id pour ne pas être capturé comme un identifiant.
router.get('/next-reference', asyncHandler(c.nextReference));
router.post('/', asyncHandler(c.create));
router.get('/:id', asyncHandler(c.show));
router.patch('/:id', asyncHandler(c.update));
router.patch('/:id/statut', asyncHandler(c.updateStatut));

// Suppression (corbeille) et restauration : ADMIN uniquement.
router.delete('/:id', requireAdmin, asyncHandler(c.remove));
router.post('/:id/restore', requireAdmin, asyncHandler(c.restore));

export default router;
