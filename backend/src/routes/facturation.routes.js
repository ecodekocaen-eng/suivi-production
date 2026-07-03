// ─────────────────────────────────────────────────────────────
//  Routes de la facturation ESAT — réservées aux rôles ADMIN et
//  COMPTABLE (le compte dédié de la comptable de l'ESAT).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as f from '../controllers/facturation.controller.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'COMPTABLE'));

router.get('/commandes', asyncHandler(f.aFacturer));
router.post('/exclure', asyncHandler(f.exclure));
router.get('/releves', asyncHandler(f.listReleves));
router.post('/releves', asyncHandler(f.createReleve));
router.get('/releves/:id', asyncHandler(f.showReleve));
router.delete('/releves/:id', asyncHandler(f.deleteReleve));

export default router;
