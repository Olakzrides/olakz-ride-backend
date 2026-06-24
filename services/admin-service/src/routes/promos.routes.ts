import { Router } from 'express';
import { PromoAdminController } from '../controllers/promo-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new PromoAdminController();

router.use(adminAuthMiddleware);

// ── Read endpoints (must come before /:promoId) ──────────────────────────────
router.get('/active',                auditMiddleware('promo_get_active'),      ctrl.getActive);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get('/',                      auditMiddleware('promo_get_all'),          ctrl.getAll);
router.post('/',                     auditMiddleware('promo_create'),           ctrl.create);
router.get('/:promoId',              auditMiddleware('promo_get_by_id'),        ctrl.getById);
router.patch('/:promoId',            auditMiddleware('promo_update'),           ctrl.update);
router.delete('/:promoId',           auditMiddleware('promo_delete'),           ctrl.delete);

// ── Lifecycle actions ─────────────────────────────────────────────────────────
// pause   → temporarily stop an active promo  (resumable)
// resume  → restart a paused promo
// end     → permanently end any running/paused/scheduled promo (irreversible)
// deactivate → cancel a scheduled-but-not-started promo
router.patch('/:promoId/pause',      auditMiddleware('promo_pause'),            ctrl.pause);
router.patch('/:promoId/resume',     auditMiddleware('promo_resume'),           ctrl.resume);
router.patch('/:promoId/end',        auditMiddleware('promo_end'),              ctrl.end);
router.patch('/:promoId/deactivate', auditMiddleware('promo_deactivate'),       ctrl.deactivate);

// ── Claims list ───────────────────────────────────────────────────────────────
router.get('/:promoId/claims',       auditMiddleware('promo_get_claims'),       ctrl.getClaims);

export default router;
