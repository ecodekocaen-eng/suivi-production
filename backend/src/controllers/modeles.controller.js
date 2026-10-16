// ─────────────────────────────────────────────────────────────
//  Base de données des modèles (ex. mugs Heula) : une référence client →
//  son fichier d'impression et une vignette.
//   - import et gestion : ADMIN (fichiers déposés directement dans le stockage) ;
//   - consultation et création d'une commande à partir d'une « Demande de prix »
//     (analysée dans le navigateur) : tout utilisateur de production. Le fichier
//     d'impression de chaque modèle est COPIÉ sur sa ligne de commande : la purge
//     des visuels à l'expédition n'atteint jamais la base (dossier modeles/).
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import * as commandesService from '../services/commandes.service.js';
import { dossierFichiers } from '../services/fichiers.service.js';
import { addLog } from '../services/log.service.js';
import { buildData, buildLignes, masquerMarge } from './commandes.controller.js';
import { envoyerFichier, cheminValide } from './fichiers.controller.js';
import { saveBuffer, deleteByKey, copyKey, infosFichier, makeFilename, nomSur, STORAGE_DRIVER, BLOB_PREFIX } from '../storage.js';
import { ALLOWED_MIME_TYPES, LOG_ACTIONS } from '../constants.js';
import { parseIntSafe, cleanStr } from '../utils/parse.js';

// Validité d'un lien d'envoi direct (large : connexion lente).
const VALIDITE_LIEN_MS = 30 * 60 * 1000;
// Référence d'un modèle : lettres et chiffres séparés par des tirets, ex. 104HE-22, 104HE-98B.
const FORMAT_REFERENCE = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

export const normRef = (r) => String(r ?? '').trim().toUpperCase().replace(/\s+/g, '');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Dossier des fichiers d'un modèle : modeles/<REF>/<identifiant>/<nom sûr>.
const prefixeModele = (reference) => `${BLOB_PREFIX}modeles/${reference}/`;

function referenceValide(brute) {
  const reference = normRef(brute);
  if (!FORMAT_REFERENCE.test(reference) || reference.length > 40) {
    throw httpError(400, `Référence invalide : « ${brute ?? ''} » (format attendu : 104HE-22).`);
  }
  return reference;
}

async function loadModele(req) {
  const modele = await prisma.modele.findUnique({ where: { id: Number(req.params.id) } });
  if (!modele) throw httpError(404, 'Modèle introuvable.');
  return modele;
}

// ── Consultation ─────────────────────────────────────────────

// Toute la base (quelques centaines de modèles au plus) : recherche et tri côté interface.
export async function index(req, res) {
  const modeles = await prisma.modele.findMany({ orderBy: { reference: 'asc' } });
  res.json({ modeles });
}

// Fichier d'impression (aperçu, ou téléchargement avec ?telecharger=1).
export async function fichier(req, res) {
  const m = await loadModele(req);
  if (!m.fichierChemin) throw httpError(404, 'Ce modèle n’a pas de fichier d’impression.');
  await envoyerFichier(req, res, {
    chemin: m.fichierChemin, nom: m.fichierNom, taille: m.fichierTaille, type: m.fichierType,
  }, { telechargement: req.query.telecharger === '1' });
}

export async function apercu(req, res) {
  const m = await loadModele(req);
  if (!m.apercuChemin) throw httpError(404, 'Ce modèle n’a pas de vignette.');
  const ext = (m.apercuChemin.match(/\.(png|webp|gif)$/i)?.[1] || 'jpeg').toLowerCase();
  await envoyerFichier(req, res, { chemin: m.apercuChemin, nom: m.reference, taille: null, type: `image/${ext}` });
}

// ── Import (ADMIN) ───────────────────────────────────────────

// Lien signé d'envoi direct navigateur → Vercel Blob, limité au dossier du modèle.
export async function televersementDirect(req, res) {
  if (STORAGE_DRIVER !== 'blob') throw httpError(400, 'Envoi direct indisponible : stockage local (envoi classique).');
  if (req.body?.type !== 'blob.generate-presigned-url') throw httpError(400, 'Demande d’envoi invalide.');
  const { handleUploadPresigned } = await import('@vercel/blob/client');
  const { issueSignedToken } = await import('@vercel/blob');

  const resultat = await handleUploadPresigned({
    body: req.body,
    request: req,
    getSignedToken: async (pathname, clientPayload) => {
      let demande = {};
      try { demande = JSON.parse(clientPayload || '{}'); } catch { /* charge utile illisible */ }
      const reference = referenceValide(demande.reference);
      if (!cheminValide(pathname, prefixeModele(reference))) throw httpError(400, 'Chemin de fichier invalide.');
      const contraintes = { allowedContentTypes: ALLOWED_MIME_TYPES, maximumSizeInBytes: config.maxDirectUploadSize };
      const token = await issueSignedToken({
        pathname, operations: ['put'], validUntil: Date.now() + VALIDITE_LIEN_MS, ...contraintes,
      });
      return { token, urlOptions: { ...contraintes, addRandomSuffix: false, allowOverwrite: false } };
    },
  });
  res.json(resultat);
}

// Stockage local (disque) : envoi classique d'un fichier, rangé comme un envoi direct.
export async function televersementLocal(req, res) {
  if (!req.file) throw httpError(400, 'Aucun fichier reçu.');
  const reference = referenceValide(req.body?.reference);
  const identifiant = crypto.randomBytes(8).toString('hex');
  const { key } = await saveBuffer(req.file.buffer, {
    subdir: `modeles/${reference}/${identifiant}`, filename: nomSur(req.file.originalname), contentType: req.file.mimetype,
  });
  res.status(201).json({ pathname: key });
}

// Crée le modèle, ou le remplace s'il existe déjà (même référence), une fois ses
// fichiers déposés. Taille et type sont relus dans le stockage.
export async function enregistrer(req, res) {
  const reference = referenceValide(req.body?.reference);
  const { fichier, apercu } = req.body || {};
  const prefixe = prefixeModele(reference);
  if (!cheminValide(fichier?.pathname, prefixe)) throw httpError(400, 'Fichier d’impression manquant ou invalide.');
  if (apercu?.pathname && !cheminValide(apercu.pathname, prefixe)) throw httpError(400, 'Vignette invalide.');

  const infos = await infosFichier(fichier.pathname).catch(() => null);
  if (!infos) throw httpError(400, 'Fichier introuvable dans le stockage : l’envoi n’est pas allé au bout.');
  if (!ALLOWED_MIME_TYPES.includes(infos.type) || infos.taille > config.maxDirectUploadSize) {
    await deleteByKey(fichier.pathname, infos.url);
    throw httpError(400, `Fichier refusé (${infos.type}).`);
  }
  let apercuChemin = null;
  if (apercu?.pathname) {
    const infosApercu = await infosFichier(apercu.pathname).catch(() => null);
    if (infosApercu && /^image\//.test(infosApercu.type)) apercuChemin = apercu.pathname;
  }

  const avant = await prisma.modele.findUnique({ where: { reference } });
  const data = {
    nom: cleanStr(req.body.nom) || avant?.nom || reference,
    client: cleanStr(req.body.client) ?? avant?.client ?? null,
    typeMug: cleanStr(req.body.typeMug) ?? avant?.typeMug ?? null,
    fichierNom: String(fichier.nom || fichier.pathname.split('/').pop()).slice(0, 200),
    fichierChemin: fichier.pathname,
    fichierTaille: infos.taille,
    fichierType: infos.type,
    apercuChemin,
  };
  const modele = await prisma.modele.upsert({ where: { reference }, create: { reference, ...data }, update: data });
  // Remplacement : les anciens fichiers quittent le stockage.
  for (const ancien of [avant?.fichierChemin, avant?.apercuChemin]) {
    if (ancien && ancien !== modele.fichierChemin && ancien !== modele.apercuChemin) await deleteByKey(ancien);
  }
  res.status(avant ? 200 : 201).json({ modele, remplace: Boolean(avant) });
}

export async function update(req, res) {
  const m = await loadModele(req);
  const data = {};
  if (req.body?.nom !== undefined) data.nom = cleanStr(req.body.nom) || m.reference;
  if (req.body?.client !== undefined) data.client = cleanStr(req.body.client);
  if (req.body?.typeMug !== undefined) data.typeMug = cleanStr(req.body.typeMug);
  res.json({ modele: await prisma.modele.update({ where: { id: m.id }, data }) });
}

export async function remove(req, res) {
  const m = await loadModele(req);
  await prisma.modele.delete({ where: { id: m.id } });
  for (const cle of [m.fichierChemin, m.apercuChemin]) if (cle) await deleteByKey(cle);
  res.json({ ok: true });
}

// ── Commande à partir d'une « Demande de prix » ──────────────

// Lignes analysées par le navigateur : [{ reference, designation, quantite, typeMug }].
// Une ligne de commande par ligne de la demande ; le fichier d'impression du
// modèle (s'il est dans la base) est copié sur sa ligne.
export async function creerCommande(req, res) {
  const demande = Array.isArray(req.body?.lignes) ? req.body.lignes.slice(0, 200) : [];
  if (demande.length === 0) throw httpError(400, 'Aucune ligne à créer.');
  if (!cleanStr(req.body.client)) throw httpError(400, 'Indiquez le client.');

  const refs = demande.map((l) => normRef(l.reference));
  const modeles = await prisma.modele.findMany({ where: { reference: { in: refs.filter(Boolean) } } });
  const parRef = new Map(modeles.map((m) => [m.reference, m]));

  const lignes = demande.map((l, i) => {
    const m = parRef.get(refs[i]);
    return {
      typeMug: cleanStr(l.typeMug) ?? m?.typeMug ?? null,
      visuel: m ? `${m.reference} ${m.nom}` : [refs[i], cleanStr(l.designation)].filter(Boolean).join(' ') || 'Visuel à préciser',
      quantite: parseIntSafe(l.quantite, 0),
      commentaire: m?.fichierChemin ? null : 'Modèle absent de la base de données : fichier à ajouter',
    };
  });
  const data = buildData({
    client: req.body.client,
    nom: req.body.nom,
    dateSortieTexte: req.body.dateSortieTexte,
    dateCommande: new Date().toISOString(),
    notes: req.body.notes,
  });
  const commande = await commandesService.createCommande(data, req.user.id, buildLignes({ lignes }));
  const creee = await commandesService.getCommande(commande.id);

  let copies = 0;
  for (const ligne of creee.lignes) {
    const m = parRef.get(refs[ligne.ordre]);
    if (!m?.fichierChemin) continue;
    const nomStockage = makeFilename(m.fichierNom || `${m.reference}.pdf`);
    try {
      const { key, url } = await copyKey(m.fichierChemin, `${BLOB_PREFIX}${dossierFichiers(commande.id, ligne.id)}/${nomStockage}`, m.fichierType);
      await prisma.fichier.create({
        data: {
          nom: m.fichierNom || nomStockage, nomStockage, chemin: key, url, taille: m.fichierTaille, type: m.fichierType,
          categorie: 'VISUEL', commandeId: commande.id, ligneId: ligne.id,
        },
      });
      copies += 1;
    } catch (e) {
      console.error(`Copie du fichier du modèle ${m.reference} :`, e.message);
    }
  }
  const numero = cleanStr(req.body.numero);
  await addLog({
    action: LOG_ACTIONS.FICHIER_AJOUTE,
    detail: `Créée depuis ${numero ? `la demande de prix ${numero}` : 'une demande de prix'} : ${copies} fichier${copies > 1 ? 's' : ''} d’impression repris de la base de données`,
    userId: req.user.id,
    commandeId: commande.id,
  });

  res.status(201).json({
    commande: masquerMarge(await commandesService.getCommande(commande.id), req.user.role),
    fichiers: copies,
    manquants: refs.filter((r) => !parRef.get(r)?.fichierChemin),
  });
}
