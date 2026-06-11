import { Router } from 'express';
import { MarketplacePricingController } from '../controllers/marketplace-pricing.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new MarketplacePricingController();

router.use(adminAuthMiddleware);


// GET /api/admin/marketplace/pricing
router.get(
  '/',
  auditMiddleware('marketplace_pricing_get_all'),
  ctrl.getAllConfigs
);

// GET /api/admin/marketplace/pricing/city-tiers
router.get(
  '/city-tiers',
  auditMiddleware('marketplace_pricing_get_city_tier_configs'),
  ctrl.getCityTierConfigs
);

// ── 2. By vehicle type ────────────────────────────────────────────────────────

// GET /api/admin/marketplace/pricing/vehicle-type/:vehicleType
// Returns all city-tier rows for one vehicle type (e.g. all three tiers for "car")
router.get(
  '/vehicle-type/:vehicleType',
  auditMiddleware('marketplace_pricing_get_by_vehicle_type'),
  ctrl.getConfigsByVehicleType
);

// ── 3. Per-vehicle × city-tier (2-segment — before bare :cityTier) ────────────

// GET /api/admin/marketplace/pricing/city-tiers/:cityTier/:vehicleType
router.get(
  '/city-tiers/:cityTier/:vehicleType',
  auditMiddleware('marketplace_pricing_get_config'),
  ctrl.getConfig
);

// PUT /api/admin/marketplace/pricing/city-tiers/:cityTier/:vehicleType
router.put(
  '/city-tiers/:cityTier/:vehicleType',
  auditMiddleware('marketplace_pricing_update_config'),
  ctrl.updateConfig
);

// ── 4. City-tier overview (1-segment wildcard — must be last) ─────────────────

// GET /api/admin/marketplace/pricing/city-tiers/:cityTier
router.get(
  '/city-tiers/:cityTier',
  auditMiddleware('marketplace_pricing_get_city_tier'),
  ctrl.getConfigsByCityTier
);

export default router;
