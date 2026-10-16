// ─────────────────────────────────────────────────────────────
//  Lecture des PDF dans le navigateur (pdf.js), chargée seulement à l'usage :
//   - vignette d'un fichier d'impression (import dans la base de données) ;
//   - texte d'une « Demande de prix », reconstitué ligne par ligne.
// ─────────────────────────────────────────────────────────────

let pdfjs = null;
async function chargerPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}

async function ouvrir(fichier) {
  const lib = await chargerPdfjs();
  // isEvalSupported : jamais d'évaluation de code venu d'un PDF.
  return lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()), isEvalSupported: false }).promise;
}

// Vignette JPEG (fond blanc) : 1re page d'un PDF, ou image réduite.
export async function vignette(fichier, largeur = 640) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (fichier.type === 'application/pdf') {
    const doc = await ouvrir(fichier);
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const vue = page.getViewport({ scale: largeur / base.width });
      canvas.width = Math.round(vue.width);
      canvas.height = Math.round(vue.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vue }).promise;
    } finally {
      doc.destroy();
    }
  } else {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, largeur / image.width);
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
  }
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('Vignette impossible'))), 'image/jpeg', 0.86,
  ));
}

// Texte du PDF, ligne par ligne, dans l'ordre de lecture (de haut en bas, de
// gauche à droite) : les morceaux à la même hauteur forment une ligne.
export async function lignesDuPdf(fichier) {
  const doc = await ouvrir(fichier);
  const lignes = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      const morceaux = items
        .filter((it) => it.str && it.str.trim())
        .map((it) => ({ texte: it.str, x: it.transform[4], y: it.transform[5], fin: it.transform[4] + it.width }));
      morceaux.sort((a, b) => b.y - a.y || a.x - b.x);
      let courante = null;
      for (const m of morceaux) {
        if (!courante || Math.abs(courante.y - m.y) > 3) {
          courante = { y: m.y, parts: [] };
          lignes.push(courante);
        }
        courante.parts.push(m);
      }
    }
  } finally {
    doc.destroy();
  }
  return lignes.map(({ parts }) => {
    parts.sort((a, b) => a.x - b.x);
    let texte = '';
    let fin = null;
    for (const p of parts) {
      if (texte && (fin === null || p.x - fin > 1) && !/\s$/.test(texte) && !/^\s/.test(p.texte)) texte += ' ';
      texte += p.texte;
      fin = p.fin;
    }
    return texte.replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}
