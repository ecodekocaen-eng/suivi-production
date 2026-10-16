// ─────────────────────────────────────────────────────────────
//  Couche de stockage des fichiers, pilotée par STORAGE_DRIVER :
//   - "disk"  (défaut) : système de fichiers local (dev / VPS)
//   - "blob"           : Vercel Blob (déploiement serverless Vercel)
//  L'API applicative est identique quel que soit le pilote.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config } from './config.js';

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'disk';

// Préfixe optionnel de toutes les clés Blob : isole un environnement d'essai
// (ex. « essais-locaux/ ») du reste du store. Vide en production.
export const BLOB_PREFIX = STORAGE_DRIVER === 'blob' ? (process.env.BLOB_PREFIX || '') : '';

function sanitize(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Nom de fichier « sûr » (sans accents ni caractères spéciaux), extension conservée.
export function nomSur(originalname) {
  const ext = path.extname(originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = sanitize(path.basename(originalname || 'fichier', path.extname(originalname || ''))).slice(0, 80) || 'fichier';
  return `${base}${ext}`;
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
  const key = `${BLOB_PREFIX}${subdir ? `${subdir}/${filename}` : filename}`;
  if (STORAGE_DRIVER === 'blob') {
    const { put } = await import('@vercel/blob');
    // Accès privé : les visuels ne sont pas publics, ils sont servis via l'API authentifiée.
    const res = await put(key, buffer, { access: 'private', contentType, addRandomSuffix: false });
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
      let cursor;
      do {
        const page = await list({ prefix: `${BLOB_PREFIX}${subdir}/`, cursor });
        if (page.blobs.length) await del(page.blobs.map((b) => b.url));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    } catch (e) { console.error('Blob delPrefix:', e.message); }
    return;
  }
  try { const abs = absPath(subdir); if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true }); }
  catch (e) { console.error('Disk delPrefix:', e.message); }
}

// Récupère le contenu d'un fichier en buffer (petits fichiers : miniatures produits).
export async function readBuffer({ key, url }) {
  if (STORAGE_DRIVER === 'blob') {
    const { get } = await import('@vercel/blob');
    // Store privé : on télécharge via le SDK (authentifié), pas par l'URL publique.
    const res = await get(key, { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) throw new Error('Blob introuvable');
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  return fs.promises.readFile(absPath(key));
}

// Ouvre un fichier en flux (aperçu, téléchargement, zip) : rien n'est chargé
// entièrement en mémoire, quelle que soit la taille du fichier.
export async function readStream({ key }) {
  if (STORAGE_DRIVER === 'blob') {
    const { get } = await import('@vercel/blob');
    const res = await get(key, { access: 'private' });
    if (!res || res.statusCode !== 200 || !res.stream) throw new Error('Blob introuvable');
    return Readable.fromWeb(res.stream);
  }
  const abs = absPath(key);
  await fs.promises.access(abs);
  return fs.createReadStream(abs);
}

// Métadonnées réelles d'un blob déjà envoyé (taille, type) — envoi direct.
export async function infosBlob(pathname) {
  const { head } = await import('@vercel/blob');
  return head(pathname);
}

const TYPES_PAR_EXTENSION = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};

// Taille et type réels d'un fichier déjà stocké (contrôle avant de l'inscrire en base).
export async function infosFichier(key) {
  if (STORAGE_DRIVER === 'blob') {
    const infos = await infosBlob(key);
    return { taille: infos.size, type: infos.contentType, url: infos.url };
  }
  const st = await fs.promises.stat(absPath(key));
  return { taille: st.size, type: TYPES_PAR_EXTENSION[path.extname(key).toLowerCase()] || 'application/octet-stream', url: null };
}

// Copie un fichier vers une autre clé (ex. fichier d'un modèle → ligne de commande).
// Clés complètes (préfixe d'essai compris), telles qu'enregistrées en base.
export async function copyKey(fromKey, toKey, contentType) {
  if (STORAGE_DRIVER === 'blob') {
    const { copy } = await import('@vercel/blob');
    const res = await copy(fromKey, toKey, { access: 'private', contentType, addRandomSuffix: false });
    return { key: toKey, url: res.url };
  }
  const dest = absPath(toKey);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await fs.promises.copyFile(absPath(fromKey), dest);
  return { key: toKey, url: null };
}
