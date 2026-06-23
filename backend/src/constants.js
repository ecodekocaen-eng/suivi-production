// ─────────────────────────────────────────────────────────────
//  Constantes métier (statuts, rôles, types de fichiers, actions log)
// ─────────────────────────────────────────────────────────────

// Statuts de commande, dans l'ordre du workflow.
export const STATUTS = [
  'EN_ATTENTE',
  'EN_PRODUCTION',
  'CONTROLE_QUALITE',
  'PRET_A_EXPEDIER',
  'EXPEDIEE',
];

// Libellés lisibles (utilisés aussi par le frontend via /api/meta).
export const STATUT_LABELS = {
  EN_ATTENTE: 'En attente',
  EN_PRODUCTION: 'En production',
  CONTROLE_QUALITE: 'Contrôle qualité',
  PRET_A_EXPEDIER: 'Prêt à expédier',
  EXPEDIEE: 'Expédiée',
};

// Statut qui déclenche la suppression automatique des fichiers.
export const STATUT_EXPEDIEE = 'EXPEDIEE';

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
