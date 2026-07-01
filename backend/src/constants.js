// ─────────────────────────────────────────────────────────────
//  Constantes métier (statuts, rôles, types de fichiers, actions log)
// ─────────────────────────────────────────────────────────────

// Statuts de commande, dans l'ordre du workflow.
// Statuts fidèles à la Google Sheet (valeurs = libellés affichés).
export const STATUTS = [
  'En attente',
  'Impression OK',
  'En cours de prod',
  'Terminé',
  'Expédié',
];

// Libellés lisibles (utilisés aussi par le frontend via /api/meta).
// Les valeurs sont déjà lisibles : libellé = valeur.
export const STATUT_LABELS = {
  'En attente': 'En attente',
  'Impression OK': 'Impression OK',
  'En cours de prod': 'En cours de prod',
  'Terminé': 'Terminé',
  'Expédié': 'Expédié',
};

// Statut qui déclenche la suppression automatique des fichiers.
export const STATUT_EXPEDIEE = 'Expédié';

export const ROLES = ['ADMIN', 'OPERATEUR'];

// Types MIME autorisés à l'upload (images + PDF).
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

// Actions tracées dans les logs.
export const LOG_ACTIONS = {
  COMMANDE_CREEE: 'COMMANDE_CREEE',
  COMMANDE_MODIFIEE: 'COMMANDE_MODIFIEE',
  STATUT_MODIFIE: 'STATUT_MODIFIE',
  COMMANDE_SUPPRIMEE: 'COMMANDE_SUPPRIMEE',
  COMMANDE_RESTAUREE: 'COMMANDE_RESTAUREE',
  FICHIER_AJOUTE: 'FICHIER_AJOUTE',
  FICHIER_SUPPRIME: 'FICHIER_SUPPRIME',
  FICHIERS_SUPPRIMES: 'FICHIERS_SUPPRIMES',
  CLIENTS_FUSIONNES: 'CLIENTS_FUSIONNES',
  CLIENTS_NORMALISES: 'CLIENTS_NORMALISES',
};
