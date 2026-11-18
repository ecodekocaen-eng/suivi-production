// ─────────────────────────────────────────────────────────────
//  Réglages Chronopost du suivi des mugs (18/11/2026) : contrat d'Objetlia (compte et mot de
//  passe du service web, saisis par un admin), mode Arrêté / Test / Réel, expéditeurs.
//  L'ESAT n'est JAMAIS l'expéditeur (décision de Théo) : l'étiquette porte l'adresse de l'atelier
//  (expéditeur habituel, titulaire du contrat), ou celle d'un expéditeur particulier choisi tout
//  seul d'après le client de la commande (ex. OBJETRAMA). Table Parametre (clé → valeur) :
//   - « chronopost » : tout ce qui n'est pas secret (JSON) ;
//   - « chronopost.motDePasse » : le mot de passe, chiffré (AES-256-GCM, clé tirée de JWT_SECRET),
//     jamais renvoyé au navigateur ;
//   - « agent-zebra » : empreinte de la clé de l'agent de la Zebra (PC atelier), jamais la clé.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';

export const PRODUITS_CHRONOPOST = { '01': 'Chrono 13' };
export const ETATS_CHRONOPOST = ['off', 'test', 'reel'];
// Compte de test publié par Chronopost pour son service web : étiquettes « SPECIMEN », jamais facturées.
export const COMPTE_ESSAI_CHRONOPOST = Object.freeze({ compte: '19869502', motDePasse: '255562', sousCompte: '' });
export const CHAMPS_ADRESSE = ['nom', 'contact', 'adresse1', 'adresse2', 'cp', 'ville', 'pays', 'telephone', 'email'];
const ADRESSE_VIDE = Object.freeze({ nom: '', contact: '', adresse1: '', adresse2: '', cp: '', ville: '', pays: 'FR', telephone: '', email: '' });

const CLE = 'chronopost';
const CLE_MOT_DE_PASSE = 'chronopost.motDePasse';
const CLE_AGENT = 'agent-zebra';
const CLE_AGENT_VU = 'agent-zebra.vu';

const erreur = (status, message) => Object.assign(new Error(message), { status });

async function lire(cle) {
  const p = await prisma.parametre.findUnique({ where: { cle } });
  return p?.valeur ?? null;
}
async function ecrire(cle, valeur) {
  await prisma.parametre.upsert({ where: { cle }, create: { cle, valeur }, update: { valeur } });
}

export const adresseNette = (a = {}) => Object.fromEntries(CHAMPS_ADRESSE.map((k) => [k, String(a?.[k] ?? ADRESSE_VIDE[k]).trim().slice(0, 80)]));
// Adresse utilisable sur une étiquette : nom, rue, code postal, ville.
export const adresseComplete = (a) => Boolean(a?.nom && a.adresse1 && a.cp && a.ville);

// ── Expéditeurs particuliers (ex. OBJETRAMA) ──────────────────
export const PARTICULIERS_MAX = 10;
// Clé de comparaison d'un nom de client : majuscules, sans accents, espaces ni ponctuation.
export const cleClient = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');
// Noms de clients d'un expéditeur particulier : séparés par des virgules, points-virgules ou retours à la ligne.
export const motsClients = (texte) => String(texte || '').split(/[,;\n]/).map(cleClient).filter((m) => m.length >= 3);

// Expéditeur particulier tel qu'enregistré : identifiant stable, noms de clients, adresse.
export const particulierNet = (p = {}) => ({
  id: /^exp-[a-z0-9]{4,20}$/.test(p?.id) ? p.id : `exp-${crypto.randomBytes(4).toString('hex')}`,
  clients: String(p?.clients ?? '').trim().slice(0, 200),
  ...adresseNette(p),
});

// Expéditeur particulier du client de la commande (son nom contient un des noms donnés), sinon null.
export function particulierPourClient(r, client) {
  const cle = cleClient(client);
  if (!cle) return null;
  return r.expediteurs.particuliers.find((p) => motsClients(p.clients).some((m) => cle.includes(m))) || null;
}

// Expéditeur imprimé : « atelier », l'identifiant d'un particulier, ou rien (choix automatique d'après
// le client). Renvoie { id, adresse }, ou null pour un identifiant inconnu.
export function expediteurChoisi(r, id, client) {
  if (!id) {
    const p = particulierPourClient(r, client);
    return p ? { id: p.id, adresse: p } : { id: 'atelier', adresse: r.expediteurs.atelier };
  }
  if (id === 'atelier') return { id: 'atelier', adresse: r.expediteurs.atelier };
  const p = r.expediteurs.particuliers.find((x) => x.id === id);
  return p ? { id: p.id, adresse: p } : null;
}

export async function lireReglages() {
  let lu = {};
  try { lu = JSON.parse((await lire(CLE)) || '{}') || {}; } catch { /* pas encore réglé */ }
  const particuliers = Array.isArray(lu.expediteurs?.particuliers) ? lu.expediteurs.particuliers : [];
  return {
    etat: ETATS_CHRONOPOST.includes(lu.etat) ? lu.etat : 'off',
    compte: lu.compte || '',
    sousCompte: lu.sousCompte || '',
    produit: PRODUITS_CHRONOPOST[lu.produit] ? lu.produit : '01',
    expediteurs: {
      atelier: { ...ADRESSE_VIDE, ...(lu.expediteurs?.atelier || {}) },
      particuliers: particuliers.slice(0, PARTICULIERS_MAX).map((p, i) => ({ ...ADRESSE_VIDE, ...p, id: p.id || `exp-${i + 1}`, clients: p.clients || '' })),
    },
  };
}

export async function ecrireReglages(maj) {
  const r = { ...(await lireReglages()), ...maj };
  await ecrire(CLE, JSON.stringify(r));
  return r;
}

// ── Mot de passe du service web (chiffré) ─────────────────────
const cleChiffrement = () => crypto.createHash('sha256').update(`suivi-chronopost:${config.jwtSecret}`).digest();

export function chiffrer(clair) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cleChiffrement(), iv);
  const donnees = Buffer.concat([c.update(String(clair), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), donnees]).toString('base64');
}

export function dechiffrer(b64) {
  const brut = Buffer.from(String(b64), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', cleChiffrement(), brut.subarray(0, 12));
  d.setAuthTag(brut.subarray(12, 28));
  return Buffer.concat([d.update(brut.subarray(28)), d.final()]).toString('utf8');
}

// Mot de passe en clair, ou '' (absent, ou illisible si JWT_SECRET a changé : à ressaisir).
export async function motDePasse() {
  const v = await lire(CLE_MOT_DE_PASSE);
  if (!v) return '';
  try { return dechiffrer(v); } catch { return ''; }
}
export const enregistrerMotDePasse = (clair) => ecrire(CLE_MOT_DE_PASSE, chiffrer(clair));

// Accès au service web pour une nouvelle étiquette : compte de TEST publié par Chronopost en mode
// Test, contrat d'Objetlia en mode Réel. Arrêté : refus.
export async function accesChronopost(r) {
  if (r.etat === 'test') return { ...COMPTE_ESSAI_CHRONOPOST, essai: true };
  if (r.etat !== 'reel') throw erreur(409, 'Chronopost est arrêté : réglez-le dans Administration › Chronopost.');
  return accesContrat(r);
}

// Accès au contrat (étiquette réelle, annulation d'une étiquette réelle, essai de connexion).
export async function accesContrat(r) {
  const mdp = await motDePasse();
  if (!r.compte || !mdp) throw erreur(409, 'Compte ou mot de passe Chronopost absent : à saisir dans Administration › Chronopost.');
  return { compte: r.compte, sousCompte: r.sousCompte, motDePasse: mdp, essai: false };
}

// ── Clé de l'agent de la Zebra (PC atelier) ───────────────────
const empreinte = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Nouvelle clé : seule son empreinte est gardée ; l'ancienne cesse aussitôt de marcher.
export async function nouvelleCleAgent() {
  const jeton = crypto.randomBytes(32).toString('base64url');
  await ecrire(CLE_AGENT, empreinte(jeton));
  return jeton;
}

export async function cleAgentValide(jeton) {
  const attendue = await lire(CLE_AGENT);
  if (!attendue || !jeton) return false;
  return crypto.timingSafeEqual(Buffer.from(empreinte(jeton), 'hex'), Buffer.from(attendue, 'hex'));
}

export const cleAgentConfiguree = async () => Boolean(await lire(CLE_AGENT));

// Dernier passage de l'agent (écrit au plus une fois par minute).
export async function noterPassageAgent(maintenant = new Date()) {
  const vu = await lire(CLE_AGENT_VU);
  if (vu && maintenant.getTime() - new Date(vu).getTime() < 60_000) return;
  await ecrire(CLE_AGENT_VU, maintenant.toISOString());
}
export const dernierPassageAgent = async () => (await lire(CLE_AGENT_VU)) || null;
