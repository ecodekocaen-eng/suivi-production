// ─────────────────────────────────────────────────────────────
//  Contrôleur de la facturation ESAT (rôles ADMIN et COMPTABLE).
//  Ne renvoie jamais le prix de vente (liste blanche dans le service).
// ─────────────────────────────────────────────────────────────
import * as service from '../services/facturation.service.js';
import { cleanStr } from '../utils/parse.js';

export async function aFacturer(req, res) {
  res.json({ commandes: await service.listAFacturer() });
}

export async function createReleve(req, res) {
  const releve = await service.createReleve({
    commandeIds: req.body.commandeIds,
    libelle: cleanStr(req.body.libelle),
  }, req.user.id);
  res.status(201).json({ releve });
}

export async function listReleves(req, res) {
  res.json({ releves: await service.listReleves() });
}

export async function showReleve(req, res) {
  const releve = await service.getReleve(req.params.id);
  if (!releve) return res.status(404).json({ error: 'Relevé introuvable.' });
  res.json({ releve });
}

export async function deleteReleve(req, res) {
  const releve = await service.deleteReleve(req.params.id, req.user.id);
  if (!releve) return res.status(404).json({ error: 'Relevé introuvable.' });
  res.json({ ok: true });
}

export async function exclure(req, res) {
  const count = await service.exclureCommandes(req.body.commandeIds, req.user.id);
  res.json({ count });
}
