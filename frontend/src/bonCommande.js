// ─────────────────────────────────────────────────────────────
//  Lecture d'un bon de commande client (PDF), texte reconstitué ligne par ligne
//  (pdf.js › lignesDuPdf) : adresse de livraison, contact, n° de commande du
//  client. Deux lectures :
//   - ObjetRama : page de champs nommés (« Nom 1 LIVR », « CP LIVR »…), sûre ;
//   - autres clients : le cadre qui suit « Adresse de livraison », « Livrer à »…,
//     au mieux : à relire.
//  Rien n'est enregistré ici : les champs du formulaire sont remplis, à vérifier.
// ─────────────────────────────────────────────────────────────

const net = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const TEL = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/;
const MAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const CP_VILLE = /\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,40})/;
const VOIE = /\b(\d+|RUE|AVENUE|AV|BD|BOULEVARD|PLACE|CHEMIN|ROUTE|ALL[EÉ]E|IMPASSE|QUAI|COURS|SQUARE|ZI|ZA|ZAC|ZONE|LIEU[- ]DIT|BP|CS|HAMEAU|PARC)\b/i;
const CIVILITE = /^(M\.|MR|MME|MLLE|MADAME|MONSIEUR|MADEMOISELLE|ATT|A L'ATTENTION|À L'ATTENTION|CONTACT)\b/i;
const ENTETE_LIVRAISON = /(adresse de livraison|lieu de livraison|livrer [àa]|[àa] livrer [àa]|livraison\s*:|ship to|send to|deliver to)/i;

// Téléphone au format 06 12 34 56 78.
export function telephoneNet(s) {
  const m = TEL.exec(String(s ?? ''));
  return m ? m[0].replace(/\D/g, '').replace(/^33/, '0').replace(/(\d{2})(?=\d)/g, '$1 ').trim() : '';
}
const email = (s) => (MAIL.exec(String(s ?? '')) || [''])[0];

// Valeur du premier champ « Libellé valeur » trouvé.
function champ(lignes, re) {
  for (const l of lignes) {
    const m = re.exec(l);
    if (m) return net(m[1]);
  }
  return '';
}

// N° de commande du client : « Reference OBJ871848 (1790992-683277) » → OBJ871848.
function refCommande(lignes) {
  const ref = champ(lignes, /^R[ée]f[ée]rence\s+(.+)$/i) || champ(lignes, /\b(?:commande|order|cde)\s*(?:n[°o]|no\.?|num[ée]ro)?\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
  return (/\b[A-Z]{0,5}-?\d{3,}[A-Z0-9-]*\b/.exec(ref) || [ref])[0].slice(0, 40);
}

// Bon ObjetRama : page de champs nommés.
function lireChampsLivr(lignes) {
  const nom1 = champ(lignes, /^Nom 1 LIVR\b\s*(.*)$/i);
  const cp = champ(lignes, /^CP LIVR\b\s*(\d{5})/i);
  if (!nom1 && !cp) return null;
  const raison = champ(lignes, /^Raison sociale LIVR\b\s*(.*)$/i);
  const nom2 = champ(lignes, /^Nom 2 LIVR\b\s*(.*)$/i);
  const contact = champ(lignes, /^Nom du contact LIVRAISON\s*(.*)$/i).replace(/\s*Contact [àa] affich.*$/i, '');
  return {
    nom: raison || [nom1, nom2].filter(Boolean).join(' '),
    contact: contact || (raison ? [nom1, nom2].filter(Boolean).join(' ') : ''),
    adresse1: champ(lignes, /^Adr 1 LIVR\b\s*(.*)$/i),
    adresse2: champ(lignes, /^Adr 2 LIVR\b\s*(.*)$/i),
    cp,
    ville: champ(lignes, /^Ville LIVR\b\s*(.*)$/i),
    pays: champ(lignes, /^Pays LIVR\b\s*(.*)$/i) || 'FRANCE',
    telephone: telephoneNet(champ(lignes, /^Tel Contact LIVRAISON\s*(.*)$/i)) || telephoneNet(champ(lignes, /^Tel 1 contact cli\s*(.*)$/i)),
    email: email(champ(lignes, /^Email contact LIVRAISON\s*(.*)$/i)),
  };
}

// Autres bons : le cadre qui suit un titre de livraison, jusqu'à la ligne « code postal + ville ».
function lireCadre(lignes) {
  const i = lignes.findIndex((l) => ENTETE_LIVRAISON.test(l));
  if (i < 0) return null;
  const bloc = [];
  const reste = net(lignes[i].replace(ENTETE_LIVRAISON, '').replace(/^[\s:–-]+/, ''));
  if (reste) bloc.push(reste);
  let cp = '';
  let ville = '';
  let apres = [];
  for (let j = i + 1; j < Math.min(lignes.length, i + 9); j += 1) {
    const m = CP_VILLE.exec(lignes[j]);
    if (m) {
      cp = m[1];
      ville = net(m[2]).replace(/\b(FRANCE|CEDEX.*)$/i, '').trim();
      // Téléphone ou e-mail souvent écrits juste sous la ville.
      apres = lignes.slice(j + 1, j + 3).filter((l) => TEL.test(l) || MAIL.test(l));
      break;
    }
    bloc.push(net(lignes[j]));
  }
  if (!cp) return null;
  const tout = [...bloc, ...apres].join(' ');
  const propres = bloc.map((l) => net(l.replace(TEL, '').replace(MAIL, ''))).filter((l) => l && !/^(france|fr)$/i.test(l));
  const nom = propres.shift() || '';
  const contactLigne = propres.find((l) => CIVILITE.test(l)) || '';
  const sansContact = propres.filter((l) => l !== contactLigne);
  const rue = sansContact.find((l) => VOIE.test(l)) || sansContact[0] || '';
  return {
    nom,
    contact: contactLigne.replace(/^(ATT|A L'ATTENTION DE|À L'ATTENTION DE|CONTACT)\s*:?\s*/i, ''),
    adresse1: rue,
    adresse2: sansContact.filter((l) => l !== rue).join(' ').slice(0, 70),
    cp,
    ville,
    pays: 'FRANCE',
    telephone: telephoneNet(tout),
    email: email(tout),
  };
}

// Client reconnu d'après le bon (pour le choix de l'expéditeur et le champ « Client »).
function clientReconnu(lignes) {
  const texte = lignes.join(' ');
  if (/objetrama/i.test(texte) || /448\s?180\s?588/.test(texte)) return 'OBJETRAMA';
  return '';
}

// Résultat : { format, client, refClient, destinataire } ; null si aucune adresse de livraison n'est trouvée.
export function lireBonDeCommande(lignes) {
  const propres = lignes.map(net).filter(Boolean);
  const livr = lireChampsLivr(propres);
  const destinataire = livr || lireCadre(propres);
  if (!destinataire) return null;
  const client = clientReconnu(propres);
  return {
    format: livr ? (client === 'OBJETRAMA' ? 'ObjetRama' : 'champs de livraison') : 'cadre de livraison',
    sur: Boolean(livr),
    client,
    refClient: refCommande(propres),
    destinataire,
  };
}
