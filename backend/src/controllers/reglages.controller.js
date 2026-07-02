// ─────────────────────────────────────────────────────────────
//  Contrôleur des réglages de production par visuel.
//  Lecture + écriture : tout utilisateur authentifié.
// ─────────────────────────────────────────────────────────────
import * as service from '../services/reglages.service.js';
import { parseIntSafe, cleanStr } from '../utils/parse.js';

export async function index(req, res) {
  const [reglages, usage] = await Promise.all([
    service.listReglages(req.query.search),
    service.usageByVisuel(),
  ]);
  res.json({ reglages: reglages.map((r) => ({ ...r, derniere: usage.get(r.cle) || null })) });
}

export async function upsert(req, res) {
  if (!cleanStr(req.body.visuel)) return res.status(400).json({ error: 'Le visuel est requis.' });
  const reglage = await service.upsertReglage({
    visuel: req.body.visuel,
    temperature: parseIntSafe(req.body.temperature, null),
    tempsSecondes: parseIntSafe(req.body.tempsSecondes, null),
    note: cleanStr(req.body.note),
  }, req.user.id);
  res.json({ reglage });
}

export async function remove(req, res) {
  const r = await service.deleteReglage(req.params.id, req.user.id);
  if (!r) return res.status(404).json({ error: 'Réglage introuvable.' });
  res.json({ ok: true });
}
