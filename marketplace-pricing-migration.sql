-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace Fare Config — Migration
--
-- Existing table schema (created by colleague):
--   vehicle_type (unique), price_per_km, minimum_delivery_fee,
--   service_fee, currency_code, is_active
--
-- We keep vehicle_type as-is (no rename) and add city_tier + new pricing cols.
-- Safe to run multiple times — all steps are guarded.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: rename price_per_km → estimated_billing_unit ─────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    RENAME COLUMN price_per_km TO estimated_billing_unit;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ── Step 2: rename minimum_delivery_fee → min_amount_less_than_3km ───────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    RENAME COLUMN minimum_delivery_fee TO min_amount_less_than_3km;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ── Step 3: add new columns (idempotent — IF NOT EXISTS) ─────────────────────
ALTER TABLE marketplace_fare_config
  ADD COLUMN IF NOT EXISTS city_tier                           text          NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS high_traffic_estimated_billing_unit numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_fee                        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_fee                         numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_commission_percent            numeric(5,2)  NOT NULL DEFAULT 0;

-- ── Step 4: drop old single-column unique on vehicle_type ────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    DROP CONSTRAINT marketplace_fare_config_vehicle_type_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Prisma-generated constraint name fallback
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    DROP CONSTRAINT marketplace_fare_configs_vehicle_type_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ── Step 5: add composite unique (vehicle_type, city_tier) ───────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_unique
    UNIQUE (vehicle_type, city_tier);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- ── Step 6: add CHECK constraints ────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_vehicle_check
    CHECK (vehicle_type IN ('car', 'motorcycle', 'bicycle', 'bus', 'fleet'));
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_tier_check
    CHECK (city_tier IN ('high', 'middle', 'low'));
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE marketplace_fare_config
    ADD CONSTRAINT marketplace_fare_config_commission_check
    CHECK (fleet_commission_percent >= 0 AND fleet_commission_percent <= 100);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- ── Step 7: patch any NULLs on renamed columns before seeding ────────────────
UPDATE marketplace_fare_config
  SET
    estimated_billing_unit              = COALESCE(estimated_billing_unit, 0),
    high_traffic_estimated_billing_unit = COALESCE(high_traffic_estimated_billing_unit, 0),
    min_amount_less_than_3km            = COALESCE(min_amount_less_than_3km, 0),
    city_tier                           = COALESCE(city_tier, 'low')
  WHERE
    estimated_billing_unit              IS NULL
    OR high_traffic_estimated_billing_unit IS NULL
    OR min_amount_less_than_3km         IS NULL
    OR city_tier                        IS NULL;

-- ── Step 8: seed high + middle rows copied from the existing low rows ─────────
-- Existing rows (one per vehicle_type) become the 'low' baseline.
-- This copies them into high and middle so admin can tune per tier from the UI.
INSERT INTO marketplace_fare_config (
  vehicle_type,
  city_tier,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  service_fee,
  rounding_fee,
  booking_fee,
  fleet_commission_percent,
  is_active
)
SELECT
  low.vehicle_type,
  t.city_tier,
  low.estimated_billing_unit,
  low.high_traffic_estimated_billing_unit,
  low.min_amount_less_than_3km,
  low.service_fee,
  low.rounding_fee,
  low.booking_fee,
  low.fleet_commission_percent,
  low.is_active
FROM marketplace_fare_config low
CROSS JOIN (VALUES ('high'), ('middle')) AS t(city_tier)
WHERE low.city_tier = 'low'
ON CONFLICT (vehicle_type, city_tier) DO NOTHING;

-- ── Step 9: indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_marketplace_fare_config_vehicle_type
  ON marketplace_fare_config (vehicle_type);

CREATE INDEX IF NOT EXISTS idx_marketplace_fare_config_tier
  ON marketplace_fare_config (city_tier);

-- ── Step 10: RLS ──────────────────────────────────────────────────────────────
ALTER TABLE marketplace_fare_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_marketplace_fare_config"
    ON marketplace_fare_config
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
