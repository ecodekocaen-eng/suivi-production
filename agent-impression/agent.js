// ─────────────────────────────────────────────────────────────
//  Agent d'impression du PC atelier (Eco'deko).
//  Pendant les heures d'atelier, toutes les quelques secondes :
//   1. signe de vie au serveur et liste des transferts à imprimer ;
//   2. téléchargement et dépôt dans les dossiers surveillés d'Edge Print ;
//   3. lecture (seule) de la base d'Edge Print : la fin d'impression est
//      signalée, et la commande passe en « Impression OK » côté serveur.
//  En dehors des heures d'atelier, l'agent ne contacte pas le serveur.
//
//  Usage : node agent.js [--config chemin\config.json] [--une-fois]
//  Le journal des dépôts (journal.json) et agent.log vivent à côté du fichier
//  de configuration.
// ─────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { decouper, deposer } from './depot.js';
import { lireTravauxAgent, estImprime, finImpression } from './edgeprint.js';

const VERSION = '1.0.2';
// Numéro affiché dans l'outil de suivi ; les codes A et B servent à la configuration.
const NUMEROS = { A: 1, B: 2 };
// « fetch failed » ne dit rien : on y ajoute la cause réseau (DNS, délai dépassé, coupure…).
const motif = (err) => [err.message, err.cause?.code ?? err.cause?.message].filter(Boolean).join(' : ');
const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const UNE_FOIS = args.includes('--une-fois');
const CHEMIN_CONFIG = path.resolve(args.includes('--config') ? args[args.indexOf('--config') + 1] : path.join(ICI, 'config.json'));
const DOSSIER = path.dirname(CHEMIN_CONFIG);
const FICHIER_JOURNAL = path.join(DOSSIER, 'journal.json');
const FICHIER_LOG = path.join(DOSSIER, 'agent.log');

// Échecs de téléchargement tolérés avant de signaler une erreur.
const ESSAIS_MAX = 3;
// Après un dépôt : délai au-delà duquel un travail absent d'Edge Print est signalé.
const DELAI_INTROUVABLE_MS = 6 * 3600 * 1000;
// Pause après une erreur de réseau ou de serveur.
const PAUSE_ERREUR_MS = 60 * 1000;
// Dépôts gardés dans le journal (pour ne jamais redéposer un envoi).
const CONSERVATION_JOURNAL_MS = 60 * 24 * 3600 * 1000;
const EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'];
const EXTENSION_PAR_TYPE = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/tiff': '.tif' };

// ── Journal d'activité : console + agent.log (limité à 2 Mo, puis agent.log.1) ──
function log(message) {
  const ligne = `${new Date().toLocaleString('fr-FR')}  ${message}`;
  console.log(ligne);
  try {
    if (fs.existsSync(FICHIER_LOG) && fs.statSync(FICHIER_LOG).size > 2 * 1024 * 1024) fs.renameSync(FICHIER_LOG, `${FICHIER_LOG}.1`);
    fs.appendFileSync(FICHIER_LOG, `${ligne}\n`);
  } catch { /* journal indisponible : la console suffit */ }
}

// ── Configuration ──
function chargerConfig() {
  const cfg = JSON.parse(fs.readFileSync(CHEMIN_CONFIG, 'utf8').replace(/^\uFEFF/, ''));
  if (!/^https?:\/\//.test(cfg.serveur || '')) throw new Error('« serveur » doit être une adresse http(s).');
  if (!cfg.jeton || cfg.jeton.length < 32) throw new Error('« jeton » manquant : IMPRESSION_AGENT_TOKEN, 32 caractères au moins.');
  const imprimantes = Object.entries(cfg.imprimantes || {});
  if (imprimantes.length === 0) throw new Error('Aucune imprimante configurée.');
  for (const [code, imp] of imprimantes) {
    if (!['A', 'B'].includes(code)) throw new Error(`Imprimante « ${code} » inconnue (A ou B).`);
    if (!imp.dossiers?.some((d) => d.copies === 1)) throw new Error(`Imprimante ${code} : il faut un dossier « copies : 1 ».`);
  }
  return {
    poste: 'PC atelier',
    intervalleSecondes: 15,
    intervalleEdgePrintSecondes: 60,
    edgePrintDb: 'C:\\ProgramData\\EPSON\\Epson Edge Print\\DB\\Data.db',
    dossierTravail: path.join(DOSSIER, 'travail'),
    ...cfg,
    serveur: cfg.serveur.replace(/\/+$/, ''),
  };
}

// Heures d'atelier ({ jours: [1..6], debut: "07:00", fin: "19:00" }, 0 = dimanche).
function estActif(maintenant, plages) {
  if (!plages) return true;
  if (!(plages.jours || [1, 2, 3, 4, 5]).includes(maintenant.getDay())) return false;
  const enMinutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
  return minutes >= enMinutes(plages.debut || '00:00') && minutes < enMinutes(plages.fin || '24:00');
}

const attendre = (ms) => new Promise((r) => { setTimeout(r, ms); });

// ── Dialogue avec le serveur (jeton dédié) ──
async function appel(cfg, methode, chemin, corps) {
  const res = await fetch(`${cfg.serveur}/api/agent${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${cfg.jeton}`, 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const texte = await res.text().catch(() => '');
    throw new Error(`serveur ${res.status} ${texte.slice(0, 200)}`);
  }
  return res.json();
}

async function telecharger(cfg, fichierId, destination) {
  const res = await fetch(`${cfg.serveur}/api/agent/impression/fichiers/${fichierId}`, {
    headers: { Authorization: `Bearer ${cfg.jeton}` },
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`téléchargement refusé (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destination));
}

const signaler = (cfg, id, etat, message) => appel(cfg, 'POST', `/impression/travaux/${id}/etat`, { etat, message });

// ── Journal des dépôts : évite tout double dépôt, même après un redémarrage ──
function lireJournal() {
  try { return JSON.parse(fs.readFileSync(FICHIER_JOURNAL, 'utf8')); } catch { return {}; }
}
function ecrireJournal(journal) {
  const limite = Date.now() - CONSERVATION_JOURNAL_MS;
  for (const [id, e] of Object.entries(journal)) if (new Date(e.depose).getTime() < limite) delete journal[id];
  fs.writeFileSync(`${FICHIER_JOURNAL}.tmp`, JSON.stringify(journal, null, 2));
  fs.renameSync(`${FICHIER_JOURNAL}.tmp`, FICHIER_JOURNAL);
}

// « 1 fichier × 10 + 2 fichiers × 1 »
function resume(fichiers) {
  const parCopies = new Map();
  for (const f of fichiers) parCopies.set(f.copies, (parCopies.get(f.copies) || 0) + 1);
  return [...parCopies].sort((a, b) => b[0] - a[0])
    .map(([copies, n]) => `${n} fichier${n > 1 ? 's' : ''} × ${copies}`).join(' + ');
}

function extensionDe(fichier) {
  const ext = path.extname(fichier.nom || '').toLowerCase();
  return EXTENSIONS.includes(ext) ? ext : (EXTENSION_PAR_TYPE[fichier.type] || '');
}

async function erreur(cfg, travail, message) {
  log(`Envoi #${travail.id} (${travail.commande.reference}) en erreur : ${message}`);
  await signaler(cfg, travail.id, 'ERREUR', message);
}

// ── Nouveaux envois : téléchargement puis dépôt dans Edge Print ──
const echecsTelechargement = new Map();

async function deposerEnvoi(cfg, journal, t) {
  const deja = journal[t.id];
  if (deja?.fichiers?.length) {
    // Déjà déposé (redémarrage, ou signalement perdu) : on le signale de nouveau, sans redéposer.
    await signaler(cfg, t.id, 'ENVOYE', `Déposé dans Edge Print (imprimante ${NUMEROS[deja.imprimante]}) : ${resume(deja.fichiers)}`);
    return;
  }
  const imprimante = cfg.imprimantes[t.imprimante];
  if (!imprimante) return erreur(cfg, t, `Imprimante ${NUMEROS[t.imprimante]} non configurée sur le PC atelier.`);
  if (!t.fichier) return erreur(cfg, t, 'Visuel introuvable sur le serveur (supprimé ?).');
  const extension = extensionDe(t.fichier);
  if (!extension) return erreur(cfg, t, `Type de fichier non pris en charge par l'agent (${t.fichier.type}).`);
  const manquant = imprimante.dossiers.find((d) => !fs.existsSync(d.chemin));
  if (manquant) return erreur(cfg, t, `Dossier surveillé introuvable sur le PC atelier : ${manquant.chemin}`);
  const plan = decouper(t.quantite, imprimante.dossiers);

  const source = path.join(cfg.dossierTravail, `telechargement-${t.id}${extension}`);
  try {
    await telecharger(cfg, t.fichier.id, source);
  } catch (err) {
    const n = (echecsTelechargement.get(t.id) || 0) + 1;
    echecsTelechargement.set(t.id, n);
    if (n >= ESSAIS_MAX) return erreur(cfg, t, `Téléchargement impossible : ${err.message}`);
    log(`Envoi #${t.id} : téléchargement à réessayer (${n}/${ESSAIS_MAX}) : ${motif(err)}`);
    return undefined;
  }
  echecsTelechargement.delete(t.id);

  let fichiers;
  try {
    fichiers = deposer(source, t, plan, extension, cfg.dossierTravail);
  } catch (err) {
    if (err.deposes?.length) {
      journal[t.id] = { depose: new Date().toISOString(), imprimante: t.imprimante, commande: t.commande.reference, fichiers: err.deposes };
      ecrireJournal(journal);
    }
    return erreur(cfg, t, `Dépôt incomplet dans Edge Print : ${err.message}`);
  } finally {
    fs.rmSync(source, { force: true });
  }
  journal[t.id] = { depose: new Date().toISOString(), imprimante: t.imprimante, commande: t.commande.reference, fichiers };
  ecrireJournal(journal);
  const detail = resume(fichiers);
  log(`Envoi #${t.id} (${t.commande.reference}, « ${t.fichierNom} » × ${t.quantite}) déposé sur l'imprimante ${NUMEROS[t.imprimante]} : ${detail}`);
  await signaler(cfg, t.id, 'ENVOYE', `Déposé dans Edge Print (imprimante ${NUMEROS[t.imprimante]}) : ${detail}`);
  return undefined;
}

// ── Envois déposés : imprimés ? (lecture de la base d'Edge Print) ──
function etatsImpression(cfg, journal, envoyes) {
  let travauxEdge;
  try {
    travauxEdge = lireTravauxAgent(cfg.edgePrintDb, cfg.dossierTravail);
  } catch (err) {
    log(`Lecture de la base Edge Print impossible : ${err.message}`);
    return [];
  }
  const resultats = [];
  for (const t of envoyes) {
    const entree = journal[t.id];
    if (!entree?.fichiers?.length) continue; // déposé ailleurs : rien à surveiller ici
    const suivis = entree.fichiers.map((f) => ({ f, travail: travauxEdge.find((j) => (j.fichier || '').includes(f.marqueur)) }));
    if (suivis.every(({ travail }) => travail && estImprime(travail))) {
      const fin = suivis.map(({ travail }) => finImpression(travail)).filter(Boolean).pop();
      resultats.push({ id: t.id, etat: 'IMPRIME', message: `Imprimé dans Edge Print${fin ? ` (fin : ${fin})` : ''}` });
      continue;
    }
    // Ni dans Edge Print ni dans le dossier surveillé, longtemps après le dépôt : travail supprimé ?
    const disparus = suivis.filter(({ f, travail }) => !travail && !fs.existsSync(path.join(f.dossier, f.nom)));
    if (disparus.length && Date.now() - new Date(entree.depose).getTime() > DELAI_INTROUVABLE_MS) {
      resultats.push({ id: t.id, etat: 'ERREUR', message: `${disparus.length} fichier(s) introuvable(s) dans Edge Print : travail supprimé ?` });
    }
  }
  return resultats;
}

// ── Un passage complet ──
let derniereLectureEdge = 0;

async function tour(cfg) {
  const journal = lireJournal();
  const { travaux } = await appel(cfg, 'POST', '/impression/synchro', {
    poste: cfg.poste,
    version: VERSION,
    imprimantes: Object.entries(cfg.imprimantes).map(([code, imp]) => ({ code, libelle: imp.libelle || code })),
  });
  for (const t of travaux.filter((x) => x.statut === 'EN_FILE')) {
    try {
      await deposerEnvoi(cfg, journal, t);
    } catch (err) {
      log(`Envoi #${t.id} : ${motif(err)}`);
    }
  }
  // Base d'Edge Print : lue seulement si un envoi attend, et pas à chaque passage.
  const envoyes = travaux.filter((x) => x.statut === 'ENVOYE');
  if (envoyes.length === 0 || Date.now() - derniereLectureEdge < cfg.intervalleEdgePrintSecondes * 1000) return;
  derniereLectureEdge = Date.now();
  for (const r of etatsImpression(cfg, journal, envoyes)) {
    await signaler(cfg, r.id, r.etat, r.message);
    log(`Envoi #${r.id} : ${r.etat === 'IMPRIME' ? 'imprimé' : 'erreur'} (${r.message})`);
  }
}

async function main() {
  const cfg = chargerConfig();
  fs.mkdirSync(cfg.dossierTravail, { recursive: true });
  log(`Agent d'impression ${VERSION} (${cfg.poste}) → ${cfg.serveur}`);
  if (UNE_FOIS) {
    await tour(cfg);
    return;
  }
  let enPause = false;
  for (;;) {
    if (!estActif(new Date(), cfg.heuresActives)) {
      if (!enPause) log('Hors des heures d’atelier : en pause.');
      enPause = true;
      await attendre(60 * 1000);
      continue;
    }
    if (enPause) log('Heures d’atelier : reprise.');
    enPause = false;
    try {
      await tour(cfg);
      await attendre(cfg.intervalleSecondes * 1000);
    } catch (err) {
      log(`Erreur : ${motif(err)} (nouvel essai dans 1 min)`);
      await attendre(PAUSE_ERREUR_MS);
    }
  }
}

main().catch((err) => {
  log(`Arrêt de l'agent : ${err.message}`);
  process.exitCode = 1;
});
