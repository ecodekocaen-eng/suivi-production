// ─────────────────────────────────────────────────────────────
//  Service impression : file des transferts à imprimer, suivie par
//  l'agent du PC atelier (Edge Print). Quand toutes les lignes d'une
//  commande sont imprimées, elle passe seule en « Impression OK ».
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { addLog } from './log.service.js';
import { updateCommande, typesNonComptes, apercusDesModeles } from './commandes.service.js';
import { LOG_ACTIONS, IMPRIMANTES, IMPRIMANTE_NUMEROS } from '../constants.js';

// Bornes d'un envoi.
const QUANTITE_MAX = 2000;
const VISUELS_MAX = 200;
// Sans nouvelles de l'agent depuis ce délai, le PC atelier est affiché hors ligne.
const DELAI_EN_LIGNE_MS = 90 * 1000;
// Envois que l'agent doit encore déposer (EN_FILE) ou surveiller (ENVOYE).
const STATUTS_ACTIFS = ['EN_FILE', 'ENVOYE'];
// États que l'agent peut signaler, selon l'état courant. Un envoi annulé
// ou déjà imprimé n'est jamais écrasé.
const TRANSITIONS_AGENT = {
  ENVOYE: ['EN_FILE', 'ERREUR'],
  IMPRIME: ['EN_FILE', 'ENVOYE', 'ERREUR'],
  ERREUR: ['EN_FILE', 'ENVOYE'],
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const texteCourt = (s, max = 300) => (s == null ? null : String(s).trim().slice(0, max) || null);
const nomImprimante = (code) => `imprimante ${IMPRIMANTE_NUMEROS[code] ?? code}`;

async function trouverEnvoi(id) {
  const envoi = await prisma.impression.findUnique({ where: { id: Number(id) } });
  if (!envoi) throw httpError(404, 'Envoi introuvable.');
  return envoi;
}

// Crée un lot d'impression : [{ fichierId, quantite, imprimante }]. Les visuels
// peuvent venir de plusieurs commandes (page Impression), et un même visuel
// peut être réparti entre les deux imprimantes. L'`imprimante` commune sert
// aux éléments qui n'en précisent pas.
export async function creerEnvoi({ imprimante, elements } = {}, user) {
  if (!Array.isArray(elements) || elements.length === 0) throw httpError(400, 'Aucun visuel à imprimer.');
  if (elements.length > VISUELS_MAX) throw httpError(400, `Trop de visuels en un envoi (${VISUELS_MAX} au maximum).`);

  const demandes = elements.map((e) => ({
    fichierId: Number(e?.fichierId), quantite: Number(e?.quantite), imprimante: e?.imprimante ?? imprimante,
  }));
  if (demandes.some((d) => !IMPRIMANTES.includes(d.imprimante))) throw httpError(400, 'Choisissez l’imprimante 1 ou 2.');
  if (demandes.some((d) => !Number.isInteger(d.fichierId) || !Number.isInteger(d.quantite)
      || d.quantite < 1 || d.quantite > QUANTITE_MAX)) {
    throw httpError(400, `Quantité invalide : de 1 à ${QUANTITE_MAX} transferts par visuel.`);
  }
  const cles = new Set(demandes.map((d) => `${d.fichierId}-${d.imprimante}`));
  if (cles.size !== demandes.length) throw httpError(400, 'Un même visuel figure deux fois sur la même imprimante.');

  const ids = [...new Set(demandes.map((d) => d.fichierId))];
  const fichiers = await prisma.fichier.findMany({
    where: { id: { in: ids }, categorie: 'VISUEL' },
    include: { commande: { select: { supprime: true } } },
  });
  if (fichiers.length !== ids.length) throw httpError(404, 'Visuel introuvable : il a peut-être été supprimé entre-temps.');
  if (fichiers.some((f) => f.commande.supprime)) throw httpError(400, 'Commande à la corbeille : impression impossible.');

  const parId = new Map(fichiers.map((f) => [f.id, f]));
  const lot = crypto.randomUUID();
  const creees = await prisma.$transaction(demandes.map((d) => {
    const f = parId.get(d.fichierId);
    return prisma.impression.create({
      data: {
        commandeId: f.commandeId, ligneId: f.ligneId, fichierId: f.id, fichierNom: f.nom,
        quantite: d.quantite, imprimante: d.imprimante, lot, creeParId: user.id, creeParNom: user.nom,
      },
    });
  }));

  // Une ligne d'historique par commande concernée.
  const parCommande = new Map();
  for (const i of creees) {
    const c = parCommande.get(i.commandeId) || { transferts: 0, visuels: new Set(), parImprimante: new Map() };
    c.transferts += i.quantite;
    c.visuels.add(i.fichierId);
    c.parImprimante.set(i.imprimante, (c.parImprimante.get(i.imprimante) || 0) + i.quantite);
    parCommande.set(i.commandeId, c);
  }
  for (const [commandeId, c] of parCommande) {
    const repartition = [...c.parImprimante];
    const ou = repartition.length === 1
      ? ` sur l'${nomImprimante(repartition[0][0])}`
      : `, dont ${repartition.map(([code, n]) => `${n} sur l'${nomImprimante(code)}`).join(' et ')}`;
    await addLog({
      action: LOG_ACTIONS.IMPRESSION_DEMANDEE,
      detail: `Envoi à l'impression : ${pluriel(c.transferts, 'transfert')} (${pluriel(c.visuels.size, 'visuel')})${ou}`,
      userId: user.id,
      commandeId,
    });
  }
  return creees;
}

// Envois d'une commande (fiche commande), du plus récent au plus ancien.
export function impressionsDeCommande(commandeId) {
  return prisma.impression.findMany({
    where: { commandeId: Number(commandeId) },
    orderBy: { createdAt: 'desc' },
  });
}

// État du PC atelier (agent) : en ligne ou non, imprimantes déclarées.
export async function etatPoste() {
  const poste = await prisma.posteImpression.findFirst({ orderBy: { derniereVue: 'desc' } });
  if (!poste) return { connu: false, enLigne: false, imprimantes: [] };
  let imprimantes = [];
  try { imprimantes = JSON.parse(poste.imprimantes || '[]'); } catch { /* JSON illisible : liste vide */ }
  return {
    connu: true,
    nom: poste.nom,
    version: poste.version,
    derniereVue: poste.derniereVue,
    enLigne: Date.now() - poste.derniereVue.getTime() < DELAI_EN_LIGNE_MS,
    imprimantes,
  };
}

// Page « Impression » : commandes en attente qui ont des visuels, derniers
// envois, état du PC atelier.
export async function fileImpression() {
  const [aImprimer, envois, poste] = await Promise.all([
    prisma.commande.findMany({
      where: { supprime: false, statut: 'En attente', fichiers: { some: { categorie: 'VISUEL' } } },
      orderBy: [{ dateLivraison: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true, reference: true, client: true, nom: true, designation: true, quantite: true,
        typeMug: true, statut: true, dateLivraison: true, dateSortieTexte: true,
        lignes: { orderBy: { ordre: 'asc' }, select: { id: true, visuel: true, typeMug: true, quantite: true } },
        fichiers: {
          where: { categorie: 'VISUEL' },
          orderBy: { createdAt: 'asc' },
          select: { id: true, nom: true, type: true, taille: true, categorie: true, ligneId: true },
        },
        impressions: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, fichierId: true, ligneId: true, lot: true, statut: true, imprimante: true, quantite: true, createdAt: true, imprimeAt: true },
        },
      },
    }),
    prisma.impression.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { commande: { select: { id: true, reference: true, client: true } } },
    }),
    etatPoste(),
  ]);
  // Vignettes déjà prêtes (visuels de la base de données). Sans elles, le navigateur
  // rend le PDF : un souci ici ne doit pas priver l'atelier de sa file d'impression.
  const apercus = await apercusDesModeles(aImprimer.flatMap((c) => c.fichiers)).catch((err) => {
    console.error('Aperçus des modèles :', err.message);
    return {};
  });
  return { aImprimer, envois, poste, apercus };
}

// Envoi qui retient sa ligne : encore en file ou dans Edge Print, ou en erreur
// sans avoir été refait depuis. Un envoi d'un même lot n'est pas une reprise :
// c'est l'autre part d'un visuel réparti sur les deux imprimantes.
function retientSaLigne(envoi, envois) {
  if (STATUTS_ACTIFS.includes(envoi.statut)) return true;
  return envoi.statut === 'ERREUR' && !envois.some((e) => e.fichierId === envoi.fichierId
    && e.lot !== envoi.lot && e.id > envoi.id && e.statut !== 'ANNULE');
}

// Après chaque visuel imprimé : historique, puis passage de la commande en
// « Impression OK » si toutes ses lignes (hors accessoires) ont été imprimées.
async function apresImpression(envoi, userId) {
  await addLog({
    action: LOG_ACTIONS.IMPRESSION_TERMINEE,
    detail: `Imprimé : « ${envoi.fichierNom} » × ${envoi.quantite} (${nomImprimante(envoi.imprimante)})`,
    userId,
    commandeId: envoi.commandeId,
  });

  const commande = await prisma.commande.findUnique({
    where: { id: envoi.commandeId },
    include: {
      lignes: { select: { id: true, typeMug: true } },
      fichiers: { where: { categorie: 'VISUEL' }, select: { ligneId: true } },
      impressions: { select: { id: true, ligneId: true, fichierId: true, lot: true, statut: true } },
    },
  });
  if (!commande || commande.supprime || commande.statut !== 'En attente') return;

  const accessoires = await typesNonComptes();
  // Comme pour « À compléter » (manquesDeCommande) : une ligne de mugs sans visuel reste
  // à imprimer, sauf si des visuels non rattachés à une ligne peuvent la couvrir.
  const couvertes = new Set(commande.fichiers.map((f) => f.ligneId));
  const aImprimer = commande.lignes.filter((l) => !accessoires.has((l.typeMug || '').trim().toUpperCase())
    && (couvertes.has(l.id) || !couvertes.has(null)));
  const imprimees = new Set(commande.impressions.filter((i) => i.statut === 'IMPRIME').map((i) => i.ligneId));
  const retenues = new Set(commande.impressions.filter((i) => retientSaLigne(i, commande.impressions)).map((i) => i.ligneId));
  // Visuels au niveau de la commande (sans ligne) : un visuel imprimé suffit.
  const complete = aImprimer.length > 0
    ? aImprimer.every((l) => imprimees.has(l.id) && !retenues.has(l.id))
    : imprimees.size > 0 && retenues.size === 0;
  if (complete) await updateCommande(commande.id, { statut: 'Impression OK' }, userId);
}

// Annulation par un utilisateur. Si le visuel est déjà dans Edge Print,
// le travail doit aussi y être supprimé (l'agent n'y touche pas).
export async function annuler(id, user) {
  const envoi = await trouverEnvoi(id);
  if (!['EN_FILE', 'ENVOYE', 'ERREUR'].includes(envoi.statut)) throw httpError(400, 'Cet envoi ne peut plus être annulé.');
  const maj = await prisma.impression.update({
    where: { id: envoi.id },
    data: { statut: 'ANNULE', message: texteCourt(`Annulé par ${user.nom}`) },
  });
  await addLog({
    action: LOG_ACTIONS.IMPRESSION_ANNULEE,
    detail: `Impression de « ${envoi.fichierNom} » annulée`,
    userId: user.id,
    commandeId: envoi.commandeId,
  });
  return maj;
}

// Relance d'un envoi en erreur ou annulé : nouvel envoi identique (nouvel
// identifiant, pour que l'agent le dépose de nouveau dans Edge Print).
export async function relancer(id, user) {
  const envoi = await trouverEnvoi(id);
  if (!['ERREUR', 'ANNULE'].includes(envoi.statut)) throw httpError(400, 'Seul un envoi en erreur ou annulé peut être relancé.');
  const fichier = envoi.fichierId
    && await prisma.fichier.findUnique({ where: { id: envoi.fichierId }, select: { id: true } });
  if (!fichier) throw httpError(400, 'Le visuel n’existe plus : renvoyez-le depuis la commande.');
  const [nouveau] = await creerEnvoi(
    { imprimante: envoi.imprimante, elements: [{ fichierId: envoi.fichierId, quantite: envoi.quantite }] },
    user,
  );
  return nouveau;
}

// Fin d'impression signalée à la main (agent arrêté, ou fin non détectée).
export async function marquerImprime(id, user) {
  const envoi = await trouverEnvoi(id);
  if (!['EN_FILE', 'ENVOYE', 'ERREUR'].includes(envoi.statut)) throw httpError(400, 'Cet envoi est déjà imprimé ou annulé.');
  const maj = await prisma.impression.update({
    where: { id: envoi.id },
    data: { statut: 'IMPRIME', imprimeAt: new Date(), message: texteCourt(`Marqué imprimé par ${user.nom}`) },
  });
  await apresImpression(maj, user.id);
  return maj;
}

// ── Agent d'impression (PC atelier) ──────────────────────────

// Signe de vie, à chaque passage de l'agent : poste, version, imprimantes.
export async function battement({ poste, version, imprimantes } = {}) {
  const nom = texteCourt(poste, 60) || 'PC atelier';
  const liste = (Array.isArray(imprimantes) ? imprimantes : [])
    .filter((p) => IMPRIMANTES.includes(p?.code))
    .map((p) => ({ code: p.code, libelle: texteCourt(p.libelle, 60) || p.code }));
  const data = { version: texteCourt(version, 30), imprimantes: JSON.stringify(liste), derniereVue: new Date() };
  await prisma.posteImpression.upsert({ where: { nom }, create: { nom, ...data }, update: data });
}

// Travaux de l'agent : envois à déposer (EN_FILE) ou à surveiller (ENVOYE).
export async function travauxPourAgent() {
  const envois = await prisma.impression.findMany({
    where: { statut: { in: STATUTS_ACTIFS } },
    // Un lot est créé d'un coup : l'identifiant garde l'ordre de la liste d'envoi.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
    include: { commande: { select: { reference: true, client: true } } },
  });
  const [fichiers, lignes] = await Promise.all([
    prisma.fichier.findMany({
      where: { id: { in: envois.map((e) => e.fichierId).filter(Boolean) } },
      select: { id: true, nom: true, taille: true, type: true },
    }),
    prisma.ligneCommande.findMany({
      where: { id: { in: envois.map((e) => e.ligneId).filter(Boolean) } },
      select: { id: true, visuel: true, ordre: true },
    }),
  ]);
  const fichierParId = new Map(fichiers.map((f) => [f.id, f]));
  const ligneParId = new Map(lignes.map((l) => [l.id, l]));
  return envois.map((e) => ({
    id: e.id,
    statut: e.statut,
    imprimante: e.imprimante,
    quantite: e.quantite,
    lot: e.lot,
    createdAt: e.createdAt,
    commande: e.commande,
    ligne: ligneParId.get(e.ligneId) || null,
    fichierNom: e.fichierNom,
    fichier: fichierParId.get(e.fichierId) || null,
  }));
}

// Visuel téléchargeable par l'agent : seulement s'il fait partie d'un envoi en cours.
export async function fichierPourAgent(fichierId) {
  const id = Number(fichierId);
  if (!Number.isInteger(id)) return null;
  const enCours = await prisma.impression.findFirst({
    where: { fichierId: id, statut: { in: STATUTS_ACTIFS } },
    select: { id: true },
  });
  if (!enCours) return null;
  return prisma.fichier.findUnique({ where: { id } });
}

// L'agent signale un changement : ENVOYE (déposé dans Edge Print), IMPRIME, ERREUR.
export async function etatParAgent(id, { etat, message } = {}) {
  if (!TRANSITIONS_AGENT[etat]) throw httpError(400, 'État inconnu.');
  const envoi = await trouverEnvoi(id);
  // Déjà dans cet état, ou annulé / imprimé entre-temps : rien à faire.
  if (!TRANSITIONS_AGENT[etat].includes(envoi.statut)) return envoi;

  const data = { statut: etat, message: texteCourt(message) };
  if (etat === 'ENVOYE') data.envoyeAt = new Date();
  if (etat === 'IMPRIME') data.imprimeAt = new Date();
  const maj = await prisma.impression.update({ where: { id: envoi.id }, data });

  if (etat === 'ERREUR') {
    await addLog({
      action: LOG_ACTIONS.IMPRESSION_ERREUR,
      detail: `Impression de « ${envoi.fichierNom} » en erreur : ${data.message || 'raison inconnue'}`,
      commandeId: envoi.commandeId,
    });
  }
  if (etat === 'IMPRIME') await apresImpression(maj, envoi.creeParId);
  return maj;
}
