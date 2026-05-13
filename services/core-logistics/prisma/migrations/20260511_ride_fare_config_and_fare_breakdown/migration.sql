-- Migration: Ride Fare Config + Fare Breakdown Fields on Rides
-- Adds admin-configurable pricing table and fare breakdown columns to rides

-- ─── 1. Create ride_fare_config table ────────────────────────────────────────
-- One row per vehicle category + service tier combination.
-- Service tiers (standard/premium/vip) only apply to cars.
-- All other vehicle categories use service_tier = 'default'.

CREATE TABLE IF NOT EXISTS ride_fare_config (
  id                                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_category                  VARCHAR(20) NOT NULL,                    -- car | bicycle | motorcycle | bus | truck
  service_tier                      VARCHAR(20) NOT NULL DEFAULT 'default',  -- car: standard|premium|vip  |  others: default
  estimated_billing_unit            DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Normal traffic rate per km (e.g. 490)
  high_traffic_estimated_billing_unit DECIMAL(10,2) NOT NULL DEFAULT 0,      -- Peak hour rate per km (car only)
  min_amount_less_than_3km          DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Flat fee when distance <= 3km (e.g. 3500)
  min_amount_for_shared_ride        DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Minimum fare for shared rides (car only)
  shared_discount_percent           DECIMAL(5,2)  NOT NULL DEFAULT 0,        -- e.g. 20 = 20% off for shared rides > 3km
  service_fee                       DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Platform flat fee per ride (hidden from driver)
  rounding_fee                      DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Rounding adjustment (hidden from driver)
  booking_fee                       DECIMAL(10,2) NOT NULL DEFAULT 0,        -- Booking fee (motorcycle only)
  fleet_commission_percent          DECIMAL(5,2)  NOT NULL DEFAULT 0,        -- % taken from driver earnings for fleet
  is_active                         BOOLEAN       NOT NULL DEFAULT true,
  created_at                        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT ride_fare_config_vehicle_tier_unique UNIQUE (vehicle_category, service_tier)
);

CREATE INDEX IF NOT EXISTS idx_ride_fare_config_category    ON ride_fare_config (vehicle_category);
CREATE INDEX IF NOT EXISTS idx_ride_fare_config_active      ON ride_fare_config (is_active);

-- ─── 2. Seed default rows ─────────────────────────────────────────────────────
-- Car tiers (Standard / Premium / VIP)
INSERT INTO ride_fare_config (vehicle_category, service_tier, estimated_billing_unit, high_traffic_estimated_billing_unit, min_amount_less_than_3km, min_amount_for_shared_ride, shared_discount_percent, service_fee, rounding_fee, booking_fee, fleet_commission_percent)
VALUES
  ('car', 'standard', 490,  650,  3500, 2800, 20, 500, 50, 0, 10),
  ('car', 'premium',  650,  850,  4500, 3600, 20, 500, 50, 0, 10),
  ('car', 'vip',      900, 1200,  6000, 4800, 20, 500, 50, 0, 10),
  ('bicycle',    'default', 100, 130,  800,  0,   0,  100, 20,   0, 10),
  ('motorcycle', 'default', 200, 260, 1500,  0,   0,  200, 30, 100, 10),
  ('bus',        'default', 350, 450, 3000,  0,   0,  500, 50,   0, 10),
  ('truck',      'default', 800, 1000, 8000, 0,   0,  500, 50,   0, 10)
ON CONFLICT (vehicle_category, service_tier) DO NOTHING;

-- ─── 3. Add fare breakdown columns to rides table ────────────────────────────
-- These store the split between driver earnings and platform fees at booking time.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_fare         DECIMAL(10,2) DEFAULT 0,   -- Driver's portion (billing_unit × distance)
  ADD COLUMN IF NOT EXISTS final_driver_fare   DECIMAL(10,2) DEFAULT NULL, -- Driver's actual earnings after trip completes
  ADD COLUMN IF NOT EXISTS service_fee         DECIMAL(10,2) DEFAULT 0,   -- Platform fee charged to customer (hidden from driver)
  ADD COLUMN IF NOT EXISTS rounding_fee        DECIMAL(10,2) DEFAULT 0,   -- Rounding adjustment (hidden from driver)
  ADD COLUMN IF NOT EXISTS shared_discount     DECIMAL(10,2) DEFAULT 0;   -- Discount applied for shared rides > 3km

-- Index for analytics queries on fare breakdown
CREATE INDEX IF NOT EXISTS idx_rides_driver_fare ON rides (driver_fare);
