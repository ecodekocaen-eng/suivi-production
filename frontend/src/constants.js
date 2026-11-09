// ─────────────────────────────────────────────────────────────
//  Constantes UI (statuts, libellés, couleurs) — alignées sur le backend.
// ─────────────────────────────────────────────────────────────
// Statuts fidèles à la Google Sheet (valeur = libellé).
export const STATUTS = [
  'En attente',
  'Impression OK',
  'En cours de prod',
  'Terminé',
  'Expédié',
];

export const STATUT_LABELS = {
  'En attente': 'En attente',
  'Impression OK': 'Impression OK',
  'En cours de prod': 'En cours de prod',
  'Terminé': 'Terminé',
  'Expédié': 'Expédié',
};

// Statuts affichés par défaut sur le tableau (les commandes « en cours »).
export const STATUTS_EN_COURS = ['En attente', 'Impression OK', 'En cours de prod'];

// Production moyenne de l'ESAT, en mugs par jour ouvré (lundi-vendredi).
// Sert au plan de charge du tableau de suivi (src/charge.js).
export const CAPACITE_JOUR = 800;

// Types de mug courants (suggestions pour l'autocomplétion des lignes).
export const TYPES_MUG = [
  'MUG BLANC',
  'MUG BLANC AVEC BOITE',
  'MUG BLANC MAT',
  'MUG BICOLORE',
  'MUG ELECTRO',
  'MUG PAILLETTE',
  'MUG AVEC INSERT BLANC',
];

// Ateliers courants (suggestions du champ « Atelier »).
// Commande faite par ECO'DEKO (en boutique) et non par l'ESAT : son atelier vaut
// ECO'DEKO, sans prix ESAT, hors facturation et hors charge de l'ESAT.
// ⚠️ Même règle dans backend/src/constants.js.
export const ATELIER_ECODEKO = "ECO'DEKO";
export const faiteParEcodeko = (commande) => String(commande?.atelier ?? '').toUpperCase().replace(/[^A-Z]/g, '') === 'ECODEKO';

export const ATELIERS = ['LETTRAGE', 'CONDITIONNEMENT', ATELIER_ECODEKO];

// Classe CSS associée à chaque statut (couleurs définies dans styles.css).
export const STATUT_CLASS = {
  'En attente': 'st-attente',
  'Impression OK': 'st-impression',
  'En cours de prod': 'st-production',
  'Terminé': 'st-termine',
  'Expédié': 'st-expedie',
};

// Couleurs « pleines » des statuts (graphiques).
export const STATUT_COLORS = {
  'En attente': '#8792a2',
  'Impression OK': '#8b5cf6',
  'En cours de prod': '#3b82f6',
  'Terminé': '#22a35a',
  'Expédié': '#14a395',
};

// ── Impression des transferts (agent d'impression du PC atelier) ──
export const IMPRIMANTES = ['A', 'B'];
// Numéro affiché (« Imprimante 1 ») : les codes A et B restent en interne (base, agent, dossiers).
export const IMPRIMANTE_NUMEROS = { A: 1, B: 2 };

export const IMPRESSION_LABELS = {
  EN_FILE: 'En file',
  ENVOYE: 'Dans Edge Print',
  IMPRIME: 'Imprimé',
  ERREUR: 'Erreur',
  ANNULE: 'Annulé',
};

// Pastille (badge) de chaque état d'envoi.
export const IMPRESSION_CLASS = {
  EN_FILE: 'badge-warning',
  ENVOYE: 'badge-info',
  IMPRIME: 'badge-success',
  ERREUR: 'badge-danger',
  ANNULE: '',
};

export const ROLE_LABELS = {
  ADMIN: 'Administrateur',
  OPERATEUR: 'Opérateur',
  COMPTABLE: 'Comptable',
};
