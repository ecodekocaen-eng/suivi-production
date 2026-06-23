// ─────────────────────────────────────────────────────────────
//  Point d'entrée serverless Vercel : expose l'API Express.
//  Le frontend (frontend/dist) est servi en statique par Vercel ;
//  cette fonction ne gère que /api/* (voir vercel.json).
// ─────────────────────────────────────────────────────────────
import { createApp } from '../backend/src/app.js';
import { ensureAdmin } from '../backend/src/bootstrap.js';

await ensureAdmin();

const app = createApp();
export default app;
