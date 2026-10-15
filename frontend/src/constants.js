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
export const ATELIERS = ['LETTRAGE', 'CONDITIONNEMENT'];

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

export const ROLE_LABELS = {
  ADMIN: 'Administrateur',
  OPERATEUR: 'Opérateur',
  COMPTABLE: 'Comptable',
};
