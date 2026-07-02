// ─────────────────────────────────────────────────────────────
//  Routes de gestion des utilisateurs (réservées ADMIN)
// ─────────────────────────────────────────────────────────────
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/role.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listUsers, listUserLogs, createUser, updateUser, deleteUser } from '../controllers/users.controller.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/', asyncHandler(listUsers));
router.get('/logs', asyncHandler(listUserLogs));
router.post('/', asyncHandler(createUser));
router.patch('/:id', asyncHandler(updateUser));
router.delete('/:id', asyncHandler(deleteUser));

export default router;
