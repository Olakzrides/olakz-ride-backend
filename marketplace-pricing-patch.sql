-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace Fare Config — Column Name Patch
--
-- The earlier migration attempt renamed vehicle_type → vehicle_category.
-- We want vehicle_type (original name) back so the marketplace-service
-- Prisma client and our admin service both use the same column name.
--
-- Run this ONCE in Supabase SQL Editor.
-- Safe to re-run — all steps are guarded.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Rename vehicle_category back to vehicle_type ───────────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    RENAME COLUMN vehicle_category TO vehicle_type;
EXCEPTION WHEN undefined_column THEN NULL;  -- already vehicle_type, nothing to do
END $$;

-- ── 2. Drop any constraint referencing vehicle_category ───────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    DROP CONSTRAINT marketplace_fare_config_vehicle_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    DROP CONSTRAINT marketplace_fare_config_unique;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ── 3. Re-add constraints using vehicle_type ─────────────────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_unique
    UNIQUE (vehicle_type, city_tier);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_vehicle_check
    CHECK (vehicle_type IN ('car', 'motorcycle', 'bicycle', 'bus', 'fleet'));
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- ── 4. Fix index name to match new column ─────────────────────────────────────
DROP INDEX IF EXISTS idx_marketplace_fare_config_category;

CREATE INDEX IF NOT EXISTS idx_marketplace_fare_config_vehicle_type
  ON marketplace_fare_config (vehicle_type);

-- ── 5. Verify (run SELECT to confirm) ─────────────────────────────────────────
SELECT vehicle_type, city_tier, estimated_billing_unit, service_fee, is_active
FROM marketplace_fare_config
ORDER BY vehicle_type, city_tier
LIMIT 20;
