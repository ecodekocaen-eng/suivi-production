// ─────────────────────────────────────────────────────────────
//  Expéditions d'une commande (/api/commandes/:id/expeditions).
//  Lecture et PDF : rôles de production (l'ESAT imprime ses étiquettes).
//  Création, import, annulation, renvoi sur la Zebra : admins.
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireProduction } from '../middleware/role.middleware.js';
import { exigerCommandeVisible } from '../middleware/visibilite.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as c from '../controllers/expeditions.controller.js';

// Étiquette importée : un PDF en mémoire (taille contrôlée par le service).
const importPdf = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (file.mimetype === 'application/pdf'
    ? cb(null, true)
    : cb(Object.assign(new Error('L’étiquette doit être un PDF.'), { status: 400 }))),
});

const router = Router({ mergeParams: true });
router.use(requireAuth, requireProduction, exigerCommandeVisible);

router.get('/destinataire', requireAdmin, asyncHandler(c.destinataire));
router.post('/chronopost', requireAdmin, asyncHandler(c.creerChronopost));
router.post('/import', requireAdmin, importPdf.single('fichier'), asyncHandler(c.importer));
router.get('/:eid/pdf', asyncHandler(c.pdf));
router.post('/:eid/annuler', requireAdmin, asyncHandler(c.annuler));
router.post('/:eid/reimprimer', requireAdmin, asyncHandler(c.reimprimer));

export default router;
