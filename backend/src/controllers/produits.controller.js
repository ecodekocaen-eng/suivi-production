// ─────────────────────────────────────────────────────────────
//  Contrôleur du catalogue de produits (types de mug).
//  Lecture : tout utilisateur authentifié (pour le sélecteur de lignes).
//  Écriture : ADMIN uniquement (voir routes).
// ─────────────────────────────────────────────────────────────
import path from 'node:path';
import fs from 'node:fs';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { parsePrice, cleanStr } from '../utils/parse.js';

const imageDir = path.join(config.uploadDir, 'produits');

export async function listProduits(req, res) {
  const produits = await prisma.produit.findMany({ orderBy: { nom: 'asc' } });
  res.json({ produits });
}

export async function createProduit(req, res) {
  const nom = cleanStr(req.body.nom);
  if (!nom) {
    if (req.file) fs.unlinkSync(path.join(imageDir, req.file.filename));
    return res.status(400).json({ error: 'Le nom du produit est obligatoire.' });
  }
  const exists = await prisma.produit.findUnique({ where: { nom } });
  if (exists) {
    if (req.file) fs.unlinkSync(path.join(imageDir, req.file.filename));
    return res.status(409).json({ error: 'Un produit porte déjà ce nom.' });
  }
  const produit = await prisma.produit.create({
    data: {
      nom,
      prixAchat: parsePrice(req.body.prixAchat),
      image: req.file ? req.file.filename : null,
    },
  });
  res.status(201).json({ produit });
}

export async function updateProduit(req, res) {
  const id = Number(req.params.id);
  const existing = await prisma.produit.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Produit introuvable.' });

  const data = {};
  if (req.body.nom !== undefined) data.nom = cleanStr(req.body.nom) || existing.nom;
  if (req.body.prixAchat !== undefined) data.prixAchat = parsePrice(req.body.prixAchat);
  if (req.body.actif !== undefined) data.actif = req.body.actif === 'true' || req.body.actif === true;

  // Nouvelle image : on remplace et on supprime l'ancienne.
  if (req.file) {
    data.image = req.file.filename;
    if (existing.image) {
      try { fs.unlinkSync(path.join(imageDir, existing.image)); } catch { /* ignore */ }
    }
  }

  try {
    const produit = await prisma.produit.update({ where: { id }, data });
    res.json({ produit });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Un produit porte déjà ce nom.' });
    throw err;
  }
}

export async function deleteProduit(req, res) {
  const id = Number(req.params.id);
  const existing = await prisma.produit.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Produit introuvable.' });
  if (existing.image) {
    try { fs.unlinkSync(path.join(imageDir, existing.image)); } catch { /* ignore */ }
  }
  await prisma.produit.delete({ where: { id } });
  res.json({ ok: true });
}

// Sert la miniature d'un produit.
export async function produitImage(req, res) {
  const produit = await prisma.produit.findUnique({ where: { id: Number(req.params.id) } });
  if (!produit || !produit.image) return res.status(404).json({ error: 'Image introuvable.' });
  const abs = path.join(imageDir, produit.image);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Image absente du disque.' });
  res.sendFile(abs);
}
