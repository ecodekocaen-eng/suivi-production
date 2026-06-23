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

async function loadFichier(req, res, commande) {
  const fichier = await prisma.fichier.findUnique({ where: { id: Number(req.params.fileId) } });
  if (!fichier || fichier.commandeId !== commande.id) {
    res.status(404).json({ error: 'Fichier introuvable.' }); return null;
  }
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

// Aperçu inline (miniatures).
export async function view(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichier = await loadFichier(req, res, commande);
  if (!fichier) return;
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
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichier = await loadFichier(req, res, commande);
  if (!fichier) return;
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

// Téléchargement groupé (.zip).
export async function downloadZip(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichiers = await prisma.fichier.findMany({ where: { commandeId: commande.id } });

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
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichier = await loadFichier(req, res, commande);
  if (!fichier) return;
  await fichiersService.deleteFichier(fichier, req.user.id);
  res.json({ ok: true });
}
