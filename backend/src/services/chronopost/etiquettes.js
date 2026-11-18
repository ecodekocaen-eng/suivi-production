// ─────────────────────────────────────────────────────────────
//  Étiquettes Chronopost (service web, shippingMultiParcelV7) : une demande pour tous les cartons
//  d'une expédition, une étiquette et un numéro de suivi par carton. Même demande que l'atelier
//  Objetlia, avec plusieurs colis. Formats rendus par Chronopost (relevés le 18/11/2026) :
//   - « THE » : l'étiquette seule, sur une page A4 portrait → remise au format des rouleaux de la
//     Zebra (100 × 150 mm) par versZebra, sans la pixelliser ;
//   - « PDF » : page A4 paysage, l'étiquette à découper et un aide-mémoire (imprimante de bureau).
//  Une étiquette ne peut pas être relue plus tard chez Chronopost : on garde son PDF.
// ─────────────────────────────────────────────────────────────
import { PDFDocument, degrees } from 'pdf-lib';
import { appelChronopost, bloc, element, champXml, blocsXml } from './client.js';

const erreur = (status, message) => Object.assign(new Error(message), { status });

// Texte accepté par Chronopost : sans accents ni caractères spéciaux, longueur bornée.
export const texteChrono = (s, max = 35) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Rue sur deux lignes de 35 caractères, coupées entre deux mots.
export function lignesAdresse(...morceaux) {
  const mots = morceaux.map((m) => texteChrono(m, 200)).filter(Boolean).join(' ').split(' ').filter(Boolean);
  const lignes = [''];
  for (const mot of mots) {
    const i = lignes.length - 1;
    if (!lignes[i]) lignes[i] = mot.slice(0, 35);
    else if (`${lignes[i]} ${mot}`.length <= 35) lignes[i] = `${lignes[i]} ${mot}`;
    else lignes.push(mot.slice(0, 35));
  }
  return [lignes[0] || '', lignes.slice(1).join(' ').slice(0, 35)];
}

export const telephoneChrono = (t) => String(t || '').trim().replace(/[^\d+]/g, '').replace(/^00/, '+').slice(0, 17);
const codePostal = (cp) => texteChrono(cp, 9).replace(/\s/g, '');

// Date et heure de Paris : Chronopost les attend sans fuseau.
function maintenantParis(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`, heure: Number(p.hour) };
}

// Bloc d'adresse expéditeur (« shipper ») ou titulaire du contrat (« customer »).
function adresseEmetteur(prefixe, a) {
  const [l1, l2] = lignesAdresse(a.adresse1, a.adresse2);
  return {
    [`${prefixe}Adress1`]: l1, [`${prefixe}Adress2`]: l2, [`${prefixe}City`]: texteChrono(a.ville, 30), [`${prefixe}Civility`]: 'M',
    [`${prefixe}ContactName`]: texteChrono(a.contact || a.nom), [`${prefixe}Country`]: String(a.pays || 'FR').toUpperCase(), [`${prefixe}CountryName`]: '',
    [`${prefixe}Email`]: a.email || '', [`${prefixe}MobilePhone`]: '', [`${prefixe}Name`]: texteChrono(a.nom), [`${prefixe}Name2`]: '',
    [`${prefixe}Phone`]: telephoneChrono(a.telephone), [`${prefixe}PreAlert`]: 0, [`${prefixe}ZipCode`]: codePostal(a.cp),
  };
}

// Demande d'étiquettes (shippingMultiParcelV7). Fonction pure. L'ordre des éléments est celui de la description.
//   expediteur : adresse de départ (atelier ou ESAT) ; titulaire : adresse du contrat (atelier).
export function construireDemande({ reference, destinataire: d, poids, expediteur, titulaire, produit = '01', mode, acces, quand = new Date() }) {
  const t = maintenantParis(quand);
  const [rue1, rue2] = lignesAdresse(d.adresse1, d.adresse2);
  const ref = texteChrono(reference);
  return bloc('headerValue', { accountNumber: acces.compte, idEmit: 'CHRFR', identWebPro: '', subAccount: acces.sousCompte || '' })
    + bloc('shipperValue', { ...adresseEmetteur('shipper', expediteur), shipperType: '' })
    + bloc('customerValue', { ...adresseEmetteur('customer', titulaire), printAsSender: 'N' })
    + bloc('recipientValue', {
      recipientAdress1: rue1, recipientAdress2: rue2, recipientCity: texteChrono(d.ville, 30), recipientContactName: texteChrono(d.contact || d.nom),
      recipientCountry: String(d.pays || 'FR').toUpperCase(), recipientCountryName: '', recipientEmail: d.email || '', recipientMobilePhone: '',
      recipientName: texteChrono(d.nom), recipientName2: texteChrono(d.contact),
      recipientPhone: telephoneChrono(d.telephone) || telephoneChrono(expediteur.telephone), recipientPreAlert: 0,
      recipientZipCode: codePostal(d.cp), recipientType: '',
    })
    + bloc('refValue', { customerSkybillNumber: '', recipientRef: ref, shipperRef: ref, idRelais: '' })
    + poids.map((p, i) => bloc('skybillValue', {
      bulkNumber: poids.length, codCurrency: 'EUR', codValue: 0, evtCode: 'DC', insuredCurrency: 'EUR', insuredValue: 0, objectType: 'MAR',
      portCurrency: 'EUR', portValue: 0, productCode: produit, service: '0', shipDate: t.date, shipHour: t.heure,
      skybillRank: i + 1, weight: Math.round(p * 100) / 100, weightUnit: 'KGM', height: 0, length: 0, width: 0,
    })).join('')
    + bloc('skybillParamsValue', { duplicata: 'N', mode, withReservation: 0 })
    + element('password', acces.motDePasse) + element('modeRetour', '2') + element('numberOfParcel', poids.length)
    + element('version', '2.0') + element('multiParcel', poids.length > 1 ? 'Y' : 'N');
}

// Réponse : code d'erreur général, puis un résultat par carton (numéro de suivi + PDF).
export function lireReponse(xml) {
  const colis = blocsXml(xml, 'resultMultiParcelValue').map((r) => ({
    suivi: champXml(r, 'skybillNumber'),
    pdf: champXml(r, 'pdfEtiquette'),
  }));
  return { code: Number(champXml(xml, 'errorCode')), message: champXml(xml, 'errorMessage') || '', colis };
}

// Crée les étiquettes. Renvoie [{ suivi, pdf: Buffer }], dans l'ordre des cartons.
export async function creerEtiquettes(demande) {
  const xml = await appelChronopost('shipping', 'shippingMultiParcelV7', construireDemande(demande), { timeoutMs: 90_000 });
  const lu = lireReponse(xml);
  if (lu.code !== 0) throw erreur(409, `Chronopost refuse l’étiquette : ${lu.message || `erreur ${lu.code}`}.`);
  if (lu.colis.length !== demande.poids.length || lu.colis.some((c) => !c.suivi || !c.pdf)) {
    const suivis = lu.colis.map((c) => c.suivi).filter(Boolean);
    throw erreur(502, `Réponse de Chronopost incomplète (${lu.colis.length} étiquette(s) pour ${demande.poids.length} carton(s))${suivis.length ? ` : ${suivis.join(', ')}` : ''}.`);
  }
  return lu.colis.map((c) => ({ suivi: c.suivi, pdf: Buffer.from(c.pdf, 'base64') }));
}

// Annule un carton avant sa prise en charge (cancelSkybill). Lève avec le motif de Chronopost.
export async function annulerEtiquette(suivi, acces) {
  const xml = await appelChronopost('tracking', 'cancelSkybill',
    element('accountNumber', acces.compte) + element('password', acces.motDePasse) + element('language', 'fr_FR') + element('skybillNumber', suivi));
  const code = Number(champXml(xml, 'errorCode'));
  if (code !== 0) throw erreur(409, champXml(xml, 'errorMessage') || `erreur ${code}`);
}

// Prix d'un colis (quickCost) : vérifie le compte et le mot de passe sans rien créer.
export async function prixChronopost({ depart = '14000', arrivee = '75001', poids = 1, produit = '01' }, acces) {
  const xml = await appelChronopost('quickcost', 'quickCost',
    element('accountNumber', acces.compte) + element('password', acces.motDePasse) + element('depCode', codePostal(depart))
    + element('arrCode', codePostal(arrivee)) + element('weight', String(poids)) + element('productCode', produit) + element('type', 'M'),
    { timeoutMs: 30_000 });
  const code = Number(champXml(xml, 'errorCode'));
  if (code !== 0) throw erreur(409, champXml(xml, 'errorMessage') || `erreur ${code}`);
  return { montantHT: Number(champXml(xml, 'amount')) || 0, montantTTC: Number(champXml(xml, 'amountTTC')) || 0 };
}

// Étiquette « THE » (A4) → page 100 × 150 mm des rouleaux de la Zebra, debout, 2 mm de marge,
// sans perte : la page de Chronopost est posée telle quelle, réduite.
const ZEBRA = [283.46, 425.2];
const MARGE = 6;
export async function versZebra(pdf) {
  const doc = await PDFDocument.create();
  const [page] = await doc.embedPdf(pdf, [0]);
  const couchee = page.width > page.height;
  const [l, h] = couchee ? [page.height, page.width] : [page.width, page.height];
  const echelle = Math.min((ZEBRA[0] - 2 * MARGE) / l, (ZEBRA[1] - 2 * MARGE) / h);
  const w = l * echelle;
  const hh = h * echelle;
  const x = (ZEBRA[0] - w) / 2;
  const y = (ZEBRA[1] - hh) / 2;
  const p = doc.addPage(ZEBRA);
  if (couchee) p.drawPage(page, { x: x + w, y, width: hh, height: w, rotate: degrees(90) });
  else p.drawPage(page, { x, y, width: w, height: hh });
  return Buffer.from(await doc.save());
}

// Plusieurs PDF → un seul, dans l'ordre (toutes les étiquettes d'une expédition).
export async function assembler(pdfs) {
  const doc = await PDFDocument.create();
  for (const b of pdfs) {
    const source = await PDFDocument.load(b);
    const pages = await doc.copyPages(source, source.getPageIndices());
    for (const p of pages) doc.addPage(p);
  }
  return Buffer.from(await doc.save());
}
