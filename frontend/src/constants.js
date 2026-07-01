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

// Classe CSS associée à chaque statut (couleurs définies dans styles.css).
export const STATUT_CLASS = {
  'En attente': 'st-attente',
  'Impression OK': 'st-impression',
  'En cours de prod': 'st-production',
  'Terminé': 'st-termine',
  'Expédié': 'st-expediee',
};
