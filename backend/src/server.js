// ─────────────────────────────────────────────────────────────
//  Démarrage du serveur HTTP (mode classique : VPS / Docker / local)
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { ensureAdmin } from './bootstrap.js';
import { STORAGE_DRIVER } from './storage.js';

// Le dossier d'upload n'est utile qu'en stockage disque.
if (STORAGE_DRIVER === 'disk') fs.mkdirSync(config.uploadDir, { recursive: true });

await ensureAdmin();

const app = createApp();
app.listen(config.port, () => {
  console.log(`🚀 API suivi de production sur http://localhost:${config.port}`);
  console.log(`   Environnement : ${config.nodeEnv} · stockage : ${STORAGE_DRIVER}`);
});
