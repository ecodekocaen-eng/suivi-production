// ─────────────────────────────────────────────────────────────
//  Contrôleur d'authentification (JWT en cookie httpOnly)
// ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { config } from '../config.js';

// Options du cookie JWT.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: config.secureCookie ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 8, // 8 h
    path: '/',
  };
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: (email || '').trim().toLowerCase() } });

  // Message générique (ne révèle pas si c'est l'email ou le mot de passe).
  if (!user || !user.actif || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  res.cookie('token', token, cookieOptions());
  res.json({ user: { id: user.id, email: user.email, nom: user.nom, role: user.role } });
}

export function logout(req, res) {
  res.clearCookie('token', { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}

// Renvoie l'utilisateur courant (route protégée).
export function me(req, res) {
  res.json({ user: req.user });
}
