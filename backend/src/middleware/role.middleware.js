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

// N'autorise que les rôles listés (ex : requireRole('ADMIN', 'COMPTABLE')).
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Accès non autorisé pour ce rôle.' });
    }
    next();
  };
}

// Rôles « production » : tout sauf le compte comptable (qui ne voit que la facturation).
export const requireProduction = requireRole('ADMIN', 'OPERATEUR');

// Accès au module facturation : ADMIN, COMPTABLE, ou tout compte disposant
// de l'option « accès facturation » (ex : responsable de prod de l'ESAT).
export function requireFacturation(req, res, next) {
  const u = req.user;
  if (u?.role === 'ADMIN' || u?.role === 'COMPTABLE' || u?.accesFacturation) return next();
  return res.status(403).json({ error: 'Accès non autorisé pour ce rôle.' });
}
