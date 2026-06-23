// ─────────────────────────────────────────────────────────────
//  Instance unique de PrismaClient (réutilisée dans toute l'app)
// ─────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
