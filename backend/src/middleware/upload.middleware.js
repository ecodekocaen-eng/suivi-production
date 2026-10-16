// ─────────────────────────────────────────────────────────────
//  Configuration multer (stockage EN MÉMOIRE).
//  Le fichier est ensuite confié à la couche storage (disk ou Blob).
//  Validation du type MIME côté serveur.
// ─────────────────────────────────────────────────────────────
import multer from 'multer';
import { config } from '../config.js';
import { ALLOWED_MIME_TYPES, DOCUMENT_MIME_TYPES } from '../constants.js';

const storage = multer.memoryStorage();
// Les navigateurs envoient le nom des fichiers en UTF-8 : sans cette option,
// « Visuel été.png » arrivait en « Visuel Ã©tÃ©.png ».
const defParamCharset = 'utf8';

const mimeFilter = (types) => (req, file, cb) => {
  if (types.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(`Type de fichier non autorisé : ${file.mimetype}`);
    err.status = 400;
    cb(err);
  }
};

export const upload = multer({
  storage,
  defParamCharset,
  fileFilter: mimeFilter(ALLOWED_MIME_TYPES),
  limits: { fileSize: config.maxFileSize },
});

// Documents (bons de commande, rendus 3D…) : types élargis (Word/Excel/CSV).
export const docUpload = multer({
  storage,
  defParamCharset,
  fileFilter: mimeFilter(DOCUMENT_MIME_TYPES),
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
  defParamCharset,
  fileFilter: imageOnlyFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo
});
