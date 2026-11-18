// ─────────────────────────────────────────────────────────────
//  Expéditions d'une commande (18/11/2026). Trois départs possibles :
//   - ATELIER : étiquettes Chronopost imprimées toutes seules sur la Zebra de l'atelier
//     (agent du PC atelier, contrat de /api/print-jobs) ;
//   - ESAT : étiquettes Chronopost en PDF A4, à imprimer à l'ESAT depuis la fiche ;
//   - AUTRE : palette ou autre transporteur, étiquette reçue en PDF et importée.
//  Contrat Chronopost d'Objetlia (voir chronopost/reglages.js). Création et annulation : admins ;
//  l'ESAT voit les expéditions et télécharge les PDF.
// ─────────────────────────────────────────────────────────────
import { prisma } from '../prisma.js';
import { saveBuffer, readBuffer, deleteByKey, makeFilename } from '../storage.js';
import { addLog } from './log.service.js';
import { LOG_ACTIONS } from '../constants.js';
import {
  lireReglages, accesChronopost, accesContrat, adresseNette, adresseComplete, PRODUITS_CHRONOPOST,
  particulierPourClient, expediteurChoisi, memoriserParticulier,
} from './chronopost/reglages.js';
import { creerEtiquettes, annulerEtiquette, versZebra, assembler, texteChrono } from './chronopost/etiquettes.js';

export const DEPARTS = ['ATELIER', 'ESAT', 'AUTRE'];
const COLIS_MAX = 30;
const POIDS_MIN = 0.1;
const POIDS_MAX = 30; // kg par carton (Chrono 13)
const TAILLE_IMPORT_MAX = 4 * 1024 * 1024; // une requête Vercel ne dépasse pas 4,5 Mo
const NOMS_DEPART = { ATELIER: 'de l’atelier', ESAT: 'de l’ESAT' };

const erreur = (status, message) => Object.assign(new Error(message), { status });
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
// Hors de « commande_<id>/ », que le ménage des visuels efface 60 jours après l'expédition.
const dossier = (commandeId) => `expeditions/commande_${commandeId}`;

// Expéditions d'une commande, pour la fiche (sans chemins de stockage).
export async function expeditionsDeCommande(commandeId) {
  const liste = await prisma.expedition.findMany({
    where: { commandeId: Number(commandeId) },
    orderBy: { createdAt: 'desc' },
    include: { colis: { orderBy: { rang: 'asc' } } },
  });
  return liste.map(({ fichierChemin, destinataire, expediteur, colis, ...e }) => ({
    ...e,
    produitNom: e.produit ? (PRODUITS_CHRONOPOST[e.produit] || e.produit) : null,
    destinataire: lireJson(destinataire),
    expediteur: lireJson(expediteur),
    fichier: Boolean(fichierChemin),
    colis: colis.map(({ etiquetteChemin, ...c }) => c),
  }));
}

function lireJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

async function trouverCommande(commandeId) {
  const commande = await prisma.commande.findUnique({
    where: { id: Number(commandeId) },
    select: { id: true, reference: true, client: true, supprime: true },
  });
  if (!commande) throw erreur(404, 'Commande introuvable.');
  return commande;
}

async function trouverExpedition(commandeId, id) {
  const e = await prisma.expedition.findFirst({
    where: { id: Number(id), commandeId: Number(commandeId) },
    include: { colis: { orderBy: { rang: 'asc' } } },
  });
  if (!e) throw erreur(404, 'Expédition introuvable.');
  return e;
}

// ── Livraison de la commande : adresse et expéditeur, saisis à la création ou lus dans son PDF ──

// Expéditeur noté sur la commande : { id } (« atelier » ou un particulier), { id: 'commande', adresse }
// pour un expéditeur propre à cette commande, ou null (choisi d'après le client).
function lireExpediteurCommande(v) {
  if (!v) return null;
  if (String(v).startsWith('{')) {
    const adresse = lireJson(v);
    return adresse ? { id: 'commande', adresse } : null;
  }
  return { id: v };
}

export async function livraisonDeCommande(commandeId) {
  const l = await prisma.livraison.findUnique({ where: { commandeId: Number(commandeId) } });
  if (!l) return null;
  return {
    destinataire: lireJson(l.destinataire),
    expediteur: lireExpediteurCommande(l.expediteur),
    refClient: l.refClient,
    source: l.source,
    updatedAt: l.updatedAt,
  };
}

const adresseVide = (a) => !a || Object.entries(a).every(([k, v]) => k === 'pays' || !String(v ?? '').trim());
const paysNet = (p) => (!String(p || '').trim() || /^(FR|FRANCE)$/i.test(String(p).trim()) ? 'FR' : String(p).trim().toUpperCase().slice(0, 30));

// { destinataire?, expediteur?: null | 'atelier' | id d'un particulier | { adresse, memoriser }, refClient?, source? }.
// « memoriser » : l'expéditeur rejoint les expéditeurs particuliers, pour ce client (admins seulement).
export async function enregistrerLivraison(commandeId, corps, user) {
  const commande = await trouverCommande(commandeId);
  let destinataire = null;
  if (!adresseVide(corps?.destinataire)) {
    destinataire = { ...adresseNette(corps.destinataire), pays: paysNet(corps.destinataire.pays) };
    if (destinataire.pays === 'FR' && destinataire.cp && !/^\d{5}$/.test(destinataire.cp.replace(/\s/g, ''))) {
      throw erreur(400, 'Code postal de livraison : 5 chiffres.');
    }
  }
  let expediteur = null;
  let memorise = null;
  const e = corps?.expediteur;
  if (e && typeof e === 'object') {
    const adresse = { ...adresseNette(e.adresse), pays: paysNet(e.adresse?.pays) };
    if (!adresseComplete(adresse) || !adresse.telephone) throw erreur(400, 'Expéditeur : société, adresse, code postal, ville et téléphone.');
    if (e.memoriser) {
      if (user.role !== 'ADMIN') throw erreur(403, 'Seul un administrateur peut garder un expéditeur en mémoire.');
      expediteur = await memoriserParticulier(adresse, commande.client);
      memorise = adresse.nom;
    } else {
      expediteur = JSON.stringify(adresse);
    }
  } else if (e === 'atelier') {
    expediteur = 'atelier';
  } else if (typeof e === 'string' && e) {
    const r = await lireReglages();
    if (!r.expediteurs.particuliers.some((p) => p.id === e)) throw erreur(400, 'Expéditeur inconnu : rechargez la page.');
    expediteur = e;
  }
  const data = {
    destinataire: destinataire ? JSON.stringify(destinataire) : null,
    expediteur,
    refClient: String(corps?.refClient ?? '').trim().slice(0, 60) || null,
    source: String(corps?.source ?? '').trim().slice(0, 200) || null,
  };
  const avant = await prisma.livraison.findUnique({ where: { commandeId: commande.id } });
  if (Object.values(data).every((v) => v == null)) {
    if (avant) await prisma.livraison.delete({ where: { commandeId: commande.id } });
    return null;
  }
  const inchange = avant && Object.keys(data).every((k) => (avant[k] ?? null) === data[k]);
  if (!inchange) {
    await prisma.livraison.upsert({ where: { commandeId: commande.id }, create: { commandeId: commande.id, ...data }, update: data });
    await addLog({
      action: LOG_ACTIONS.LIVRAISON_MODIFIEE,
      detail: `Livraison : ${destinataire ? `${destinataire.nom}, ${destinataire.cp} ${destinataire.ville}`.trim() : 'sans adresse'}`
        + `${data.source ? ` (lue dans ${data.source})` : ''}${memorise ? ` · expéditeur ${memorise} gardé en mémoire` : ''}`,
      userId: user.id,
      commandeId: commande.id,
    });
  }
  return livraisonDeCommande(commande.id);
}

// Préremplissage de la fenêtre d'étiquette : adresse de livraison de la commande, sinon celle de la
// dernière étiquette Chronopost du même client ; expéditeur noté sur la commande, sinon l'expéditeur
// particulier de ce client (ex. OBJETRAMA), sinon l'atelier.
export async function preparation(commandeId) {
  const commande = await trouverCommande(commandeId);
  const [e, r, liv] = await Promise.all([
    prisma.expedition.findFirst({
      where: { transporteur: 'Chronopost', destinataire: { not: null }, commande: { client: commande.client } },
      orderBy: { createdAt: 'desc' },
      select: { destinataire: true },
    }),
    lireReglages(),
    livraisonDeCommande(commande.id),
  ]);
  const deLaCommande = !adresseVide(liv?.destinataire) ? liv.destinataire : null;
  const note = liv?.expediteur?.id;
  const noteValable = note === 'atelier' || note === 'commande' || r.expediteurs.particuliers.some((p) => p.id === note);
  return {
    destinataire: deLaCommande || lireJson(e?.destinataire) || { ...adresseNette({}), nom: commande.client },
    depuisCommande: Boolean(deLaCommande),
    expediteur: (noteValable && note) || particulierPourClient(r, commande.client)?.id || 'atelier',
    expediteurCommande: note === 'commande' ? liv.expediteur.adresse : null,
  };
}

// Une seule création à la fois par commande (double clic = une seule étiquette).
const enCours = new Set();

// Étiquettes Chronopost : { depart: 'ATELIER' | 'ESAT', destinataire, colis: [poids en kg], reference?,
// expediteur? ('atelier' ou id d'un particulier ; absent : choisi d'après le client) }. Le départ ne
// change que l'impression (Zebra ou PDF) : l'ESAT n'est jamais l'expéditeur.
export async function creerChronopost(commandeId, corps, user) {
  const commande = await trouverCommande(commandeId);
  if (commande.supprime) throw erreur(400, 'Commande à la corbeille : pas d’étiquette.');
  const depart = ['ATELIER', 'ESAT'].includes(corps?.depart) ? corps.depart : null;
  if (!depart) throw erreur(400, 'Choisissez le départ : atelier ou ESAT.');

  const poids = Array.isArray(corps?.colis) ? corps.colis.map((p) => Math.round(Number(String(p).replace(',', '.')) * 100) / 100) : [];
  if (poids.length < 1 || poids.length > COLIS_MAX) throw erreur(400, `De 1 à ${COLIS_MAX} cartons par étiquette.`);
  if (poids.some((p) => !Number.isFinite(p) || p < POIDS_MIN || p > POIDS_MAX)) {
    throw erreur(400, `Poids de chaque carton : de ${String(POIDS_MIN).replace('.', ',')} à ${POIDS_MAX} kg.`);
  }
  const destinataire = adresseNette(corps?.destinataire);
  destinataire.pays = (destinataire.pays || 'FR').toUpperCase();
  if (!adresseComplete(destinataire)) throw erreur(400, 'Adresse du destinataire incomplète : nom, rue, code postal et ville.');
  if (destinataire.pays !== 'FR') throw erreur(400, 'Chronopost depuis le suivi : livraisons en France seulement.');
  if (!/^\d{5}$/.test(destinataire.cp.replace(/\s/g, ''))) throw erreur(400, 'Code postal du destinataire : 5 chiffres.');

  const r = await lireReglages();
  const acces = await accesChronopost(r);
  const titulaire = r.expediteurs.atelier;
  // Expéditeur demandé, sinon celui noté sur la commande, sinon d'après le client.
  const liv = await livraisonDeCommande(commande.id);
  const demande = corps?.expediteur || liv?.expediteur?.id || null;
  const choix = demande === 'commande'
    ? (liv?.expediteur?.id === 'commande' ? { id: 'commande', adresse: liv.expediteur.adresse } : null)
    : expediteurChoisi(r, demande, commande.client);
  if (!choix) throw erreur(400, 'Expéditeur inconnu : rechargez la page.');
  const expediteur = choix.adresse;
  const aVerifier = [[titulaire, 'de l’atelier']];
  if (choix.id !== 'atelier') aVerifier.push([expediteur, `de l’expéditeur « ${expediteur.nom || 'sans nom'} »`]);
  for (const [a, nom] of aVerifier) {
    if (!adresseComplete(a) || !a.telephone) {
      throw erreur(409, `Adresse ${nom} à compléter (nom, rue, code postal, ville, téléphone) dans Administration › Chronopost.`);
    }
  }
  const reference = texteChrono(corps?.reference || commande.reference) || commande.reference;

  if (enCours.has(commande.id)) throw erreur(409, 'Étiquette déjà en cours de création pour cette commande : patientez quelques secondes.');
  enCours.add(commande.id);
  try {
    const etiquettes = await creerEtiquettes({
      reference, destinataire, poids, expediteur, titulaire, produit: r.produit, acces,
      mode: depart === 'ATELIER' ? 'THE' : 'PDF',
    });
    const suivis = etiquettes.map((e) => e.suivi);
    // Les étiquettes existent chez Chronopost dès sa réponse : en cas d'échec ici, on donne les
    // numéros de suivi au lieu de laisser recommencer (ce qui en créerait d'autres).
    try {
      const colis = [];
      for (const [i, e] of etiquettes.entries()) {
        const { key } = await saveBuffer(e.pdf, { subdir: dossier(commande.id), filename: `${e.suivi}.pdf`, contentType: 'application/pdf' });
        colis.push({ rang: i + 1, suivi: e.suivi, poids: poids[i], etiquetteChemin: key, impression: depart === 'ATELIER' ? 'EN_FILE' : null });
      }
      const expedition = await prisma.expedition.create({
        data: {
          commandeId: commande.id, depart, transporteur: 'Chronopost', produit: r.produit, essai: acces.essai, reference,
          nbColis: poids.length, destinataire: JSON.stringify(destinataire),
          expediteur: JSON.stringify({ id: choix.id, nom: expediteur.nom, cp: expediteur.cp, ville: expediteur.ville }),
          creeParId: user.id, creeParNom: user.nom,
          colis: { create: colis },
        },
      });
      await addLog({
        action: LOG_ACTIONS.EXPEDITION_CREEE,
        detail: `Étiquette${poids.length > 1 ? 's' : ''} Chronopost${acces.essai ? ' d’essai (SPECIMEN)' : ''} : ${pluriel(poids.length, 'carton')} au départ ${NOMS_DEPART[depart]}${depart === 'ATELIER' ? ' (Zebra)' : ' (PDF)'}${choix.id !== 'atelier' ? `, expéditeur ${expediteur.nom}` : ''} · ${suivis.join(', ')}`,
        userId: user.id,
        commandeId: commande.id,
      });
      return expedition;
    } catch (e) {
      console.error('Étiquettes Chronopost créées mais non enregistrées', { commandeId: commande.id, suivis, message: e.message });
      throw erreur(502, `Étiquettes créées chez Chronopost (suivi ${suivis.join(', ')}) mais pas enregistrées ici : ne recommencez pas, notez ces numéros.`);
    }
  } finally {
    enCours.delete(commande.id);
  }
}

// Étiquette d'un autre transporteur (palette…) reçue en PDF.
export async function importerEtiquette(commandeId, corps, fichier, user) {
  const commande = await trouverCommande(commandeId);
  if (commande.supprime) throw erreur(400, 'Commande à la corbeille.');
  if (!fichier) throw erreur(400, 'Ajoutez l’étiquette en PDF.');
  if (fichier.size > TAILLE_IMPORT_MAX) throw erreur(400, 'PDF trop lourd (4 Mo au plus).');
  if (fichier.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw erreur(400, 'Le fichier n’est pas un PDF.');
  const transporteur = String(corps?.transporteur || '').trim().slice(0, 60) || 'Palette';
  const nbColis = Math.min(999, Math.max(1, Number.parseInt(corps?.nbColis, 10) || 1));
  const suivi = String(corps?.suivi || '').trim().slice(0, 60) || null;
  const { key } = await saveBuffer(fichier.buffer, {
    subdir: dossier(commande.id), filename: makeFilename(fichier.originalname || 'etiquette.pdf'), contentType: 'application/pdf',
  });
  const expedition = await prisma.expedition.create({
    data: {
      commandeId: commande.id, depart: 'AUTRE', transporteur, nbColis, suivi, fichierChemin: key,
      fichierNom: String(fichier.originalname || 'etiquette.pdf').slice(0, 200), creeParId: user.id, creeParNom: user.nom,
    },
  });
  await addLog({
    action: LOG_ACTIONS.ETIQUETTE_IMPORTEE,
    detail: `Étiquette ${transporteur} importée (${nbColis} colis)${suivi ? ` · ${suivi}` : ''}`,
    userId: user.id,
    commandeId: commande.id,
  });
  return expedition;
}

// Annulation. Chronopost : chaque carton pas encore pris en charge ; ceux que Chronopost refuse
// restent actifs (motif renvoyé). Étiquette importée : retirée.
export async function annuler(commandeId, id, user) {
  const e = await trouverExpedition(commandeId, id);
  if (e.statut === 'ANNULEE') throw erreur(400, 'Expédition déjà annulée.');
  const fin = { statut: 'ANNULEE', annuleAt: new Date(), annuleParNom: user.nom };

  if (e.depart === 'AUTRE') {
    if (e.fichierChemin) await deleteByKey(e.fichierChemin);
    await prisma.expedition.update({ where: { id: e.id }, data: { ...fin, fichierChemin: null } });
    await addLog({ action: LOG_ACTIONS.EXPEDITION_ANNULEE, detail: `Étiquette ${e.transporteur} retirée`, userId: user.id, commandeId: e.commandeId });
    return { annules: e.nbColis, refus: [] };
  }

  // Étiquette d'essai (« SPECIMEN ») : inconnue du suivi de Chronopost, rien à y annuler.
  const acces = e.essai ? null : await accesContrat(await lireReglages());
  const actifs = e.colis.filter((c) => !c.annuleAt);
  const annules = [];
  const refus = [];
  for (const c of actifs) {
    try {
      if (acces) await annulerEtiquette(c.suivi, acces);
      annules.push(c);
      await prisma.colis.update({ where: { id: c.id }, data: { annuleAt: new Date(), impression: null } });
    } catch (err) {
      refus.push(`${c.suivi} : ${err.message}`);
    }
  }
  if (annules.length === actifs.length) await prisma.expedition.update({ where: { id: e.id }, data: fin });
  if (annules.length) {
    await addLog({
      action: LOG_ACTIONS.EXPEDITION_ANNULEE,
      detail: `Étiquette${annules.length > 1 ? 's' : ''} Chronopost annulée${annules.length > 1 ? 's' : ''} : ${annules.map((c) => c.suivi).join(', ')}`,
      userId: user.id,
      commandeId: e.commandeId,
    });
  }
  if (refus.length) {
    throw erreur(409, `Chronopost refuse d’annuler ${refus.length > 1 ? 'ces cartons' : 'ce carton'} (déjà pris en charge ?) — ${refus.join(' · ')}`);
  }
  return { annules: annules.length, refus };
}

// PDF à imprimer : toutes les étiquettes encore valables (Chronopost), ou le PDF importé.
export async function pdfExpedition(commandeId, id) {
  const e = await trouverExpedition(commandeId, id);
  const commande = await trouverCommande(commandeId);
  if (e.depart === 'AUTRE') {
    if (!e.fichierChemin) throw erreur(404, 'Étiquette retirée.');
    return { pdf: await readBuffer({ key: e.fichierChemin }), nom: e.fichierNom || `Etiquette-${commande.reference}.pdf` };
  }
  const colis = e.colis.filter((c) => !c.annuleAt);
  if (!colis.length) throw erreur(404, 'Toutes les étiquettes de cette expédition sont annulées.');
  const pdfs = [];
  for (const c of colis) pdfs.push(await readBuffer({ key: c.etiquetteChemin }));
  return { pdf: await assembler(pdfs), nom: `Chronopost-${commande.reference}${e.essai ? '-ESSAI' : ''}.pdf` };
}

// Renvoie les étiquettes (départ atelier) sur la Zebra.
export async function reimprimer(commandeId, id, user) {
  const e = await trouverExpedition(commandeId, id);
  if (e.depart !== 'ATELIER' || e.statut !== 'CREEE') throw erreur(400, 'Seules les étiquettes de l’atelier encore valables partent sur la Zebra.');
  const { count } = await prisma.colis.updateMany({
    where: { expeditionId: e.id, annuleAt: null },
    data: { impression: 'EN_FILE', message: null, imprimeAt: null },
  });
  await addLog({ action: LOG_ACTIONS.ETIQUETTES_RENVOYEES, detail: `Étiquettes Chronopost renvoyées sur la Zebra (${pluriel(count, 'carton')})`, userId: user.id, commandeId: e.commandeId });
  return count;
}

// ── Agent de la Zebra (PC atelier) : même contrat que l'atelier Objetlia et Transfert Club ──
// GET /api/print-jobs → [{ id, orderId, parcelId }] ; GET /:id/pdf ; POST /:id/done ; POST /:id/error.

export async function travauxZebra() {
  const colis = await prisma.colis.findMany({
    where: { impression: 'EN_FILE', annuleAt: null, expedition: { statut: 'CREEE', depart: 'ATELIER' } },
    orderBy: [{ createdAt: 'asc' }, { rang: 'asc' }],
    take: 20,
    include: { expedition: { select: { nbColis: true, commande: { select: { reference: true } } } } },
  });
  return colis.map((c) => ({
    id: String(c.id),
    orderId: c.expedition.commande.reference,
    parcelId: `${c.suivi} (${c.rang}/${c.expedition.nbColis})`,
  }));
}

async function colisEnFile(id) {
  const c = await prisma.colis.findUnique({ where: { id: Number(id) } });
  if (!c || c.annuleAt) throw erreur(404, 'Étiquette introuvable ou annulée.');
  return c;
}

export async function pdfZebra(id) {
  const c = await colisEnFile(id);
  return versZebra(await readBuffer({ key: c.etiquetteChemin }));
}

export async function zebraFaite(id) {
  const c = await colisEnFile(id);
  await prisma.colis.update({ where: { id: c.id }, data: { impression: 'IMPRIME', imprimeAt: new Date(), message: null } });
}

export async function zebraErreur(id, detail) {
  const c = await colisEnFile(id);
  await prisma.colis.update({ where: { id: c.id }, data: { impression: 'ERREUR', message: String(detail || 'Erreur d’impression').slice(0, 300) } });
}
