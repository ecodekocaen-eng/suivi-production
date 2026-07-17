// ─────────────────────────────────────────────────────────────
//  Contrôleur des fichiers visuels (upload, aperçu, download, zip, suppression)
//  Le contenu est lu via la couche storage (disk ou Blob) : le frontend
//  passe toujours par ces routes authentifiées (pas d'accès direct).
// ─────────────────────────────────────────────────────────────
import archiver from 'archiver';
import { prisma } from '../prisma.js';
import * as fichiersService from '../services/fichiers.service.js';
import { readBuffer } from '../storage.js';
import { STATUT_EXPEDIEE } from '../constants.js';

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

// Le contenu d'un fichier est immuable (clé de stockage unique, jamais
// remplacé) : on autorise un cache navigateur long et un 304 sans relire le Blob.
function cacheFichier(res, fichier) {
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('ETag', `"${fichier.nomStockage}"`);
}

// Aperçu inline (miniatures).
export async function view(req, res) {
  const fichier = await loadFichierDirect(req, res);
  if (!fichier) return;
  cacheFichier(res, fichier);
  // Revalidation : si le navigateur a déjà la bonne version, on évite la lecture du Blob.
  if (req.headers['if-none-match'] === `"${fichier.nomStockage}"`) return res.status(304).end();
  try {
    const buf = await readBuffer({ key: fichier.chemin, url: fichier.url });
    res.type(fichier.type || 'application/octet-stream');
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'Fichier indisponible.' });
  }
}

// Téléchargement individuel.
export async function download(req, res) {
  const fichier = await loadFichierDirect(req, res);
  if (!fichier) return;
  cacheFichier(res, fichier);
  if (req.headers['if-none-match'] === `"${fichier.nomStockage}"`) return res.status(304).end();
  try {
    const buf = await readBuffer({ key: fichier.chemin, url: fichier.url });
    const safe = (fichier.nom || 'fichier').replace(/"/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.type(fichier.type || 'application/octet-stream');
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'Fichier indisponible.' });
  }
}

// Téléchargement groupé (.zip) — visuels uniquement (destiné à la production).
export async function downloadZip(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichiers = await prisma.fichier.findMany({
    where: { commandeId: commande.id, categorie: 'VISUEL' },
  });

  res.attachment(`commande_${commande.id}_visuels.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { console.error('Erreur zip :', err.message); res.status(500).end(); });
  archive.pipe(res);
  for (const f of fichiers) {
    try {
      const buf = await readBuffer({ key: f.chemin, url: f.url });
      archive.append(buf, { name: f.nom });
    } catch (e) {
      console.error('Zip: fichier ignoré', f.nom, e.message);
    }
  }
  archive.finalize();
}

// Suppression d'un visuel.
export async function remove(req, res) {
  const fichier = await loadFichierDirect(req, res);
  if (!fichier) return;
  await fichiersService.deleteFichier(fichier, req.user.id);
  res.json({ ok: true });
}
