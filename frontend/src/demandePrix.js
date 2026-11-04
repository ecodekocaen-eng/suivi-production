// ─────────────────────────────────────────────────────────────
//  Lecture d'une demande client :
//   - en PDF (ex. Heula / Le Trait d'Humour, édité par Odoo), à partir de son
//     texte, ligne par ligne :
//       [104HE-22] Mug Je t'aime   20/10/2026   36,00 Unité(s)
//   - en Excel ou CSV : les colonnes référence et quantité sont repérées par
//     leur titre et par les références de la base qu'elles contiennent.
//  Et lecture de la référence d'un modèle dans un nom de fichier :
//    « 104HE-22 Mug Je t'aime 225x95.pdf » → 104HE-22 / Mug Je t'aime
//    « MUG 4 125 ETAR.pdf »                → MUG 4 125 ETAR
//  Le format d'une référence dépend du client : tirets et espaces sont possibles.
// ─────────────────────────────────────────────────────────────

const RE_LIGNE = /\[\s*([^[\]]{2,60}?)\s*\]\s*(.*)$/;
// Espaces admis seulement entre milliers (« 1 200,00 ») : jamais collés à l'année d'une date.
const RE_QUANTITE = /(\d{1,3}(?:[\s  ]\d{3})*(?:[.,]\d+)?)\s*(?:Unit[ée]s?(?:\(s\))?|U\b|pcs?\b|pi[èe]ces?)/i;
const RE_DATE = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/;

// Référence en majuscules et à espaces simples (« mug  4 125 etar » → MUG 4 125 ETAR).
export const normRef = (r) => String(r ?? '').normalize('NFC').trim().toUpperCase().replace(/\s+/g, ' ');

// Dossier de stockage d'une référence, sans espaces ni accents : « MUG 4 125 ETAR »
// → MUG_4_125_ETAR. Vide si elle n'a ni lettre ni chiffre.
// ⚠️ Identique à backend/src/controllers/modeles.controller.js, qui contrôle le chemin.
export const dossierRef = (reference) => normRef(reference).normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^A-Z0-9-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 80);

const nombre = (s) => Math.round(parseFloat(String(s).replace(/[\s  ]/g, '').replace(',', '.')) || 0);

// Type, numéro et date d'expédition : communs à tous les formats de demande.
function lireEntete(texte) {
  const entete = texte.match(/(Demande de prix|Bon de commande|Commande(?: fournisseur)?)\s*(?:n[°o]\.?\s*)?:?\s*([A-Z]{1,5}[0-9][A-Z0-9/_-]{2,})/i);
  return {
    // Type du document tel qu'il y est écrit (« Demande de prix », « Bon de commande »…).
    type: entete ? entete[1].charAt(0).toUpperCase() + entete[1].slice(1).toLowerCase() : 'Demande',
    numero: entete?.[2] || null,
    dateExpedition: texte.match(/Date d['’]exp[ée]dition(?: demand[ée]e)?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] || null,
  };
}

// Société émettrice : pied de page Odoo « SAS NOM - CAPITAL… ».
const societeDuPied = (texte) => texte.match(/\b(?:SAS|SARL|SA|EURL|SASU)\s+(.+?)\s+-\s+CAPITAL/i)?.[1]?.trim() || null;

/**
 * @param lignesTexte texte du PDF, ligne par ligne (voir pdf.js › lignesDuPdf)
 * @returns {{ type, numero, dateExpedition, societe, lignes: { reference, designation, quantite, date }[] }}
 */
export function analyserDemande(lignesTexte) {
  const texte = lignesTexte.join('\n');
  const { type, numero, dateExpedition } = lireEntete(texte);
  const societe = societeDuPied(texte) || lignesTexte[0]?.trim() || null;

  const lignes = [];
  lignesTexte.forEach((ligne, i) => {
    const m = ligne.match(RE_LIGNE);
    if (!m) return;
    const reste = m[2];
    // La quantité se lit après la date prévue (colonne suivante), s'il y en a une.
    let q = reste.split(RE_DATE).pop().match(RE_QUANTITE);
    // Désignation longue sur deux lignes : la quantité peut être sur la suivante.
    for (let j = i + 1; !q && j < Math.min(i + 3, lignesTexte.length) && !RE_LIGNE.test(lignesTexte[j]); j += 1) {
      q = lignesTexte[j].match(RE_QUANTITE);
    }
    // Sans tiret, il faut une quantité : un simple texte entre crochets n'est pas une ligne.
    if (!q && !m[1].includes('-')) return;
    const date = reste.match(RE_DATE)?.[1] || null;
    const designation = reste.split(RE_DATE)[0].replace(RE_QUANTITE, '').trim();
    lignes.push({ reference: normRef(m[1]), designation, quantite: q ? nombre(q[1]) : 0, date });
  });

  return { type, numero, dateExpedition: dateExpedition || lignes.find((l) => l.date)?.date || null, societe, lignes };
}

// ── Demandes en tableau (Excel, CSV) ─────────────────────────

// Titre de colonne simplifié : « Qté. commandée » → « qte commandee ».
const titreSimple = (v) => String(v ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

const TITRES = {
  reference: /^(n |no |num )?(de )?(ref|refs|reference|references|code|sku|product code)\b/,
  // « Article », « Modèle » : le code ou le nom selon les tableaux, à défaut d'une référence.
  article: /^(n |no |num )?(de )?(articles?|items?|modeles?)\b/,
  quantite: /^(qte|qtes|qt|quantite|quantites|quantity|qty|nb|nbre|nombre|exemplaires|pcs|pieces|unites)\b/,
  designation: /^(designation|libelle|description|intitule|nom|visuel|produits?)\b/,
  // La date de sortie voulue, pas la date de la commande.
  date: /\b(livraison|expedition|sortie|souhaitee|prevue|demandee)\b/,
};
// Titres trompeurs : « Référence commande », « Code barre », « Qté par carton », « Adresse de livraison »…
const PIEGES = {
  reference: /\b(commande|cde|facture|livraison|bl|postal|tva|barres?|ean|gtin)\b/,
  quantite: /\b(cartons?|colis|palettes?|lots?|conditionnement|stock|dispo|disponibles?|mini|minimum|livrees?|recues?)\b/,
  date: /\b(adresse|lieu|mode|frais|ville|transporteur)\b/,
};

// Au-delà, ce n'est pas une quantité (un code-barres, par exemple).
const QUANTITE_MAX = 1000000;

const remplie = (cellule) => cellule !== '' && cellule != null;

function lireTitres(rangee) {
  const titres = {};
  rangee.forEach((cellule, colonne) => {
    const titre = titreSimple(cellule);
    if (!titre || titre.length > 40) return;
    const role = Object.keys(TITRES).find((r) => TITRES[r].test(titre) && !PIEGES[r]?.test(titre));
    if (role && titres[role] === undefined) titres[role] = colonne;
  });
  return titres;
}

// Quantité d'une cellule : 36, « 36,00 », « 1 200 », « 1.200,00 », « 36 Unité(s) ». Sinon null.
// Trois chiffres après le point ou la virgule sont des milliers : 1,200 fait 1 200 mugs, pas 1.
function quantiteCellule(cellule) {
  let quantite = cellule;
  if (typeof cellule !== 'number') {
    const texte = String(cellule ?? '').replace(/\s*(unit[ée]s?(\(s\))?|u|pcs?|pi[èe]ces?)\.?$/i, '').replace(/\s/g, '');
    const milliers = texte.match(/^(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?$/);
    if (milliers) quantite = Number(milliers[1].replace(/[.,]/g, ''));
    else quantite = /^\d+(?:[.,]\d+)?$/.test(texte) ? Number(texte.replace(',', '.')) : NaN;
  }
  return quantite >= 1 && quantite <= QUANTITE_MAX ? Math.round(quantite) : null;
}

// Date d'une cellule en jj/mm/aaaa : vraie date Excel, 20/10/2026 ou 2026-10-20. Sinon null.
function dateCellule(cellule) {
  if (cellule instanceof Date) {
    if (Number.isNaN(cellule.getTime())) return null;
    const jour = String(cellule.getDate()).padStart(2, '0');
    const mois = String(cellule.getMonth() + 1).padStart(2, '0');
    return `${jour}/${mois}/${cellule.getFullYear()}`;
  }
  const texte = String(cellule ?? '').trim();
  const iso = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : texte.match(RE_DATE)?.[1] || null;
}

// Cherche une référence dans une cellule : entre crochets (« [104HE-22] Mug… », export
// Odoo), ou référence de la base, seule ou dans un texte (sans prendre 104HE-2 pour 104HE-22).
function chercheurDeReference(referencesConnues) {
  const connues = [...new Set(referencesConnues.map(normRef))].filter(Boolean).sort((a, b) => b.length - a.length);
  const exactes = new Set(connues);
  const bordDeMot = /[A-Z0-9]/;
  const contient = (texte, reference) => {
    const i = texte.indexOf(reference);
    return i >= 0 && !bordDeMot.test(texte[i - 1] || '') && !bordDeMot.test(texte[i + reference.length] || '');
  };
  return (cellule) => {
    const texte = normRef(cellule);
    if (!texte) return null;
    const crochets = texte.match(/\[\s*([^[\]]{2,60}?)\s*\]/);
    if (crochets) return normRef(crochets[1]);
    if (exactes.has(texte)) return texte;
    return connues.find((reference) => contient(texte, reference)) || null;
  };
}

// Sans titres : la colonne dont au moins la moitié des cellules sont des quantités (un titre
// inconnu s'y compte aussi), de préférence à droite de la référence (la 1re colonne d'un
// tableau est son code, même s'il est chiffré).
function colonneDeQuantites(donnees, colonnes, colRef) {
  const deQuantites = (colonne) => {
    const cellules = donnees.map((r) => r[colonne]).filter(remplie);
    return cellules.length > 0 && cellules.filter((c) => quantiteCellule(c) !== null).length / cellules.length >= 0.5;
  };
  const apres = colRef ?? 0;
  return colonnes.find((c) => c > apres && deQuantites(c)) ?? colonnes.find((c) => c !== colRef && colRef !== undefined && deQuantites(c));
}

/**
 * @param rangees cellules du tableau, rangée par rangée (voir tableur.js)
 * @param referencesConnues références de la base : elles désignent la bonne colonne
 * @returns le même résultat qu'analyserDemande
 */
export function analyserTableau(rangees, referencesConnues = []) {
  const table = rangees.filter((r) => r.some(remplie));
  const enTexte = table.map((r) => r.filter(remplie).join(' '));
  const chercher = chercheurDeReference(referencesConnues);

  // Rangée de titres : une quantité, et de quoi identifier le modèle.
  const indexTitres = table.slice(0, 50).findIndex((r) => {
    const t = lireTitres(r);
    return t.quantite !== undefined && (t.reference ?? t.article ?? t.designation) !== undefined;
  });
  const titres = indexTitres >= 0 ? lireTitres(table[indexTitres]) : {};
  const donnees = table.slice(indexTitres + 1);
  const colonnes = Array.from({ length: Math.max(0, ...donnees.map((r) => r.length)) }, (_, i) => i);

  // Colonne des références : celle où l'on reconnaît le plus de modèles, sinon son titre.
  // Jamais celle des quantités, même si un modèle s'appelle « 36 ».
  const reconnus = colonnes.map((c) => (c === titres.quantite ? 0 : donnees.filter((r) => chercher(r[c])).length));
  const meilleure = colonnes.reduce((choix, c) => (reconnus[c] > (reconnus[choix] ?? 0) ? c : choix), undefined);
  let colRef = meilleure ?? titres.reference ?? titres.article ?? titres.designation;
  const colQte = titres.quantite ?? colonneDeQuantites(donnees, colonnes, colRef);
  // Ni titres ni modèle reconnu : « code ; quantité », le code est à gauche de la quantité.
  if (colRef === undefined && colQte !== undefined) colRef = colonnes.find((c) => c < colQte && donnees.some((r) => remplie(r[c])));

  // La désignation : sa colonne, sinon le premier texte de la rangée, sinon le texte
  // autour de la référence (« [104HE-22] Mug Je t'aime »).
  const colDesignation = titres.designation ?? (colRef === titres.reference ? titres.article : undefined);
  const designationDe = (rangee) => {
    const colonne = colDesignation ?? rangee.findIndex((c, i) => i !== colRef && i !== colQte
      && typeof c === 'string' && c.trim() && !dateCellule(c) && quantiteCellule(c) === null);
    if (colonne >= 0 && colonne !== colRef) return String(rangee[colonne] ?? '').trim();
    return String(rangee[colRef] ?? '').replace(/\[[^\]]*\]/, '').trim();
  };

  const lignes = [];
  if (colRef !== undefined && colQte !== undefined) {
    for (const rangee of donnees) {
      const cellule = rangee[colRef];
      if (!remplie(cellule) || /^(sous )?total\b/.test(titreSimple(cellule))) continue;
      const reference = chercher(cellule);
      const quantite = quantiteCellule(rangee[colQte]);
      // Sans quantité : modèle non commandé d'un bon pré-rempli, texte libre, pied de tableau.
      // Une quantité illisible reste affichée, à 0, pour être corrigée à la main.
      if (!quantite && (!reference || /^[\s0.,]*$/.test(String(rangee[colQte] ?? '')))) continue;
      lignes.push({
        reference: reference || normRef(cellule),
        designation: designationDe(rangee),
        quantite: quantite || 0,
        date: titres.date === undefined ? null : dateCellule(rangee[titres.date]),
      });
    }
  }
  // Aucun tableau reconnu : peut-être des lignes « [référence] … quantité » dans une seule colonne.
  if (lignes.length === 0) return analyserDemande(enTexte);

  const texte = enTexte.join('\n');
  const { type, numero, dateExpedition } = lireEntete(texte);
  return { type, numero, dateExpedition: dateExpedition || lignes.find((l) => l.date)?.date || null, societe: societeDuPied(texte), lignes };
}

// Référence et nom d'un modèle d'après le nom de son fichier : par défaut, le nom
// du fichier lui-même, sans son extension.
export function lireNomFichier(nomFichier) {
  // Noms venus d'un Mac (zip Smash…) : accents décomposés (NFD) → forme usuelle (NFC).
  // Le « (1) » d'un fichier téléchargé deux fois ne fait pas partie du nom.
  const base = String(nomFichier || '').normalize('NFC').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\s*\(\d+\)$/, '').trim();
  // Référence en tête de nom, suivie de la désignation : les demandes citent 104HE-22 seul.
  const m = base.match(/^([A-Za-z0-9]{2,}-[A-Za-z0-9]+)(?:[\s_-]+(.*))?$/);
  if (!m) return { reference: normRef(base), nom: base };
  const nom = (m[2] || '')
    .replace(/[\s_-]*\d{2,3}\s*x\s*\d{2,3}\b.*$/i, '') // format « 225x95 » et ce qui suit
    .replace(/\s+/g, ' ')
    .trim();
  return { reference: normRef(m[1]), nom: nom || normRef(m[1]) };
}
