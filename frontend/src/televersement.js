// ─────────────────────────────────────────────────────────────
//  Envoi de fichiers (visuels, documents) vers une commande.
//
//  En ligne (Vercel), une requête vers l'API ne peut pas dépasser 4,5 Mo :
//  le navigateur dépose donc chaque fichier DIRECTEMENT dans le stockage
//  (Vercel Blob) grâce à un lien signé que délivre l'API, puis l'API
//  l'inscrit sur la commande. En local (stockage disque), envoi classique.
//  Le mode et la taille maximale viennent de /api/meta.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtSize } from './format.js';

// Au-delà, l'envoi direct passe en « multipart » : morceaux envoyés en
// parallèle et renvoyés automatiquement en cas de coupure.
const SEUIL_MULTIPART = 20 * 1024 * 1024;
// Jusqu'à cette taille, un fichier peut aussi passer par l'API (secours si l'envoi
// direct échoue) : c'est la limite des requêtes sur Vercel, avec une marge.
const SEUIL_SECOURS = 4 * 1024 * 1024;

let meta = null;
export function chargerReglagesEnvoi() {
  if (!meta) meta = api.get('/meta').then((m) => m.envoi).catch((e) => { meta = null; throw e; });
  return meta;
}

// Taille maximale par fichier (en octets), pour l'afficher dans l'interface.
export function useTailleMax() {
  const [taille, setTaille] = useState(null);
  useEffect(() => {
    chargerReglagesEnvoi().then((r) => setTaille(r.tailleMax)).catch(() => {});
  }, []);
  return taille;
}

export const libelleTailleMax = (octets) => (octets ? `jusqu’à ${fmtSize(octets)} par fichier` : '');

// Nom sûr pour le stockage (sans accents ni caractères spéciaux), extension conservée.
function nomSur(nom) {
  const point = nom.lastIndexOf('.');
  const ext = point > 0 ? nom.slice(point).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 20) : '';
  // Pas de « .. » dans le chemin (le serveur le refuse) : points répétés fusionnés,
  // points en début et fin de nom retirés (« logo..png » → « logo.png »).
  const base = (point > 0 ? nom.slice(0, point) : nom)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '.')
    .slice(0, 80).replace(/^\.+|\.+$/g, '') || 'fichier';
  return `${base}${ext}`;
}

const identifiant = () => (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);

function dossier(commandeId, ligneId, categorie) {
  if (categorie === 'document') return `documents/commande_${commandeId}`;
  return ligneId ? `commande_${commandeId}/ligne_${ligneId}` : `commande_${commandeId}`;
}

// Fichiers trop gros : refusés avant tout envoi, avec un message clair.
export async function verifierTailles(files) {
  const { tailleMax } = await chargerReglagesEnvoi();
  const trop = [...files].find((f) => f.size > tailleMax);
  if (trop) {
    throw new Error(`« ${trop.name} » fait ${fmtSize(trop.size)} : c’est plus que le maximum de ${fmtSize(tailleMax)} par fichier. Utilisez un lien WeTransfer/Smash.`);
  }
}

/**
 * Envoie des fichiers sur une commande (ou une de ses lignes).
 * @param categorie  'visuel' (défaut) ou 'document'
 * @param onProgress pourcentage global 0-100
 * @returns {{ fichiers: object[] }}
 */
export async function envoyerFichiers({ commandeId, ligneId = null, categorie = 'visuel', files, onProgress }) {
  const liste = [...files];
  if (!liste.length) return { fichiers: [] };
  await verifierTailles(liste);
  const reglages = await chargerReglagesEnvoi();

  const endpoint = categorie === 'document'
    ? `/commandes/${commandeId}/fichiers/documents`
    : (ligneId ? `/commandes/${commandeId}/fichiers/ligne/${ligneId}` : `/commandes/${commandeId}/fichiers`);
  if (reglages.mode !== 'direct') return api.uploadWithProgress(endpoint, liste, onProgress);

  const { uploadPresigned } = await import('@vercel/blob/client');
  const total = liste.reduce((s, f) => s + f.size, 0) || 1;
  let envoye = 0;
  const fichiers = [];
  for (const f of liste) {
    const pathname = `${reglages.prefixe || ''}${dossier(commandeId, ligneId, categorie)}/${identifiant()}/${nomSur(f.name)}`;
    try {
      await uploadPresigned(pathname, f, {
        access: 'private',
        handleUploadUrl: `/api/commandes/${commandeId}/fichiers/direct`,
        clientPayload: JSON.stringify({ ligneId, categorie }),
        contentType: f.type || undefined,
        multipart: f.size > SEUIL_MULTIPART,
        onUploadProgress: ({ loaded }) => onProgress?.(Math.min(99, Math.round(((envoye + loaded) / total) * 100))),
      });
    } catch (err) {
      // Secours : un petit fichier peut toujours passer par l'API.
      if (f.size <= SEUIL_SECOURS) {
        const { fichiers: crees } = await api.uploadWithProgress(endpoint, [f],
          (p) => onProgress?.(Math.min(99, Math.round(((envoye + (f.size * p) / 100) / total) * 100))));
        fichiers.push(...crees);
        envoye += f.size;
        continue;
      }
      throw new Error(`Envoi de « ${f.name} » impossible : ${err.message || 'erreur réseau'}.`);
    }
    envoye += f.size;
    const { fichier } = await api.post(`/commandes/${commandeId}/fichiers/direct/enregistrer`, {
      pathname, nom: f.name, ligneId, categorie,
    });
    fichiers.push(fichier);
  }
  onProgress?.(100);
  return { fichiers };
}
