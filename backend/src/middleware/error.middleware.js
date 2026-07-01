// ─────────────────────────────────────────────────────────────
//  Gestion centralisée des erreurs + 404
//  En production, on n'expose jamais les stack traces.
// ─────────────────────────────────────────────────────────────
import { config } from '../config.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Ressource introuvable.' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error('Erreur serveur :', err);

  // Erreurs multer (taille, type de fichier…)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux.' });
  }
  const status = err.status || 500;
  // TEMP DEBUG
  res.status(status).json({ error: err.message, hasBlobToken: !!process.env.BLOB_READ_WRITE_TOKEN });
}
