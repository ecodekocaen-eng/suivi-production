// ─────────────────────────────────────────────────────────────
//  Plan de charge de l'ESAT : peut-on sortir toutes les commandes à
//  leur date, à raison de CAPACITE_JOUR mugs par jour ouvré ?
//
//  On simule la production à partir d'aujourd'hui, dans l'ordre des
//  urgences : commandes déjà en retard, puis « ASAP », puis par date de
//  sortie, puis celles sans date. Chaque jour ouvré (lundi-vendredi,
//  hors jours fériés) produit au plus CAPACITE_JOUR mugs. Une commande
//  est « à risque » si elle se termine après son jour de sortie. L'indice de
//  charge dit quelle part de la capacité il faut d'ici la date la plus tendue.
//
//  Hypothèses volontairement prudentes : les commandes « En cours de
//  prod » sont comptées en entier (leur avancement n'est pas connu) et
//  la journée en cours compte comme une journée complète.
// ─────────────────────────────────────────────────────────────
import { CAPACITE_JOUR, STATUTS_EN_COURS } from './constants.js';

// Dimanche de Pâques (algorithme de Meeus / Jones / Butcher).
function paques(annee) {
  const a = annee % 19; const b = Math.floor(annee / 100); const c = annee % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(annee, Math.floor(n / 31) - 1, (n % 31) + 1);
}

const cle = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const feriesParAnnee = new Map();

// Jours fériés français : fixes + lundi de Pâques, Ascension, lundi de Pentecôte.
function feries(annee) {
  if (!feriesParAnnee.has(annee)) {
    const p = paques(annee);
    const apresPaques = (n) => new Date(p.getFullYear(), p.getMonth(), p.getDate() + n);
    const jours = [
      new Date(annee, 0, 1), apresPaques(1), new Date(annee, 4, 1), new Date(annee, 4, 8),
      apresPaques(39), apresPaques(50), new Date(annee, 6, 14), new Date(annee, 7, 15),
      new Date(annee, 10, 1), new Date(annee, 10, 11), new Date(annee, 11, 25),
    ];
    feriesParAnnee.set(annee, new Set(jours.map(cle)));
  }
  return feriesParAnnee.get(annee);
}

export function estJourOuvre(d) {
  const j = d.getDay();
  return j !== 0 && j !== 6 && !feries(d.getFullYear()).has(cle(d));
}

const debutJour = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// La date de sortie est enregistrée à minuit UTC : on reprend le jour tel quel.
const jourDeSortie = (iso) => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const RE_URGENT = /asap|urgent|express|rapide|vite/i;

// Au-delà de 85 % de la capacité mobilisée avant une date de sortie, « ça se tend ».
export const SEUIL_TENDU = 0.85;

/**
 * @param commandes  commandes (statut, quantite, dateLivraison, dateSortieTexte…)
 * @returns {{
 *   verdict: 'ok'|'tendu'|'galere'|'vide', capacite, totalMugs, nbCommandes,
 *   joursNecessaires, finEstimee, jours: Array<{date, prevu, sorties, retard (mugs hors délai)}>,
 *   aRisque, enRetard, margeMin, indice (%), dateTendue
 * }}
 */
export function planCharge(commandes, { capacite = CAPACITE_JOUR, aujourdhui = new Date() } = {}) {
  const jour0 = debutJour(aujourdhui);

  // Jours ouvrés successifs à partir d'aujourd'hui (ou du prochain jour ouvré).
  const ouvres = [];
  const jourOuvre = (i) => {
    while (ouvres.length <= i) {
      const d = ouvres.length
        ? new Date(ouvres[ouvres.length - 1].getFullYear(), ouvres[ouvres.length - 1].getMonth(), ouvres[ouvres.length - 1].getDate() + 1)
        : new Date(jour0);
      while (!estJourOuvre(d)) d.setDate(d.getDate() + 1);
      ouvres.push(d);
    }
    return ouvres[i];
  };

  // Index du dernier jour ouvré ≤ date de sortie ; −1 si on ne peut plus produire avant.
  const indexEcheance = (date) => {
    let i = -1;
    while (i < 500 && jourOuvre(i + 1) <= date) i += 1;
    return i;
  };

  const lignes = commandes
    .filter((c) => STATUTS_EN_COURS.includes(c.statut) && !c.supprime && (c.quantite || 0) > 0)
    .map((c) => {
      const date = c.dateLivraison ? jourDeSortie(c.dateLivraison) : null;
      const urgent = !date && RE_URGENT.test(c.dateSortieTexte || '');
      const echeance = date ? indexEcheance(date) : null;
      // Ordre de production : retards, urgences, dates de sortie, sans date.
      const groupe = date ? (date < jour0 || echeance < 0 ? 0 : 2) : (urgent ? 1 : 3);
      return { commande: c, date, urgent, echeance, groupe, fin: null };
    })
    .sort((a, b) => a.groupe - b.groupe || (a.date && b.date ? a.date - b.date : 0));

  // Simulation jour par jour.
  const prevu = [];
  const retardJour = []; // mugs produits ce jour-là pour des commandes déjà hors délai
  let jour = 0;
  let utilise = 0;
  for (const l of lignes) {
    let reste = l.commande.quantite;
    while (reste > 0) {
      if (utilise >= capacite) { jour += 1; utilise = 0; }
      const pris = Math.min(reste, capacite - utilise);
      prevu[jour] = (prevu[jour] || 0) + pris;
      if (l.date && jour > l.echeance) retardJour[jour] = (retardJour[jour] || 0) + pris;
      utilise += pris;
      reste -= pris;
    }
    l.fin = jour;
    l.finDate = jourOuvre(jour);
    if (l.date) {
      l.dejaEnRetard = l.date < jour0;
      l.marge = l.echeance - l.fin; // en jours ouvrés
      l.aRisque = !l.dejaEnRetard && l.fin > l.echeance;
    }
  }

  const totalMugs = lignes.reduce((s, l) => s + l.commande.quantite, 0);
  const datees = lignes.filter((l) => l.date && !l.dejaEnRetard);
  const aRisque = lignes.filter((l) => l.aRisque);
  const enRetard = lignes.filter((l) => l.dejaEnRetard);
  const margeMin = datees.length ? Math.min(...datees.map((l) => l.marge)) : null;

  // Indice de charge : pour chaque échéance k (en jours ouvrés depuis aujourd'hui), part de la
  // capacité des jours 0…k qu'il faut pour sortir tout ce qui est dû d'ici là — retards et
  // urgences compris. On retient l'échéance la plus tendue. Au-delà de 100 %, des dates sautent.
  const urgences = lignes.filter((l) => l.groupe <= 1);
  const echeances = new Set(datees.filter((l) => l.echeance >= 0).map((l) => l.echeance));
  if (urgences.length) echeances.add(0);
  let indice = 0;
  let echeanceTendue = null;
  for (const k of echeances) {
    const du = lignes
      .filter((l) => l.groupe <= 1 || (l.groupe === 2 && l.echeance <= k))
      .reduce((s, l) => s + l.commande.quantite, 0);
    const ratio = du / (capacite * (k + 1));
    if (ratio > indice) { indice = ratio; echeanceTendue = k; }
  }

  let verdict = 'ok';
  if (!lignes.length) verdict = 'vide';
  else if (aRisque.length) verdict = 'galere';
  else if (enRetard.length || indice > SEUIL_TENDU) verdict = 'tendu';

  // Bandeau des prochains jours : au moins 10 jours ouvrés, jusqu'à 15 si la charge dépasse.
  const nbJours = Math.min(Math.max(10, (totalMugs ? jour + 1 : 0)), 15);
  const jours = Array.from({ length: nbJours }, (_, i) => ({
    date: jourOuvre(i),
    prevu: prevu[i] || 0,
    sorties: datees.filter((l) => l.echeance === i).length,
    retard: retardJour[i] || 0,
  }));

  return {
    verdict,
    capacite,
    totalMugs,
    nbCommandes: lignes.length,
    joursNecessaires: totalMugs / capacite,
    finEstimee: totalMugs ? jourOuvre(jour) : null,
    joursAuDela: Math.max(0, jour + 1 - nbJours),
    jours,
    aRisque,
    enRetard,
    margeMin,
    indice: Math.round(indice * 100), // en %
    dateTendue: echeanceTendue != null ? jourOuvre(echeanceTendue) : null,
  };
}
