import { Router } from 'express';
import { PricingAdminController } from '../controllers/pricing-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new PricingAdminController();

router.use(adminAuthMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// City tiers: high | middle | low   (no national — unassigned states fall to low)
//
// Route order: most-specific first to prevent wildcard swallowing.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Static paths ───────────────────────────────────────────────────────────

// GET /api/admin/pricing
router.get('/', auditMiddleware('pricing_get_all'), ctrl.getAllConfigs);

// GET /api/admin/pricing/states
router.get('/states', auditMiddleware('pricing_get_states'), ctrl.getStates);

// GET /api/admin/pricing/city-tiers
router.get('/city-tiers', auditMiddleware('pricing_get_city_tier_configs'), ctrl.getCityTierConfigs);

// ── 2. Category route (static prefix "category") ──────────────────────────────

// GET /api/admin/pricing/category/:vehicleCategory
router.get(
  '/category/:vehicleCategory',
  auditMiddleware('pricing_get_by_category'),
  ctrl.getConfigsByCategory
);

// ── 3. State management (static suffix "states" — before bare :cityTier) ──────

// POST   /api/admin/pricing/city-tiers/:cityTier/states  — add states (merge)
router.post(
  '/city-tiers/:cityTier/states',
  auditMiddleware('pricing_assign_states'),
  ctrl.assignStatesToCityTier
);

// PUT    /api/admin/pricing/city-tiers/:cityTier/states  — replace states list
router.put(
  '/city-tiers/:cityTier/states',
  auditMiddleware('pricing_set_states'),
  ctrl.setStatesForCityTier
);

// DELETE /api/admin/pricing/city-tiers/:cityTier/states  — remove states (fall to low)
router.delete(
  '/city-tiers/:cityTier/states',
  auditMiddleware('pricing_remove_states'),
  ctrl.removeStatesFromCityTier
);

// ── 4. Per-vehicle pricing (3-segment — before 1-segment :cityTier) ───────────

// GET  /api/admin/pricing/city-tiers/:cityTier/:vehicleCategory/:serviceTier
router.get(
  '/city-tiers/:cityTier/:vehicleCategory/:serviceTier',
  auditMiddleware('pricing_get_city_tier_config'),
  ctrl.getCityTierConfig
);

// POST /api/admin/pricing/city-tiers/:cityTier/:vehicleCategory/:serviceTier
router.post(
  '/city-tiers/:cityTier/:vehicleCategory/:serviceTier',
  auditMiddleware('pricing_create_city_tier_config'),
  ctrl.createCityTierConfig
);

// PUT  /api/admin/pricing/city-tiers/:cityTier/:vehicleCategory/:serviceTier
router.put(
  '/city-tiers/:cityTier/:vehicleCategory/:serviceTier',
  auditMiddleware('pricing_update_city_tier_config'),
  ctrl.updateCityTierConfig
);

// ── 5. City-tier overview (1-segment wildcard — must be last) ─────────────────

// GET /api/admin/pricing/city-tiers/:cityTier
router.get(
  '/city-tiers/:cityTier',
  auditMiddleware('pricing_get_city_tier'),
  ctrl.getConfigsByCityTier
);

export default router;
