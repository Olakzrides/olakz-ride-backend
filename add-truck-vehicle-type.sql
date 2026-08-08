-- Add 'truck' as a valid vehicle type in marketplace_fare_config and food_fare_config.
-- Run this once in your Supabase SQL editor.

-- ── 1. Drop the existing CHECK constraint on marketplace_fare_config ──────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    DROP CONSTRAINT marketplace_fare_config_vehicle_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ── 2. Re-add it with 'truck' included ────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_vehicle_check
    CHECK (vehicle_type IN ('car', 'motorcycle', 'bicycle', 'bus', 'truck', 'fleet'));
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- ── 3. Drop the existing CHECK constraint on food_fare_config (if any) ────────
DO $$ BEGIN
  ALTER TABLE food_fare_config
    DROP CONSTRAINT food_fare_config_vehicle_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ── 4. Confirm (optional — run to verify) ─────────────────────────────────────
SELECT vehicle_type, city_tier, estimated_billing_unit, service_fee, is_active
FROM marketplace_fare_config
ORDER BY vehicle_type, city_tier;
