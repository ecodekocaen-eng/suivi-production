// ─────────────────────────────────────────────────────────────
//  Configuration multer : upload des visuels dans uploads/commande_<id>/
//  Validation du type MIME côté serveur (pas seulement l'extension).
// ─────────────────────────────────────────────────────────────
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { config } from '../config.js';
import { ALLOWED_MIME_TYPES } from '../constants.js';

function sanitizeName(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      // commande_<id>/ et, si l'upload cible une ligne, sous-dossier ligne_<id>/
      const parts = [config.uploadDir, `commande_${req.params.id}`];
      if (req.params.ligneId) parts.push(`ligne_${req.params.ligneId}`);
      const dir = path.join(...parts);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = sanitizeName(path.basename(file.originalname, ext)).slice(0, 80);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${base}-${unique}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(`Type de fichier non autorisé : ${file.mimetype}`);
    err.status = 400; // pour que le gestionnaire d'erreurs réponde 400 et non 500
    cb(err);
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxFileSize },
});

// ── Upload d'image de produit (miniature) → uploads/produits/ ──
const produitStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const dir = path.join(config.uploadDir, 'produits');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = sanitizeName(path.basename(file.originalname, ext)).slice(0, 60);
    cb(null, `${base}-${Date.now()}${ext}`);
  },
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
  storage: produitStorage,
  fileFilter: imageOnlyFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo
});
