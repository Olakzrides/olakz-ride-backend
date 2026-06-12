-- ─────────────────────────────────────────────────────────────────────────────
-- Shared Delivery Pricing Sync Migration
--
-- marketplace_fare_config is the single source of truth.
-- food_fare_config and delivery_fare_config are kept in sync from it.
--
-- Changes:
--   food_fare_config:     rename price_per_km → estimated_billing_unit
--                         rename minimum_delivery_fee → min_amount_less_than_3km
--                         add high_traffic_estimated_billing_unit, booking_fee,
--                             fleet_commission_percent, city_tier
--   delivery_fare_config: add estimated_billing_unit, min_amount_less_than_3km,
--                             high_traffic_estimated_billing_unit, booking_fee,
--                             fleet_commission_percent, city_tier
--                         keep vehicle_type_id (FK to vehicle_types)
--
-- Safe to re-run — all steps are guarded.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- FOOD FARE CONFIG
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Rename price_per_km → estimated_billing_unit
DO $$ BEGIN
  ALTER TABLE food_fare_config RENAME COLUMN price_per_km TO estimated_billing_unit;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 2. Rename minimum_delivery_fee → min_amount_less_than_3km
DO $$ BEGIN
  ALTER TABLE food_fare_config RENAME COLUMN minimum_delivery_fee TO min_amount_less_than_3km;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- 3. Add new columns
ALTER TABLE food_fare_config
  ADD COLUMN IF NOT EXISTS city_tier                           TEXT          NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS high_traffic_estimated_billing_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_fee                         NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_commission_percent            NUMERIC(5,2)  NOT NULL DEFAULT 0;

-- 4. Drop old single-column unique (vehicle_type), replace with (vehicle_type, city_tier)
DO $$ BEGIN
  ALTER TABLE food_fare_config DROP CONSTRAINT food_fare_config_vehicle_type_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE food_fare_config DROP CONSTRAINT food_fare_configs_vehicle_type_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE food_fare_config
    ADD CONSTRAINT food_fare_config_unique UNIQUE (vehicle_type, city_tier);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- 5. Patch any NULLs from rename
UPDATE food_fare_config
  SET
    estimated_billing_unit              = COALESCE(estimated_billing_unit, 0),
    min_amount_less_than_3km            = COALESCE(min_amount_less_than_3km, 0),
    high_traffic_estimated_billing_unit = COALESCE(high_traffic_estimated_billing_unit, 0),
    city_tier                           = COALESCE(city_tier, 'low');

-- 6. Seed high + middle rows from existing low rows
INSERT INTO food_fare_config (
  vehicle_type, city_tier,
  estimated_billing_unit, high_traffic_estimated_billing_unit,
  min_amount_less_than_3km, service_fee, rounding_fee, booking_fee,
  fleet_commission_percent, is_active
)
SELECT
  low.vehicle_type, t.city_tier,
  low.estimated_billing_unit, low.high_traffic_estimated_billing_unit,
  low.min_amount_less_than_3km, low.service_fee, low.rounding_fee,
  low.booking_fee, low.fleet_commission_percent, low.is_active
FROM food_fare_config low
CROSS JOIN (VALUES ('high'), ('middle')) AS t(city_tier)
WHERE low.city_tier = 'low'
ON CONFLICT (vehicle_type, city_tier) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- DELIVERY FARE CONFIG
-- ══════════════════════════════════════════════════════════════════════════════

-- 7. Add new shared pricing columns
ALTER TABLE delivery_fare_config
  ADD COLUMN IF NOT EXISTS estimated_billing_unit              NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_traffic_estimated_billing_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_amount_less_than_3km            NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_fee                         NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_commission_percent            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city_tier                           TEXT          NOT NULL DEFAULT 'low';

-- 8. Backfill new columns from existing columns where value is still 0
UPDATE delivery_fare_config
  SET
    estimated_billing_unit   = COALESCE(NULLIF(estimated_billing_unit,   0), price_per_km,  0),
    min_amount_less_than_3km = COALESCE(NULLIF(min_amount_less_than_3km, 0), minimum_fare,  0)
  WHERE estimated_billing_unit = 0 OR min_amount_less_than_3km = 0;

-- 9. Drop old 2-column unique, replace with 3-column (vehicle_type_id, region_id, city_tier)
--    so we can store one row per tier per vehicle per region
DO $$ BEGIN
  ALTER TABLE delivery_fare_config
    DROP CONSTRAINT delivery_fare_config_vehicle_type_id_region_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE delivery_fare_config
    DROP CONSTRAINT fk_delivery_fare_config_vehicle_type_id_region_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE delivery_fare_config
    ADD CONSTRAINT delivery_fare_config_unique
    UNIQUE (vehicle_type_id, region_id, city_tier);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- DELIVERY FARE CONFIG — seed one row per (vehicle_type × city_tier)
-- ⚠️  Run this AFTER the constraint in step 9 has been committed.
--     If you get an ON CONFLICT error, run steps 1-9 first, then run this
--     seed block separately in a second query.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO delivery_fare_config (
  vehicle_type_id,
  region_id,
  base_fare,
  price_per_km,
  minimum_fare,
  service_fee,
  rounding_fee,
  estimated_billing_unit,
  high_traffic_estimated_billing_unit,
  min_amount_less_than_3km,
  booking_fee,
  fleet_commission_percent,
  city_tier,
  currency_code,
  is_active
)
SELECT
  vt.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  0, 0, 0,
  0, 0,
  0, 0, 0,
  0, 0,
  tiers.city_tier,
  'NGN',
  true
FROM vehicle_types vt
CROSS JOIN (VALUES ('high'), ('middle'), ('low')) AS tiers(city_tier)
WHERE LOWER(vt.name) IN ('car', 'motorcycle', 'bicycle', 'bus', 'fleet', 'truck')
ON CONFLICT (vehicle_type_id, region_id, city_tier) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- MARKETPLACE FARE CONFIG — add rounding_fee to marketplace_orders
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS rounding_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
