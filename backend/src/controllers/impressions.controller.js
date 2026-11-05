// ─────────────────────────────────────────────────────────────
//  Contrôleur de la file d'impression : utilisateurs (envoi, suivi,
//  annulation) et agent du PC atelier (synchro, visuels, états).
// ─────────────────────────────────────────────────────────────
import * as service from '../services/impressions.service.js';
import { envoyerFichier } from './fichiers.controller.js';

// Page « Impression » : à imprimer, derniers envois, état du PC atelier.
export async function index(req, res) {
  res.json(await service.fileImpression());
}

export async function poste(req, res) {
  res.json({ poste: await service.etatPoste() });
}

// { elements: [{ fichierId, quantite, imprimante: 'A' | 'B' }] }, ou une `imprimante` commune à tous.
export async function create(req, res) {
  const impressions = await service.creerEnvoi(req.body, req.user);
  res.status(201).json({ impressions });
}

export async function annuler(req, res) {
  res.json({ impression: await service.annuler(req.params.id, req.user) });
}

export async function relancer(req, res) {
  res.status(201).json({ impression: await service.relancer(req.params.id, req.user) });
}

export async function imprime(req, res) {
  res.json({ impression: await service.marquerImprime(req.params.id, req.user) });
}

// Actions sur toute une commande : renvoient le nombre d'envois concernés.
export async function annulerCommande(req, res) {
  res.json({ envois: await service.annulerCommande(req.params.commandeId, req.user) });
}

export async function relancerCommande(req, res) {
  res.status(201).json({ envois: await service.relancerCommande(req.params.commandeId, req.user) });
}

export async function imprimeCommande(req, res) {
  res.json({ envois: await service.marquerCommandeImprimee(req.params.commandeId, req.user) });
}

// ── Agent d'impression (jeton dédié) ─────────────────────────

// Signe de vie + travaux à déposer ou à surveiller, en un seul appel.
export async function agentSynchro(req, res) {
  await service.battement(req.body);
  res.json({ travaux: await service.travauxPourAgent(), heure: new Date().toISOString() });
}

export async function agentFichier(req, res) {
  const fichier = await service.fichierPourAgent(req.params.fichierId);
  if (!fichier) return res.status(404).json({ error: 'Visuel introuvable ou plus à imprimer.' });
  await envoyerFichier(req, res, fichier, { telechargement: true });
}

// { etat: 'ENVOYE' | 'IMPRIME' | 'ERREUR', message? }
export async function agentEtat(req, res) {
  res.json({ impression: await service.etatParAgent(req.params.id, req.body) });
}
