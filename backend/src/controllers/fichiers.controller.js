// ─────────────────────────────────────────────────────────────
//  Contrôleur des fichiers visuels (upload, aperçu, download, zip, suppression)
//  Le contenu est lu via la couche storage (disk ou Blob) : le frontend
//  passe toujours par ces routes authentifiées (pas d'accès direct).
//
//  Gros fichiers sur Vercel : une requête vers l'API ne peut pas dépasser
//  4,5 Mo. Le navigateur dépose donc les fichiers DIRECTEMENT dans Vercel
//  Blob, via un lien signé que délivre /direct (après contrôle des droits),
//  puis /direct/enregistrer les inscrit en base. Les lectures sont servies
//  en flux (jamais chargées entières en mémoire).
// ─────────────────────────────────────────────────────────────
import archiver from 'archiver';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import * as fichiersService from '../services/fichiers.service.js';
import { readBuffer, readStream, infosBlob, deleteByKey, STORAGE_DRIVER, BLOB_PREFIX } from '../storage.js';
import { STATUT_EXPEDIEE, ALLOWED_MIME_TYPES, DOCUMENT_MIME_TYPES } from '../constants.js';

const TYPES = { VISUEL: ALLOWED_MIME_TYPES, DOCUMENT: DOCUMENT_MIME_TYPES };
// Validité d'un lien d'envoi direct (large : un gros fichier sur une connexion lente).
const VALIDITE_LIEN_MS = 30 * 60 * 1000;
// Jusqu'à cette taille, un fichier est lu d'un bloc (chemin éprouvé) ; au-delà, en flux.
const SEUIL_FLUX = 4 * 1024 * 1024;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function loadCommande(req, res) {
  const commande = await prisma.commande.findUnique({ where: { id: Number(req.params.id) } });
  if (!commande) { res.status(404).json({ error: 'Commande introuvable.' }); return null; }
  return commande;
}

// Charge un fichier en vérifiant l'appartenance à la commande en UNE requête.
async function loadFichierDirect(req, res) {
  const fichier = await prisma.fichier.findFirst({
    where: { id: Number(req.params.fileId), commandeId: Number(req.params.id) },
  });
  if (!fichier) { res.status(404).json({ error: 'Fichier introuvable.' }); return null; }
  return fichier;
}

// Upload de visuels au niveau commande.
export async function upload(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  if (commande.statut === STATUT_EXPEDIEE) {
    return res.status(400).json({ error: 'Commande expédiée : ajout de fichiers impossible.' });
  }
  const created = [];
  for (const file of req.files || []) {
    created.push(await fichiersService.recordFichier(commande.id, file, req.user.id));
  }
  res.status(201).json({ fichiers: created });
}

// Upload de documents (bons de commande, rendus 3D…).
// Autorisé même après expédition : ce sont des pièces administratives,
// conservées (jamais purgées automatiquement).
export async function uploadDocuments(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const created = [];
  for (const file of req.files || []) {
    created.push(await fichiersService.recordFichier(commande.id, file, req.user.id, null, 'DOCUMENT'));
  }
  res.status(201).json({ fichiers: created });
}

// Upload de visuels rattachés à une ligne précise.
export async function uploadLigne(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  if (commande.statut === STATUT_EXPEDIEE) {
    return res.status(400).json({ error: 'Commande expédiée : ajout de fichiers impossible.' });
  }
  const ligne = await prisma.ligneCommande.findUnique({ where: { id: Number(req.params.ligneId) } });
  if (!ligne || ligne.commandeId !== commande.id) {
    return res.status(404).json({ error: 'Ligne introuvable.' });
  }
  const created = [];
  for (const file of req.files || []) {
    created.push(await fichiersService.recordFichier(commande.id, file, req.user.id, ligne.id));
  }
  res.status(201).json({ fichiers: created });
}

// ── Envoi direct navigateur → Vercel Blob ────────────────────

// Commande, ligne, catégorie et dossier de stockage attendus pour un envoi direct.
async function cibleDirecte(req, { ligneId, categorie }) {
  const commande = await prisma.commande.findUnique({ where: { id: Number(req.params.id) } });
  if (!commande) throw httpError(404, 'Commande introuvable.');
  const cat = String(categorie || '').toUpperCase() === 'DOCUMENT' ? 'DOCUMENT' : 'VISUEL';
  if (cat === 'VISUEL' && commande.statut === STATUT_EXPEDIEE) {
    throw httpError(400, 'Commande expédiée : ajout de fichiers impossible.');
  }
  let ligne = null;
  if (cat === 'VISUEL' && ligneId != null && ligneId !== '') {
    ligne = await prisma.ligneCommande.findUnique({ where: { id: Number(ligneId) } });
    if (!ligne || ligne.commandeId !== commande.id) throw httpError(404, 'Ligne introuvable.');
  }
  const prefixe = `${BLOB_PREFIX}${fichiersService.dossierFichiers(commande.id, ligne?.id ?? null, cat)}/`;
  return { commande, ligneId: ligne?.id ?? null, categorie: cat, prefixe };
}

// Le chemin proposé par le navigateur doit rester dans le dossier de la commande :
// <dossier>/<identifiant>/<nom de fichier sûr> — ni remontée, ni sous-dossier en plus.
export function cheminValide(pathname, prefixe) {
  if (typeof pathname !== 'string' || !pathname.startsWith(prefixe) || pathname.length > 300) return false;
  return /^[A-Za-z0-9_-]{6,40}\/[A-Za-z0-9._-]{1,120}$/.test(pathname.slice(prefixe.length))
    && !pathname.includes('..');
}

function exigerBlob() {
  if (STORAGE_DRIVER !== 'blob') throw httpError(400, 'Envoi direct indisponible : stockage local (envoi classique).');
}

// Délivre un lien signé d'envoi (PUT, ou multipart pour les gros fichiers) limité à
// ce chemin, aux types de fichier autorisés et à la taille maximale.
export async function televersementDirect(req, res) {
  exigerBlob();
  if (req.body?.type !== 'blob.generate-presigned-url') throw httpError(400, 'Demande d’envoi invalide.');
  const { handleUploadPresigned } = await import('@vercel/blob/client');
  const { issueSignedToken } = await import('@vercel/blob');

  const resultat = await handleUploadPresigned({
    body: req.body,
    request: req,
    getSignedToken: async (pathname, clientPayload) => {
      let demande = {};
      try { demande = JSON.parse(clientPayload || '{}'); } catch { /* charge utile illisible : valeurs par défaut */ }
      const cible = await cibleDirecte(req, demande);
      if (!cheminValide(pathname, cible.prefixe)) throw httpError(400, 'Chemin de fichier invalide.');
      const contraintes = {
        allowedContentTypes: TYPES[cible.categorie],
        maximumSizeInBytes: config.maxDirectUploadSize,
      };
      const token = await issueSignedToken({
        pathname,
        operations: ['put'],
        validUntil: Date.now() + VALIDITE_LIEN_MS,
        ...contraintes,
      });
      return { token, urlOptions: { ...contraintes, addRandomSuffix: false, allowOverwrite: false } };
    },
  });
  res.json(resultat);
}

// Inscrit en base un fichier que le navigateur vient de déposer dans Blob.
// Taille et type sont relus dans le stockage (on ne se fie pas au navigateur).
export async function enregistrerDirect(req, res) {
  exigerBlob();
  const { pathname, nom, ligneId, categorie } = req.body || {};
  const cible = await cibleDirecte(req, { ligneId, categorie });
  if (!cheminValide(pathname, cible.prefixe)) throw httpError(400, 'Chemin de fichier invalide.');

  let infos;
  try {
    infos = await infosBlob(pathname);
  } catch {
    throw httpError(400, 'Fichier introuvable dans le stockage : l’envoi n’est pas allé au bout.');
  }
  if (!TYPES[cible.categorie].includes(infos.contentType) || infos.size > config.maxDirectUploadSize) {
    await deleteByKey(pathname, infos.url);
    throw httpError(400, `Fichier refusé (${infos.contentType}, ${(infos.size / 1048576).toFixed(1)} Mo).`);
  }

  const fichier = await fichiersService.recordFichierDirect(cible.commande.id, {
    pathname,
    url: infos.url,
    nom: String(nom || pathname.split('/').pop()).slice(0, 200),
    taille: infos.size,
    type: infos.contentType,
  }, req.user.id, cible.ligneId, cible.categorie);
  res.status(201).json({ fichier });
}

// ── Lecture (aperçu, téléchargement, zip) ────────────────────

// Le contenu d'un fichier est immuable (clé de stockage unique, jamais
// remplacé) : on autorise un cache navigateur long et un 304 sans relire le Blob.
const etiquette = (fichier) => `"${fichier.nomStockage || fichier.chemin}"`;
function cacheFichier(res, fichier) {
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('ETag', etiquette(fichier));
}

// En-tête de téléchargement qui garde les accents du nom d'origine.
function contentDisposition(nom) {
  const ascii = (nom || 'fichier').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom || 'fichier')}`;
}

// Sert un fichier : d'un bloc s'il est petit, en flux s'il est gros (rien n'est
// alors chargé entièrement en mémoire, et la réponse peut dépasser 4,5 Mo sur Vercel).
// `fichier` : { chemin, url?, nom, taille, type, nomStockage? } (aussi les fichiers des modèles).
export async function envoyerFichier(req, res, fichier, { telechargement = false } = {}) {
  cacheFichier(res, fichier);
  // Revalidation : si le navigateur a déjà la bonne version, on évite la lecture du stockage.
  if (req.headers['if-none-match'] === etiquette(fichier)) return res.status(304).end();
  if (telechargement) res.setHeader('Content-Disposition', contentDisposition(fichier.nom));
  if (!fichier.taille || fichier.taille <= SEUIL_FLUX) {
    try {
      const buf = await readBuffer({ key: fichier.chemin, url: fichier.url });
      res.type(fichier.type || 'application/octet-stream');
      return res.send(buf);
    } catch {
      res.removeHeader('Content-Disposition');
      return res.status(404).json({ error: 'Fichier indisponible.' });
    }
  }
  let flux;
  try {
    flux = await readStream({ key: fichier.chemin, url: fichier.url });
  } catch {
    res.removeHeader('Content-Disposition');
    return res.status(404).json({ error: 'Fichier indisponible.' });
  }
  res.type(fichier.type || 'application/octet-stream');
  res.setHeader('Content-Length', String(fichier.taille));
  flux.on('error', (e) => { console.error('Lecture fichier :', e.message); res.destroy(e); });
  flux.pipe(res);
}

// Aperçu inline (miniatures).
export async function view(req, res) {
  const fichier = await loadFichierDirect(req, res);
  if (!fichier) return;
  await envoyerFichier(req, res, fichier);
}

// Téléchargement individuel.
export async function download(req, res) {
  const fichier = await loadFichierDirect(req, res);
  if (!fichier) return;
  await envoyerFichier(req, res, fichier, { telechargement: true });
}

// « logo.png », « logo (2).png »… : pas deux fois le même nom dans un zip.
function nomUnique(nom, dejaPris) {
  const point = nom.lastIndexOf('.');
  const [base, ext] = point > 0 ? [nom.slice(0, point), nom.slice(point)] : [nom, ''];
  let candidat = nom;
  for (let i = 2; dejaPris.has(candidat.toLowerCase()); i += 1) candidat = `${base} (${i})${ext}`;
  dejaPris.add(candidat.toLowerCase());
  return candidat;
}

// Téléchargement groupé (.zip) — visuels uniquement (destiné à la production).
// Un fichier à la fois, en flux ; les visuels (JPG, PNG, PDF…) sont déjà
// compressés, on les range tels quels (« store ») : bien plus rapide, même taille.
export async function downloadZip(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichiers = await prisma.fichier.findMany({
    where: { commandeId: commande.id, categorie: 'VISUEL' },
    orderBy: { createdAt: 'asc' },
  });

  res.attachment(`visuels_${commande.reference || commande.id}.zip`);
  const archive = archiver('zip', { store: true });
  archive.on('error', (err) => { console.error('Erreur zip :', err.message); res.destroy(err); });
  archive.pipe(res);
  const noms = new Set();
  for (const f of fichiers) {
    try {
      const nom = nomUnique(f.nom || 'visuel', noms);
      // Petit fichier : lu d'un bloc ; gros fichier : versé en flux dans le zip.
      const contenu = !f.taille || f.taille <= SEUIL_FLUX
        ? await readBuffer({ key: f.chemin, url: f.url })
        : await readStream({ key: f.chemin, url: f.url });
      await new Promise((resolve, reject) => {
        archive.once('entry', resolve);
        if (typeof contenu.once === 'function' && !Buffer.isBuffer(contenu)) contenu.once('error', reject);
        archive.append(contenu, { name: nom });
      });
    } catch (e) {
      console.error('Zip : fichier ignoré', f.nom, e.message);
    }
  }
  await archive.finalize();
}

// Suppression d'un visuel.
export async function remove(req, res) {
  const fichier = await loadFichierDirect(req, res);
  if (!fichier) return;
  await fichiersService.deleteFichier(fichier, req.user.id);
  res.json({ ok: true });
}
