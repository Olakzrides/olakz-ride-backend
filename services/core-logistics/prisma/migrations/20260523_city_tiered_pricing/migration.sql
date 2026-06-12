-- Migration: Add City-Tiered Pricing Support
-- Date: 2026-05-23
-- Description: Add city_tier and states columns to ride_fare_config for location-based pricing

-- ─── 1. Add new columns to ride_fare_config ──────────────────────────────────

ALTER TABLE ride_fare_config 
ADD COLUMN IF NOT EXISTS city_tier VARCHAR(20) DEFAULT 'national',
ADD COLUMN IF NOT EXISTS states JSONB DEFAULT '[]';

-- Add comments
COMMENT ON COLUMN ride_fare_config.city_tier IS 'City pricing tier: high | middle | low | national';
COMMENT ON COLUMN ride_fare_config.states IS 'Array of Nigerian state names this config applies to';

-- ─── 2. Drop old unique constraint ───────────────────────────────────────────

ALTER TABLE ride_fare_config 
DROP CONSTRAINT IF EXISTS ride_fare_config_vehicle_category_service_tier_key;

-- ─── 3. Create new unique constraint with city_tier ──────────────────────────

ALTER TABLE ride_fare_config 
ADD CONSTRAINT ride_fare_config_vehicle_category_service_tier_city_tier_key 
UNIQUE (vehicle_category, service_tier, city_tier);

-- ─── 4. Add indexes for better query performance ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ride_fare_config_city_tier ON ride_fare_config(city_tier);
CREATE INDEX IF NOT EXISTS idx_ride_fare_config_states ON ride_fare_config USING GIN(states);

-- ─── 5. Update existing rows to have city_tier = 'national' ─────────────────

UPDATE ride_fare_config 
SET city_tier = 'national', states = '[]'
WHERE city_tier IS NULL OR city_tier = '';

-- ─── 6. Create national fallback configs (if they don't exist) ───────────────

-- Car - Standard (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'car',
  'standard',
  'national',
  '[]'::jsonb,
  490,
  650,
  3500,
  2500,
  20.00,
  500,
  50,
  0,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'car' 
    AND service_tier = 'standard' 
    AND city_tier = 'national'
);

-- Car - Premium (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'car',
  'premium',
  'national',
  '[]'::jsonb,
  590,
  750,
  4000,
  3000,
  15.00,
  600,
  50,
  0,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'car' 
    AND service_tier = 'premium' 
    AND city_tier = 'national'
);

-- Car - VIP (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'car',
  'vip',
  'national',
  '[]'::jsonb,
  790,
  950,
  5000,
  4000,
  10.00,
  800,
  50,
  0,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'car' 
    AND service_tier = 'vip' 
    AND city_tier = 'national'
);

-- Motorcycle - Default (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'motorcycle',
  'default',
  'national',
  '[]'::jsonb,
  350,
  0,
  2000,
  0,
  0,
  300,
  50,
  100,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'motorcycle' 
    AND service_tier = 'default' 
    AND city_tier = 'national'
);

-- Bicycle - Default (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'bicycle',
  'default',
  'national',
  '[]'::jsonb,
  250,
  0,
  1500,
  0,
  0,
  200,
  0,
  0,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'bicycle' 
    AND service_tier = 'default' 
    AND city_tier = 'national'
);

-- Bus - Default (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'bus',
  'default',
  'national',
  '[]'::jsonb,
  400,
  0,
  3000,
  0,
  0,
  400,
  50,
  0,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'bus' 
    AND service_tier = 'default' 
    AND city_tier = 'national'
);

-- Truck - Default (National Fallback)
INSERT INTO ride_fare_config (
  vehicle_category, 
  service_tier, 
  city_tier, 
  states,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  min_amount_for_shared_ride,
  shared_discount_percent,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT 
  'truck',
  'default',
  'national',
  '[]'::jsonb,
  500,
  0,
  4000,
  0,
  0,
  500,
  50,
  0,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ride_fare_config 
  WHERE vehicle_category = 'truck' 
    AND service_tier = 'default' 
    AND city_tier = 'national'
);

-- ─── 7. Verification Query ───────────────────────────────────────────────────

-- Check all configs
SELECT 
  vehicle_category,
  service_tier,
  city_tier,
  states,
  estimated_billing_unit,
  min_amount_less_than_3km,
  is_active
FROM ride_fare_config
ORDER BY vehicle_category, service_tier, city_tier;
