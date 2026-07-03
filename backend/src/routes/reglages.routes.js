// ─────────────────────────────────────────────────────────────
//  Routes des réglages de production (température / temps par visuel).
//  Lecture + écriture : tout utilisateur authentifié (petite équipe).
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireProduction } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as r from '../controllers/reglages.controller.js';

const router = Router();
router.use(requireAuth, requireProduction);

router.get('/', asyncHandler(r.index));
router.post('/', asyncHandler(r.upsert));
router.delete('/:id', asyncHandler(r.remove));

export default router;
