// ─────────────────────────────────────────────────────────────
//  Routes de gestion des utilisateurs (réservées ADMIN)
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { listUsers, createUser, updateUser } from '../controllers/users.controller.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

export default router;
