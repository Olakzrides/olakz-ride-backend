import { Router } from 'express';
import { PromoAdminController } from '../controllers/promo-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new PromoAdminController();

router.use(adminAuthMiddleware);

// ── Read-only (must come before /:promoId) ──────────────────────────────────
router.get('/active',                 auditMiddleware('promo_get_active'),       ctrl.getActive);

// ── CRUD ────────────────────────────────────────────────────────────────────
router.get('/',                       auditMiddleware('promo_get_all'),          ctrl.getAll);
router.post('/create',                auditMiddleware('promo_create'),           ctrl.create);
router.get('/:promoId',               auditMiddleware('promo_get_by_id'),        ctrl.getById);
router.patch('/:promoId',             auditMiddleware('promo_update'),            ctrl.update);
router.delete('/:promoId',            auditMiddleware('promo_delete'),            ctrl.delete);

// ── Activation toggles ──────────────────────────────────────────────────────
router.patch('/:promoId/activate',    auditMiddleware('promo_activate'),         ctrl.activate);
router.patch('/:promoId/deactivate',  auditMiddleware('promo_deactivate'),       ctrl.deactivate);

// ── Claims list ─────────────────────────────────────────────────────────────
router.get('/:promoId/claims',        auditMiddleware('promo_get_claims'),       ctrl.getClaims);

export default router;
