// ─────────────────────────────────────────────────────────────
//  Enveloppe les contrôleurs async pour propager les rejets de
//  promesse vers le middleware d'erreur (Express 4 ne le fait pas seul).
// ─────────────────────────────────────────────────────────────
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
