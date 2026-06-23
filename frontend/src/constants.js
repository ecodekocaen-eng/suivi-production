// ─────────────────────────────────────────────────────────────
//  Constantes UI (statuts, libellés, couleurs) — alignées sur le backend.
// ─────────────────────────────────────────────────────────────
export const STATUTS = [
  'EN_ATTENTE',
  'EN_PRODUCTION',
  'CONTROLE_QUALITE',
  'PRET_A_EXPEDIER',
  'EXPEDIEE',
];

export const STATUT_LABELS = {
  EN_ATTENTE: 'En attente',
  EN_PRODUCTION: 'En production',
  CONTROLE_QUALITE: 'Contrôle qualité',
  PRET_A_EXPEDIER: 'Prêt à expédier',
  EXPEDIEE: 'Expédiée',
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
  EN_ATTENTE: 'st-attente',
  EN_PRODUCTION: 'st-production',
  CONTROLE_QUALITE: 'st-controle',
  PRET_A_EXPEDIER: 'st-pret',
  EXPEDIEE: 'st-expediee',
};
