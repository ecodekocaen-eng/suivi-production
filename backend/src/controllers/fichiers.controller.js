// ─────────────────────────────────────────────────────────────
//  Contrôleur des fichiers visuels (upload, download, zip, suppression)
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import archiver from 'archiver';
import { prisma } from '../prisma.js';
import * as fichiersService from '../services/fichiers.service.js';
import { STATUT_EXPEDIEE } from '../constants.js';

// Charge la commande ciblée (et vérifie son existence).
async function loadCommande(req, res) {
  const commande = await prisma.commande.findUnique({ where: { id: Number(req.params.id) } });
  if (!commande) {
    res.status(404).json({ error: 'Commande introuvable.' });
    return null;
  }
  return commande;
}

// Upload d'un ou plusieurs visuels (multer a déjà écrit sur disque).
export async function upload(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;

  // Interdit l'upload sur une commande expédiée.
  if (commande.statut === STATUT_EXPEDIEE) {
    return res.status(400).json({ error: 'Commande expédiée : ajout de fichiers impossible.' });
  }

  const files = req.files || [];
  const created = [];
  for (const file of files) {
    created.push(await fichiersService.recordFichier(commande.id, file, req.user.id));
  }
  res.status(201).json({ fichiers: created });
}

// Upload de visuels rattachés à une ligne précise de la commande.
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

  const files = req.files || [];
  const created = [];
  for (const file of files) {
    created.push(await fichiersService.recordFichier(commande.id, file, req.user.id, ligne.id));
  }
  res.status(201).json({ fichiers: created });
}

// Charge un fichier appartenant bien à la commande.
async function loadFichier(req, res, commande) {
  const fichier = await prisma.fichier.findUnique({ where: { id: Number(req.params.fileId) } });
  if (!fichier || fichier.commandeId !== commande.id) {
    res.status(404).json({ error: 'Fichier introuvable.' });
    return null;
  }
  return fichier;
}

// Aperçu inline (miniatures).
export async function view(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichier = await loadFichier(req, res, commande);
  if (!fichier) return;

  const absPath = fichiersService.getAbsolutePath(fichier);
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Fichier absent du disque.' });
  res.type(fichier.type || 'application/octet-stream');
  res.sendFile(absPath);
}

// Téléchargement individuel.
export async function download(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;
  const fichier = await loadFichier(req, res, commande);
  if (!fichier) return;

  const absPath = fichiersService.getAbsolutePath(fichier);
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Fichier absent du disque.' });
  res.download(absPath, fichier.nom);
}

// Téléchargement groupé (.zip).
export async function downloadZip(req, res) {
  const commande = await loadCommande(req, res);
  if (!commande) return;

  const fichiers = await prisma.fichier.findMany({ where: { commandeId: commande.id } });
  res.attachment(`commande_${commande.id}_visuels.zip`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Erreur zip :', err.message);
    res.status(500).end();
  });
  archive.pipe(res);
  for (const f of fichiers) {
    const absPath = fichiersService.getAbsolutePath(f);
    if (fs.existsSync(absPath)) archive.file(absPath, { name: f.nom });
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
