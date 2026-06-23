// ─────────────────────────────────────────────────────────────
//  Middleware d'autorisation par rôle
// ─────────────────────────────────────────────────────────────

// N'autorise que les utilisateurs ADMIN.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  }
  next();
}
