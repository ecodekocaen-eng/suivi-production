// ─────────────────────────────────────────────────────────────
//  Contrôleur des commandes
// ─────────────────────────────────────────────────────────────
import * as service from '../services/commandes.service.js';
import { getLogsForCommande } from '../services/log.service.js';
import { STATUTS } from '../constants.js';
import { parseFrDate, parseIntSafe, parsePrice, cleanStr } from '../utils/parse.js';

// Construit un objet de données validé à partir du corps de requête.
// partial=true : ne renvoie que les champs présents (pour une mise à jour).
function buildData(body, { partial = false } = {}) {
  const data = {};
  const setIf = (key, value) => {
    if (!partial || body[key] !== undefined) data[key] = value;
  };

  if (!partial || body.reference !== undefined) data.reference = cleanStr(body.reference);
  if (!partial || body.client !== undefined) data.client = cleanStr(body.client) || '';
  if (!partial || body.designation !== undefined) data.designation = cleanStr(body.designation) || '';
  setIf('quantite', parseIntSafe(body.quantite, 0));
  if (body.statut !== undefined && STATUTS.includes(body.statut)) data.statut = body.statut;
  else if (!partial) data.statut = 'En attente';

  if (!partial || body.dateCommande !== undefined) data.dateCommande = body.dateCommande ? new Date(body.dateCommande) : null;
  if (!partial || body.dateLivraison !== undefined) data.dateLivraison = body.dateLivraison ? new Date(body.dateLivraison) : null;
  if (!partial || body.notes !== undefined) data.notes = cleanStr(body.notes);

  // Colonnes métier.
  if (!partial || body.typeMug !== undefined) data.typeMug = cleanStr(body.typeMug);
  if (!partial || body.prixEsat !== undefined) data.prixEsat = parsePrice(body.prixEsat);
  if (!partial || body.prixVente !== undefined) data.prixVente = parsePrice(body.prixVente);
  if (!partial || body.atelier !== undefined) data.atelier = cleanStr(body.atelier);
  setIf('rebut', parseIntSafe(body.rebut, 0));
  if (!partial || body.noteTransport !== undefined) data.noteTransport = cleanStr(body.noteTransport);
  if (!partial || body.aFacturer !== undefined) data.aFacturer = cleanStr(body.aFacturer);
  if (!partial || body.dateSortieTexte !== undefined) data.dateSortieTexte = cleanStr(body.dateSortieTexte);

  return data;
}

// Nettoie le tableau de lignes envoyé par le formulaire.
// Retourne undefined si le champ n'est pas fourni (pour ne pas toucher aux lignes),
// ou un tableau filtré (lignes vides ignorées).
function buildLignes(body) {
  if (body.lignes === undefined) return undefined;
  const arr = Array.isArray(body.lignes) ? body.lignes : [];
  return arr
    .map((l) => ({
      id: l.id ? Number(l.id) : undefined, // conserve l'identité des lignes existantes
      typeMug: cleanStr(l.typeMug),
      visuel: cleanStr(l.visuel),
      quantite: parseIntSafe(l.quantite, 0),
      commentaire: cleanStr(l.commentaire),
      lien: cleanStr(l.lien),
    }))
    // On ignore les lignes totalement vides (et sans id).
    .filter((l) => l.id || l.typeMug || l.visuel || l.quantite || l.commentaire || l.lien);
}

// Le prix de vente (et donc la marge) est réservé aux ADMIN.
function masquerMarge(commande, role) {
  if (!commande || role === 'ADMIN') return commande;
  const { prixVente, ...reste } = commande;
  return reste;
}

export async function index(req, res) {
  const result = await service.listCommandes({
    search: req.query.search,
    statut: req.query.statut,
    livraisonDebut: req.query.livraisonDebut,
    livraisonFin: req.query.livraisonFin,
    page: req.query.page,
    pageSize: req.query.pageSize,
    sortBy: req.query.sortBy,
    sortDir: req.query.sortDir,
    // Seul un ADMIN peut voir la corbeille.
    inclureSupprimees: req.user.role === 'ADMIN' && req.query.inclureSupprimees === 'true',
  });
  const counts = await service.countByStatut();
  result.items = result.items.map((c) => masquerMarge(c, req.user.role));
  res.json({ ...result, counts });
}

export async function show(req, res) {
  const commande = await service.getCommande(req.params.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  const logs = await getLogsForCommande(commande.id);
  res.json({ commande: masquerMarge(commande, req.user.role), logs });
}

// Prochaine référence disponible (pour préremplir le formulaire).
export async function nextReference(req, res) {
  res.json({ reference: await service.nextReference() });
}

export async function create(req, res) {
  const data = buildData(req.body);
  if (req.user.role !== 'ADMIN') delete data.prixVente; // écriture réservée ADMIN
  // La référence est facultative : générée automatiquement si vide.
  try {
    const commande = await service.createCommande(data, req.user.id, buildLignes(req.body));
    // On renvoie la commande complète (avec ses lignes) pour permettre l'upload par ligne.
    res.status(201).json({ commande: masquerMarge(await service.getCommande(commande.id), req.user.role) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette référence existe déjà.' });
    throw err;
  }
}

export async function update(req, res) {
  const data = buildData(req.body, { partial: true });
  if (req.user.role !== 'ADMIN') delete data.prixVente; // écriture réservée ADMIN
  try {
    const commande = await service.updateCommande(req.params.id, data, req.user.id, buildLignes(req.body));
    if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
    res.json({ commande: masquerMarge(commande, req.user.role) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette référence existe déjà.' });
    throw err;
  }
}

// Modification rapide du statut uniquement (action inline du tableau).
export async function updateStatut(req, res) {
  const { statut } = req.body;
  if (!STATUTS.includes(statut)) return res.status(400).json({ error: 'Statut invalide.' });
  const commande = await service.updateCommande(req.params.id, { statut }, req.user.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json({ commande });
}

export async function remove(req, res) {
  const commande = await service.softDeleteCommande(req.params.id, req.user.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json({ ok: true });
}

export async function restore(req, res) {
  const commande = await service.restoreCommande(req.params.id, req.user.id);
  res.json({ commande });
}
