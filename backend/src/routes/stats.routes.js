// ─────────────────────────────────────────────────────────────
//  Route des statistiques (protégée par authentification)
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireProduction } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { stats } from '../controllers/stats.controller.js';

const router = Router();
router.get('/', requireAuth, requireProduction, asyncHandler(stats));

export default router;
