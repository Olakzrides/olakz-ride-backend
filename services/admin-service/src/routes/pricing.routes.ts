import { Router } from 'express';
import { PricingAdminController } from '../controllers/pricing-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new PricingAdminController();

router.use(adminAuthMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: More-specific routes must come before less-specific wildcard routes.
// Express matches top-to-bottom. A route like /city-tiers/:cityTier would swallow
// /city-tiers/:cityTier/:vehicleCategory/:serviceTier if registered first.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Static paths first ─────────────────────────────────────────────────────

// GET /api/admin/pricing
router.get('/', auditMiddleware('pricing_get_all'), ctrl.getAllConfigs);

// GET /api/admin/pricing/states
router.get('/states', auditMiddleware('pricing_get_states'), ctrl.getStates);

// GET /api/admin/pricing/city-tiers
router.get('/city-tiers', auditMiddleware('pricing_get_city_tier_configs'), ctrl.getCityTierConfigs);

// ── 2. National fallback routes (static prefix "national") ───────────────────

// GET  /api/admin/pricing/national/:vehicleCategory/:serviceTier
router.get(
  '/national/:vehicleCategory/:serviceTier',
  auditMiddleware('pricing_get_national_config'),
  ctrl.getConfig
);

// PUT  /api/admin/pricing/national/:vehicleCategory/:serviceTier
router.put(
  '/national/:vehicleCategory/:serviceTier',
  auditMiddleware('pricing_update_national_config'),
  ctrl.updateConfig
);

// GET  /api/admin/pricing/category/:vehicleCategory
router.get(
  '/category/:vehicleCategory',
  auditMiddleware('pricing_get_by_category'),
  ctrl.getConfigsByCategory
);

// ── 3. City-tier state management (static suffix "states") ───────────────────
// These must come before /city-tiers/:cityTier to avoid :cityTier eating "states"

// POST   /api/admin/pricing/city-tiers/:cityTier/states
router.post(
  '/city-tiers/:cityTier/states',
  auditMiddleware('pricing_assign_states'),
  ctrl.assignStatesToCityTier
);

// PUT    /api/admin/pricing/city-tiers/:cityTier/states
router.put(
  '/city-tiers/:cityTier/states',
  auditMiddleware('pricing_set_states'),
  ctrl.setStatesForCityTier
);

// DELETE /api/admin/pricing/city-tiers/:cityTier/states
router.delete(
  '/city-tiers/:cityTier/states',
  auditMiddleware('pricing_remove_states'),
  ctrl.removeStatesFromCityTier
);

// ── 4. City-tier pricing config (3-segment — must come before 1-segment) ─────

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

// GET  /api/admin/pricing/city-tiers/:cityTier
router.get(
  '/city-tiers/:cityTier',
  auditMiddleware('pricing_get_city_tier'),
  ctrl.getConfigsByCityTier
);

export default router;
