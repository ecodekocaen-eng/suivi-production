// ─────────────────────────────────────────────────────────────
//  Contrôleur des expéditions : étiquettes d'une commande (fiche), réglages
//  Chronopost (admins) et file de la Zebra (agent du PC atelier).
// ─────────────────────────────────────────────────────────────
import * as service from '../services/expeditions.service.js';
import * as reglages from '../services/chronopost/reglages.js';
import { prixChronopost } from '../services/chronopost/etiquettes.js';

const erreur = (status, message) => Object.assign(new Error(message), { status });

// ── Fiche commande ────────────────────────────────────────────

// Préremplissage de la fenêtre : dernière adresse du client, expéditeur proposé pour ce client.
export async function destinataire(req, res) {
  res.json(await service.preparation(req.params.id));
}

export async function creerChronopost(req, res) {
  res.status(201).json({ expedition: await service.creerChronopost(req.params.id, req.body, req.user) });
}

export async function importer(req, res) {
  res.status(201).json({ expedition: await service.importerEtiquette(req.params.id, req.body, req.file, req.user) });
}

export async function pdf(req, res) {
  const { pdf: contenu, nom } = await service.pdfExpedition(req.params.id, req.params.eid);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(nom)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(contenu);
}

export async function annuler(req, res) {
  res.json(await service.annuler(req.params.id, req.params.eid, req.user));
}

export async function reimprimer(req, res) {
  res.json({ colis: await service.reimprimer(req.params.id, req.params.eid, req.user) });
}

// ── Réglages Chronopost (admins) ──────────────────────────────

async function etatReglages() {
  const [r, mdp, cle, vu] = await Promise.all([
    reglages.lireReglages(), reglages.motDePasse(), reglages.cleAgentConfiguree(), reglages.dernierPassageAgent(),
  ]);
  return { reglages: r, motDePasse: Boolean(mdp), produits: reglages.PRODUITS_CHRONOPOST, agent: { cle, vu } };
}

export async function lireReglages(req, res) {
  res.json(await etatReglages());
}

// { etat, compte, sousCompte, produit, expediteurs: { atelier, particuliers: [{ id?, clients, …adresse }] },
// motDePasse? }. Un nouveau mot de passe n'est gardé qu'une fois accepté par Chronopost (calcul d'un
// prix, rien n'est créé).
export async function enregistrerReglages(req, res) {
  const b = req.body || {};
  const actuels = await reglages.lireReglages();
  const maj = {};
  if (b.etat !== undefined) {
    if (!reglages.ETATS_CHRONOPOST.includes(b.etat)) throw erreur(400, 'Mode inconnu.');
    maj.etat = b.etat;
  }
  if (b.compte !== undefined) {
    const compte = String(b.compte).replace(/\s/g, '');
    if (compte && !/^\d{8}$/.test(compte)) throw erreur(400, 'Numéro de compte Chronopost : 8 chiffres.');
    maj.compte = compte;
  }
  if (b.sousCompte !== undefined) maj.sousCompte = String(b.sousCompte).replace(/\s/g, '').slice(0, 10);
  if (b.produit !== undefined) {
    if (!reglages.PRODUITS_CHRONOPOST[b.produit]) throw erreur(400, 'Produit Chronopost inconnu.');
    maj.produit = b.produit;
  }
  if (b.expediteurs !== undefined) {
    const liste = Array.isArray(b.expediteurs?.particuliers) ? b.expediteurs.particuliers : actuels.expediteurs.particuliers;
    if (liste.length > reglages.PARTICULIERS_MAX) throw erreur(400, `${reglages.PARTICULIERS_MAX} expéditeurs particuliers au plus.`);
    const particuliers = liste.map(reglages.particulierNet);
    for (const p of particuliers) {
      if (!reglages.adresseComplete(p) || !p.telephone) {
        throw erreur(400, `Expéditeur particulier « ${p.nom || 'sans nom'} » : société, adresse, code postal, ville et téléphone.`);
      }
    }
    maj.expediteurs = {
      atelier: reglages.adresseNette(b.expediteurs?.atelier ?? actuels.expediteurs.atelier),
      particuliers,
    };
  }
  const futurs = { ...actuels, ...maj };

  const nouveauMdp = typeof b.motDePasse === 'string' ? b.motDePasse.trim() : '';
  if (nouveauMdp) {
    if (!futurs.compte) throw erreur(400, 'Saisissez d’abord le numéro de compte.');
    try {
      await prixChronopost({ depart: futurs.expediteurs.atelier.cp || '14000', arrivee: '75001', poids: 1, produit: futurs.produit },
        { compte: futurs.compte, motDePasse: nouveauMdp });
    } catch (err) {
      throw erreur(409, `Chronopost refuse ce compte ou ce mot de passe : ${err.message}`);
    }
  }
  if (futurs.etat === 'reel') {
    if (!futurs.compte || !(nouveauMdp || await reglages.motDePasse())) throw erreur(409, 'Mode Réel : saisissez d’abord le compte et le mot de passe.');
    const a = futurs.expediteurs.atelier;
    if (!reglages.adresseComplete(a) || !a.telephone) throw erreur(409, 'Mode Réel : complétez d’abord l’adresse de l’atelier (avec le téléphone).');
  }
  if (nouveauMdp) await reglages.enregistrerMotDePasse(nouveauMdp);
  await reglages.ecrireReglages(maj);
  res.json(await etatReglages());
}

// Essai de connexion : prix d'un colis de 1 kg de l'atelier vers Paris (compte de test en mode
// Test, contrat sinon). Rien n'est créé.
export async function tester(req, res) {
  const r = await reglages.lireReglages();
  const acces = r.etat === 'test' ? reglages.COMPTE_ESSAI_CHRONOPOST : await reglages.accesContrat(r);
  const prix = await prixChronopost({ depart: r.expediteurs.atelier.cp || '14000', arrivee: '75001', poids: 1, produit: r.produit }, acces);
  res.json({ ...prix, compte: r.etat === 'test' ? 'essai' : 'contrat', produit: reglages.PRODUITS_CHRONOPOST[r.produit] });
}

// Nouvelle clé de l'agent de la Zebra : montrée une seule fois, à copier sur le PC atelier.
export async function cleAgent(req, res) {
  res.json({ cle: await reglages.nouvelleCleAgent() });
}

// ── Agent de la Zebra (PC atelier) ────────────────────────────

export async function agentTravaux(req, res) {
  await reglages.noterPassageAgent();
  res.json(await service.travauxZebra());
}

export async function agentPdf(req, res) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-store');
  res.send(await service.pdfZebra(req.params.id));
}

export async function agentFait(req, res) {
  await service.zebraFaite(req.params.id);
  res.json({ ok: true });
}

export async function agentErreur(req, res) {
  await service.zebraErreur(req.params.id, req.body?.detail);
  res.json({ ok: true });
}
