// ─────────────────────────────────────────────────────────────
//  Application Express (API REST)
// ─────────────────────────────────────────────────────────────
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { config } from './config.js';
import { STORAGE_DRIVER, BLOB_PREFIX } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { STATUTS, STATUT_LABELS, ROLES } from './constants.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { notFound, errorHandler } from './middleware/error.middleware.js';

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import commandesRoutes from './routes/commandes.routes.js';
import fichiersRoutes from './routes/fichiers.routes.js';
import statsRoutes from './routes/stats.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import produitsRoutes from './routes/produits.routes.js';
import reglagesRoutes from './routes/reglages.routes.js';
import facturationRoutes from './routes/facturation.routes.js';
import cronRoutes from './routes/cron.routes.js';
import modelesRoutes from './routes/modeles.routes.js';

export function createApp() {
  const app = express();

  // Derrière un reverse proxy (nginx) : nécessaire pour rate-limit + cookies secure.
  if (config.isProduction) app.set('trust proxy', 1);

  // CORS strict : seule l'origine du frontend est autorisée, avec cookies.
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Vérification de l'état de l'API.
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Métadonnées (statuts, libellés, rôles, envoi de fichiers) pour le frontend.
  app.get('/api/meta', requireAuth, (req, res) => {
    const direct = STORAGE_DRIVER === 'blob';
    res.json({
      statuts: STATUTS, statutLabels: STATUT_LABELS, roles: ROLES,
      envoi: {
        mode: direct ? 'direct' : 'api',
        tailleMax: direct ? config.maxDirectUploadSize : config.maxFileSize,
        prefixe: BLOB_PREFIX,
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/clients', clientsRoutes);
  app.use('/api/produits', produitsRoutes);
  app.use('/api/reglages', reglagesRoutes);
  app.use('/api/facturation', facturationRoutes);
  app.use('/api/cron', cronRoutes);
  // Sous-routes fichiers (déclarées avant pour le préfixe plus spécifique).
  app.use('/api/commandes/:id/fichiers', fichiersRoutes);
  app.use('/api/commandes', commandesRoutes);
  app.use('/api/modeles', modelesRoutes);

  // En production, sert le frontend React compilé (déploiement mono-port).
  // Le build est attendu dans frontend/dist (voir Dockerfile / README).
  const distDir = path.resolve(__dirname, '../../frontend/dist');
  if (config.isProduction && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    // Fallback SPA : toute route non-API renvoie index.html (routage côté client).
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
