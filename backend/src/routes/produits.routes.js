// ─────────────────────────────────────────────────────────────
//  Routes du catalogue produits.
//  Lecture : authentifié. Écriture : ADMIN.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireProduction } from '../middleware/role.middleware.js';
import { produitUpload } from '../middleware/upload.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as p from '../controllers/produits.controller.js';

const router = Router();
router.use(requireAuth, requireProduction);

router.get('/', asyncHandler(p.listProduits));
router.get('/:id/image', asyncHandler(p.produitImage));

// Gestion réservée aux administrateurs.
router.post('/', requireAdmin, produitUpload.single('image'), asyncHandler(p.createProduit));
router.patch('/:id', requireAdmin, produitUpload.single('image'), asyncHandler(p.updateProduit));
router.delete('/:id', requireAdmin, asyncHandler(p.deleteProduit));

export default router;
