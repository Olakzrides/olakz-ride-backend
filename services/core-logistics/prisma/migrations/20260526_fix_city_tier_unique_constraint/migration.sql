-- Migration: Fix city-tier unique constraint on ride_fare_config
-- Date: 2026-05-26
-- Problem: The original constraint ride_fare_config_vehicle_tier_unique only covers
--          (vehicle_category, service_tier). The 20260523 migration tried to drop
--          ride_fare_config_vehicle_category_service_tier_key (wrong name), so the
--          old 2-column constraint was never removed. This blocks inserting multiple
--          city-tier rows for the same vehicle+service combination.

-- ─── 1. Drop the old 2-column unique constraint ──────────────────────────────

ALTER TABLE ride_fare_config
DROP CONSTRAINT IF EXISTS ride_fare_config_vehicle_tier_unique;

-- Also drop the one from the previous migration attempt (in case it was created)
ALTER TABLE ride_fare_config
DROP CONSTRAINT IF EXISTS ride_fare_config_vehicle_category_service_tier_city_tier_key;

-- Also drop the Prisma-generated name (in case Prisma applied it)
ALTER TABLE ride_fare_config
DROP CONSTRAINT IF EXISTS ride_fare_config_vehicle_category_service_tier_key;

-- ─── 2. Ensure city_tier column exists with correct default ──────────────────

ALTER TABLE ride_fare_config
ADD COLUMN IF NOT EXISTS city_tier VARCHAR(20) NOT NULL DEFAULT 'national';

ALTER TABLE ride_fare_config
ADD COLUMN IF NOT EXISTS states JSONB NOT NULL DEFAULT '[]';

-- ─── 3. Update any existing rows that have NULL city_tier ────────────────────

UPDATE ride_fare_config
SET city_tier = 'national', states = '[]'
WHERE city_tier IS NULL OR city_tier = '';

-- ─── 4. Add the correct 3-column unique constraint ───────────────────────────

ALTER TABLE ride_fare_config
ADD CONSTRAINT ride_fare_config_vehicle_tier_unique
UNIQUE (vehicle_category, service_tier, city_tier);

-- ─── 5. Ensure indexes exist ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ride_fare_config_city_tier
ON ride_fare_config (city_tier);

CREATE INDEX IF NOT EXISTS idx_ride_fare_config_states
ON ride_fare_config USING GIN (states);

-- ─── 6. Verify ───────────────────────────────────────────────────────────────

SELECT
  vehicle_category,
  service_tier,
  city_tier,
  states,
  estimated_billing_unit
FROM ride_fare_config
ORDER BY vehicle_category, service_tier, city_tier;
