// ─────────────────────────────────────────────────────────────
//  Couche de stockage des fichiers, pilotée par STORAGE_DRIVER :
//   - "disk"  (défaut) : système de fichiers local (dev / VPS)
//   - "blob"           : Vercel Blob (déploiement serverless Vercel)
//  L'API applicative est identique quel que soit le pilote.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'disk';

function sanitize(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Génère un nom de fichier unique à partir du nom d'origine.
export function makeFilename(originalname) {
  const ext = path.extname(originalname || '');
  const base = sanitize(path.basename(originalname || 'fichier', ext)).slice(0, 80);
  return `${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
}

// Chemin absolu sur disque (pilote "disk" uniquement).
export function absPath(key) {
  return path.join(config.uploadDir, key);
}

// Sauvegarde un buffer. Retourne { key, url } :
//   - key : identifiant de stockage (chemin relatif disque OU pathname Blob)
//   - url : URL publique (Blob) ou null (disk → servi via route authentifiée)
export async function saveBuffer(buffer, { subdir, filename, contentType }) {
  const key = subdir ? `${subdir}/${filename}` : filename;
  if (STORAGE_DRIVER === 'blob') {
    const { put } = await import('@vercel/blob');
    const res = await put(key, buffer, { access: 'public', contentType, addRandomSuffix: false });
    return { key, url: res.url };
  }
  const abs = absPath(key);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return { key, url: null };
}

// Supprime un fichier (par sa clé, et son url pour Blob).
export async function deleteByKey(key, url = null) {
  if (STORAGE_DRIVER === 'blob') {
    try { const { del } = await import('@vercel/blob'); await del(url || key); }
    catch (e) { console.error('Blob del:', e.message); }
    return;
  }
  try { const abs = absPath(key); if (fs.existsSync(abs)) fs.unlinkSync(abs); }
  catch (e) { console.error('Disk del:', e.message); }
}

// Supprime tout un préfixe / dossier (ex : "commande_12" → toutes ses lignes).
export async function deletePrefix(subdir) {
  if (STORAGE_DRIVER === 'blob') {
    try {
      const { list, del } = await import('@vercel/blob');
      const { blobs } = await list({ prefix: `${subdir}/` });
      if (blobs.length) await del(blobs.map((b) => b.url));
    } catch (e) { console.error('Blob delPrefix:', e.message); }
    return;
  }
  try { const abs = absPath(subdir); if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true }); }
  catch (e) { console.error('Disk delPrefix:', e.message); }
}

// Récupère le contenu d'un fichier en buffer (pour le zip).
export async function readBuffer({ key, url }) {
  if (STORAGE_DRIVER === 'blob') {
    const res = await fetch(url || key);
    if (!res.ok) throw new Error(`Lecture Blob échouée (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.promises.readFile(absPath(key));
}
