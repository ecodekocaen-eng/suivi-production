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

// COMPTABLE : compte dédié à la facturation ESAT — n'accède qu'au module
// facturation (jamais au prix de vente ni à la marge).
export const ROLES = ['ADMIN', 'OPERATEUR', 'COMPTABLE'];

// Types MIME autorisés à l'upload des visuels (images + PDF).
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

// Types MIME autorisés pour les documents (bons de commande, rendus 3D…) :
// visuels + Word / Excel / CSV.
export const DOCUMENT_MIME_TYPES = [
  ...ALLOWED_MIME_TYPES,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
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
  REGLAGE_ENREGISTRE: 'REGLAGE_ENREGISTRE',
  REGLAGE_SUPPRIME: 'REGLAGE_SUPPRIME',
  USER_CREE: 'USER_CREE',
  USER_MODIFIE: 'USER_MODIFIE',
  USER_SUPPRIME: 'USER_SUPPRIME',
  RELEVE_CREE: 'RELEVE_CREE',
  RELEVE_ANNULE: 'RELEVE_ANNULE',
  COMMANDES_EXCLUES_FACTURATION: 'COMMANDES_EXCLUES_FACTURATION',
};

// Actions liées aux comptes (pour le journal d'audit de la page Utilisateurs).
export const USER_LOG_ACTIONS = ['USER_CREE', 'USER_MODIFIE', 'USER_SUPPRIME'];
