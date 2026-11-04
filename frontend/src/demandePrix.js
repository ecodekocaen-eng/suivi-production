// ─────────────────────────────────────────────────────────────
//  Lecture d'une « Demande de prix » client (ex. Heula / Le Trait d'Humour,
//  éditée par Odoo) à partir de son texte, ligne par ligne :
//    [104HE-22] Mug Je t'aime   20/10/2026   36,00 Unité(s)
//  et lecture de la référence d'un modèle dans un nom de fichier :
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
  .replace(/[^A-Z0-9-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '');

const nombre = (s) => Math.round(parseFloat(String(s).replace(/[\s  ]/g, '').replace(',', '.')) || 0);

/**
 * @param lignesTexte texte du PDF, ligne par ligne (voir pdf.js › lignesDuPdf)
 * @returns {{ numero, dateExpedition, societe, lignes: { reference, designation, quantite, date }[] }}
 */
export function analyserDemande(lignesTexte) {
  const texte = lignesTexte.join('\n');
  const entete = texte.match(/(Demande de prix|Bon de commande|Commande(?: fournisseur)?)\s*(?:n[°o]\.?\s*)?:?\s*([A-Z]{1,5}[0-9][A-Z0-9/_-]{2,})/i);
  const numero = entete?.[2] || null;
  // Type du document tel qu'écrit dans le PDF (« Demande de prix », « Bon de commande »…).
  const type = entete ? entete[1].charAt(0).toUpperCase() + entete[1].slice(1).toLowerCase() : 'Demande';
  const dateExpedition = texte.match(/Date d['’]exp[ée]dition(?: demand[ée]e)?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] || null;
  // Société émettrice : pied de page Odoo « SAS NOM - CAPITAL… », sinon 1re ligne du document.
  const societe = (texte.match(/\b(?:SAS|SARL|SA|EURL|SASU)\s+(.+?)\s+-\s+CAPITAL/i)?.[1] || lignesTexte[0] || '').trim() || null;

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

// Retire le format « 225x95 » et ce qui le suit.
const sansFormat = (s) => s.replace(/[\s_-]*\d{2,3}\s*x\s*\d{2,3}\b.*$/i, '').replace(/\s+/g, ' ').trim();

// Référence et nom d'un modèle d'après le nom de son fichier. Sans référence
// reconnue (ex. « EXE Mug Flers.pdf »), reference est vide.
export function lireNomFichier(nomFichier) {
  // Noms venus d'un Mac (zip Smash…) : accents décomposés (NFD) → forme usuelle (NFC).
  // Le « (1) » d'un fichier téléchargé deux fois ne fait pas partie du nom.
  const base = String(nomFichier || '').normalize('NFC').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\s*\(\d+\)$/, '').trim();
  const m = base.match(/^([A-Za-z0-9]{2,}-[A-Za-z0-9]+)(?:[\s_-]+(.*))?$/);
  if (m) return { reference: normRef(m[1]), nom: sansFormat(m[2] || '') || normRef(m[1]) };
  // Sans tiret, un PDF nommé en majuscules avec des chiffres est un code, donc la référence
  // (« MUG 4 125 ETAR », « MUG 488GS01 »). Une phrase (« EXE Mug Flers ») ou une image
  // (« 35 MUGS HEULA 2024.jpg », un catalogue) n'en est pas une.
  const code = sansFormat(base);
  if (/\.pdf$/i.test(nomFichier) && /\d/.test(code) && code === code.toUpperCase()) {
    return { reference: normRef(code), nom: normRef(code) };
  }
  return { reference: '', nom: base };
}
