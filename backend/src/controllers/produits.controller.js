// ─────────────────────────────────────────────────────────────
//  Contrôleur du catalogue de produits (types de mug).
//  Lecture : tout utilisateur authentifié. Écriture : ADMIN.
//  Miniature stockée via la couche storage (disk ou Blob).
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { parsePrice, cleanStr } from '../utils/parse.js';
import { saveBuffer, deleteByKey, readBuffer, makeFilename } from '../storage.js';

export async function listProduits(req, res) {
  const produits = await prisma.produit.findMany({ orderBy: { nom: 'asc' } });
  res.json({ produits });
}

async function storeImage(file) {
  const filename = makeFilename(file.originalname);
  return saveBuffer(file.buffer, { subdir: 'produits', filename, contentType: file.mimetype });
}

export async function createProduit(req, res) {
  const nom = cleanStr(req.body.nom);
  if (!nom) return res.status(400).json({ error: 'Le nom du produit est obligatoire.' });

  const exists = await prisma.produit.findUnique({ where: { nom } });
  if (exists) return res.status(409).json({ error: 'Un produit porte déjà ce nom.' });

  let image = null; let imageUrl = null;
  if (req.file) { const r = await storeImage(req.file); image = r.key; imageUrl = r.url; }

  const produit = await prisma.produit.create({
    data: {
      nom,
      prixAchat: parsePrice(req.body.prixAchat),
      image,
      imageUrl,
      // false = accessoire (étiquette…) non compté dans la quantité de mugs.
      compteMugs: req.body.compteMugs === undefined
        ? true
        : req.body.compteMugs === 'true' || req.body.compteMugs === true,
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
  if (req.body.compteMugs !== undefined) data.compteMugs = req.body.compteMugs === 'true' || req.body.compteMugs === true;

  if (req.file) {
    const r = await storeImage(req.file);
    data.image = r.key; data.imageUrl = r.url;
    if (existing.image) await deleteByKey(existing.image, existing.imageUrl);
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
  if (existing.image) await deleteByKey(existing.image, existing.imageUrl);
  await prisma.produit.delete({ where: { id } });
  res.json({ ok: true });
}

// Sert la miniature d'un produit.
export async function produitImage(req, res) {
  const produit = await prisma.produit.findUnique({ where: { id: Number(req.params.id) } });
  if (!produit || !produit.image) return res.status(404).json({ error: 'Image introuvable.' });
  try {
    const buf = await readBuffer({ key: produit.image, url: produit.imageUrl });
    res.type('image/*');
    res.send(buf);
  } catch {
    res.status(404).json({ error: 'Image indisponible.' });
  }
}
