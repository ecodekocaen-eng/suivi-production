// ─────────────────────────────────────────────────────────────
//  Appels au service web de Chronopost (SOAP) : étiquettes (ShippingServiceWS),
//  prix (QuickcostServiceWS), annulation (TrackingServiceWS). Repris de l'atelier
//  Objetlia (lib/chronopost/client.js), qui l'utilise en production depuis le 17/11/2026.
//  Les éléments sont « unqualified » : seul l'élément de l'opération porte l'espace de noms.
// ─────────────────────────────────────────────────────────────
const SERVICES = {
  shipping: { url: 'https://ws.chronopost.fr/shipping-cxf/ShippingServiceWS', ns: 'http://cxf.shipping.soap.chronopost.fr/' },
  quickcost: { url: 'https://ws.chronopost.fr/quickcost-cxf/QuickcostServiceWS', ns: 'http://cxf.quickcost.soap.chronopost.fr/' },
  tracking: { url: 'https://ws.chronopost.fr/tracking-cxf/TrackingServiceWS', ns: 'http://cxf.tracking.soap.chronopost.fr/' },
};

export const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const element = (nom, v) => `<${nom}>${xmlEsc(v)}</${nom}>`;
export const bloc = (nom, champs) => `<${nom}>${Object.entries(champs).map(([k, v]) => element(k, v)).join('')}</${nom}>`;

const entites = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// Premier élément <nom> du XML (texte décodé), ou null.
export function champXml(xml, nom) {
  const m = new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`).exec(String(xml || ''));
  return m ? entites(m[1]).trim() : null;
}

// Tous les blocs <nom>…</nom> du XML (contenu brut).
export const blocsXml = (xml, nom) => [...String(xml || '').matchAll(new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`, 'g'))].map((m) => m[1]);

const erreur = (message, status) => Object.assign(new Error(message), { status });

// Appelle une opération et renvoie le XML de la réponse. Une erreur réseau ou SOAP lève, avec un message lisible.
export async function appelChronopost(service, operation, corps, { timeoutMs = 60_000 } = {}) {
  const s = SERVICES[service];
  const enveloppe = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cxf="${s.ns}"><soapenv:Header/><soapenv:Body><cxf:${operation}>${corps}</cxf:${operation}></soapenv:Body></soapenv:Envelope>`;
  let res;
  try {
    res = await fetch(s.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      body: enveloppe,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw erreur(e?.name === 'TimeoutError' ? 'Chronopost n’a pas répondu à temps.' : `Chronopost injoignable (${e.message}).`, 502);
  }
  const xml = await res.text();
  const faute = champXml(xml, 'faultstring');
  if (faute) throw erreur(`Chronopost refuse la demande : ${faute.slice(0, 200)}`, 502);
  if (!res.ok) throw erreur(`Chronopost a répondu ${res.status}.`, 502);
  return xml;
}
