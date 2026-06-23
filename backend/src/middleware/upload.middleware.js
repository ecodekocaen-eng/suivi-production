// ─────────────────────────────────────────────────────────────
//  Configuration multer (stockage EN MÉMOIRE).
//  Le fichier est ensuite confié à la couche storage (disk ou Blob).
//  Validation du type MIME côté serveur.
// ─────────────────────────────────────────────────────────────
import multer from 'multer';
import { config } from '../config.js';
import { ALLOWED_MIME_TYPES } from '../constants.js';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(`Type de fichier non autorisé : ${file.mimetype}`);
    err.status = 400;
    cb(err);
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxFileSize },
});

function imageOnlyFilter(req, file, cb) {
  if ((file.mimetype || '').startsWith('image/')) cb(null, true);
  else {
    const err = new Error('Seules les images sont autorisées pour la miniature.');
    err.status = 400;
    cb(err);
  }
}

export const produitUpload = multer({
  storage,
  fileFilter: imageOnlyFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo
});
