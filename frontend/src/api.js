// ─────────────────────────────────────────────────────────────
//  Client API : wrapper fetch avec cookies (credentials) et JSON.
// ─────────────────────────────────────────────────────────────

const BASE = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include', // envoie le cookie JWT httpOnly
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);

  // 204 / réponses vides
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),

  // Upload de fichiers (multipart) — pas de Content-Type JSON.
  upload: async (path, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: fd });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(data?.error || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  // Envoi multipart générique (champs + fichier optionnel).
  multipart: async (method, path, fields = {}, file = null, fileField = 'image') => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, v);
    if (file) fd.append(fileField, file);
    const res = await fetch(`${BASE}${path}`, { method, credentials: 'include', body: fd });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(data?.error || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  // Upload avec suivi de progression (XHR). onProgress(percent 0-100).
  uploadWithProgress: (path, files, onProgress) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error(data?.error || `Erreur ${xhr.status}`);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau pendant l’upload.'));
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    xhr.send(fd);
  }),
};
