// ─────────────────────────────────────────────────────────────
//  Routes des fichiers visuels (toutes protégées par authentification)
//  Montées sous /api/commandes/:id/fichiers
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireProduction } from '../middleware/role.middleware.js';
import { upload as uploadMw, docUpload } from '../middleware/upload.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as f from '../controllers/fichiers.controller.js';

// mergeParams: true → accès à :id de la commande parente.
const router = Router({ mergeParams: true });
router.use(requireAuth, requireProduction);

router.post('/', uploadMw.array('files', 20), asyncHandler(f.upload));
// Documents (bons de commande, rendus 3D…) : types élargis, jamais purgés.
router.post('/documents', docUpload.array('files', 20), asyncHandler(f.uploadDocuments));
// Upload ciblant une ligne : /api/commandes/:id/fichiers/ligne/:ligneId
router.post('/ligne/:ligneId', uploadMw.array('files', 20), asyncHandler(f.uploadLigne));
router.get('/zip', asyncHandler(f.downloadZip));
router.get('/:fileId/view', asyncHandler(f.view));
router.get('/:fileId/download', asyncHandler(f.download));
router.delete('/:fileId', asyncHandler(f.remove));

export default router;
