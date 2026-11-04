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
import { dossierRef } from './demandePrix.js';

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

// La bibliothèque Vercel jette la réponse du serveur quand il refuse le lien d'envoi
// (« Failed to retrieve the presigned URL ») : on lui repose la question pour
// donner la vraie raison. Rien n'est envoyé : il ne s'agit que de la demande de lien.
async function raisonDuRefus(err, lienEnvoi, pathname, clientPayload) {
  if (!/presigned URL/i.test(err?.message || '')) return err?.message || 'erreur réseau';
  try {
    const res = await fetch(lienEnvoi, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'blob.generate-presigned-url', payload: { pathname, clientPayload, multipart: false } }),
    });
    if (res.status === 401) return 'session expirée : reconnectez-vous, puis recommencez';
    if (!res.ok) return (await res.json().catch(() => null))?.error || `erreur ${res.status}`;
  } catch { /* réseau coupé : message général ci-dessous */ }
  return 'le serveur n’a pas pu préparer l’envoi, réessayez';
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
  const lienEnvoi = `/api/commandes/${commandeId}/fichiers/direct`;
  const clientPayload = JSON.stringify({ ligneId, categorie });
  for (const f of liste) {
    const pathname = `${reglages.prefixe || ''}${dossier(commandeId, ligneId, categorie)}/${identifiant()}/${nomSur(f.name)}`;
    try {
      await uploadPresigned(pathname, f, {
        access: 'private',
        handleUploadUrl: lienEnvoi,
        clientPayload,
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
      throw new Error(`Envoi de « ${f.name} » impossible : ${await raisonDuRefus(err, lienEnvoi, pathname, clientPayload)}.`);
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

/**
 * Dépose un fichier d'un modèle de la base de données (fichier d'impression ou
 * vignette) dans le stockage, sous modeles/<REF>/ ; renvoie son chemin, à
 * inscrire ensuite avec POST /modeles. En ligne : envoi direct vers Vercel Blob.
 */
export async function deposerFichierModele(reference, fichier, nom = fichier.name) {
  const reglages = await chargerReglagesEnvoi();
  if (reglages.mode !== 'direct') {
    const fd = new FormData();
    fd.append('reference', reference);
    fd.append('fichier', fichier, nom);
    const res = await fetch('/api/modeles/fichiers', { method: 'POST', credentials: 'include', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data.pathname;
  }
  const { uploadPresigned } = await import('@vercel/blob/client');
  const pathname = `${reglages.prefixe || ''}modeles/${dossierRef(reference)}/${identifiant()}/${nomSur(nom)}`;
  const lienEnvoi = '/api/modeles/direct';
  const clientPayload = JSON.stringify({ reference });
  try {
    await uploadPresigned(pathname, fichier, {
      access: 'private',
      handleUploadUrl: lienEnvoi,
      clientPayload,
      contentType: fichier.type || undefined,
      multipart: fichier.size > SEUIL_MULTIPART,
    });
  } catch (err) {
    throw new Error(await raisonDuRefus(err, lienEnvoi, pathname, clientPayload));
  }
  return pathname;
}
