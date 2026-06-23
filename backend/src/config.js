// ─────────────────────────────────────────────────────────────
//  Configuration centralisée (variables d'environnement)
// ─────────────────────────────────────────────────────────────
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function resolveFromRoot(p) {
  return path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-non-securise',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // En prod mono-port, l'origine = l'URL de l'app. Render injecte RENDER_EXTERNAL_URL.
  corsOrigin: process.env.CORS_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',

  uploadDir: resolveFromRoot(process.env.UPLOAD_DIR || './uploads'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || String(10 * 1024 * 1024), 10),

  secureCookie: process.env.SECURE_COOKIE === 'true',
};
