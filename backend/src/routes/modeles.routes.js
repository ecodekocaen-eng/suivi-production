// ─────────────────────────────────────────────────────────────
//  Routes de la base de données des modèles (ex. mugs Heula).
//  Consultation + commande depuis une demande de prix : production.
//  Import, modification, suppression : ADMIN.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireProduction } from '../middleware/role.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/modeles.controller.js';

const router = Router();
router.use(requireAuth, requireProduction);

router.get('/', asyncHandler(c.index));
router.post('/commande', asyncHandler(c.creerCommande));

router.post('/direct', requireAdmin, asyncHandler(c.televersementDirect));
router.post('/fichiers', requireAdmin, upload.single('fichier'), asyncHandler(c.televersementLocal));
router.post('/', requireAdmin, asyncHandler(c.enregistrer));

router.get('/:id/fichier', asyncHandler(c.fichier));
router.get('/:id/apercu', asyncHandler(c.apercu));
router.patch('/:id', requireAdmin, asyncHandler(c.update));
router.delete('/:id', requireAdmin, asyncHandler(c.remove));

export default router;
