import { Router } from 'express';
import { BroadcastController } from '../controllers/broadcast.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new BroadcastController();

router.use(adminAuthMiddleware);

// ── Broadcast history (must come before /:role to avoid conflict) ─────────────
router.get('/broadcasts',              auditMiddleware('broadcast_get_all'),     ctrl.getAll);
router.get('/broadcasts/:broadcastId', auditMiddleware('broadcast_get_by_id'),   ctrl.getById);

// ── Send broadcast ─────────────────────────────────────────────────────────────
// :role = all | customer | driver | vendor
router.post('/broadcast/:role',        auditMiddleware('broadcast_send'),         ctrl.send);

// ── Edit / Delete ──────────────────────────────────────────────────────────────
router.patch('/broadcasts/:broadcastId',  auditMiddleware('broadcast_update'),   ctrl.update);
router.delete('/broadcasts/:broadcastId', auditMiddleware('broadcast_delete'),   ctrl.remove);

export default router;
