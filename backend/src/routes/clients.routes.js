// ─────────────────────────────────────────────────────────────
//  Routes de gestion des clients (réservées ADMIN)
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireProduction } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listClients, listClientNames, mergeClients, normalizeClients } from '../controllers/clients.controller.js';

const router = Router();

// Suggestions clients : accessible aux rôles de production (avant le filtre admin).
router.get('/names', requireAuth, requireProduction, asyncHandler(listClientNames));

// Le reste est réservé aux administrateurs.
router.use(requireAuth, requireAdmin);

router.get('/', asyncHandler(listClients));
router.post('/merge', asyncHandler(mergeClients));
router.post('/normalize', asyncHandler(normalizeClients));

export default router;
