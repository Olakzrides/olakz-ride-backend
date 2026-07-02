-- ─────────────────────────────────────────────────────────────────────────────
-- Transport Hire Migration
-- Date: 2026-07-01
-- Description: Creates transport_hires table and seeds hire fare config rows
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. transport_hires table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport_hires (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_number           TEXT          NOT NULL UNIQUE,               -- e.g. HIRE-20260701-0001

  -- Parties
  customer_id           UUID          NOT NULL REFERENCES users(id),
  driver_id             UUID          REFERENCES drivers(id),

  -- Locations
  pickup_address        TEXT          NOT NULL,
  pickup_lat            DECIMAL(10,7) NOT NULL,
  pickup_lng            DECIMAL(10,7) NOT NULL,
  destination_address   TEXT          NOT NULL,
  destination_lat       DECIMAL(10,7) NOT NULL,
  destination_lng       DECIMAL(10,7) NOT NULL,

  -- Vehicle selection
  vehicle_category      TEXT          NOT NULL
    CHECK (vehicle_category IN ('car', 'mini_bus', 'bus', 'truck')),
  vehicle_sub_type      TEXT          NOT NULL,
  -- car:     standard | premium | vip_premium
  -- mini_bus: mini_bus_7
  -- bus:      bus_10
  -- truck:    truck_10t | truck_20t | truck_30t

  -- Schedule
  start_datetime        TIMESTAMPTZ   NOT NULL,
  end_datetime          TIMESTAMPTZ   NOT NULL,

  -- Fare
  distance_km           DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount                DECIMAL(12,2) NOT NULL DEFAULT 0,
  driver_fare           DECIMAL(12,2) NOT NULL DEFAULT 0,
  service_fee           DECIMAL(10,2) NOT NULL DEFAULT 0,
  rounding_fee          DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency_code         VARCHAR(10)   NOT NULL DEFAULT 'NGN',

  -- Payment
  payment_method        TEXT          NOT NULL DEFAULT 'wallet'
    CHECK (payment_method IN ('wallet', 'cash', 'transfer')),
  payment_status        TEXT          NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  payment_hold_id       UUID,                                        -- wallet_transactions hold row

  -- Booking for someone else
  for_whom              TEXT          NOT NULL DEFAULT 'self'
    CHECK (for_whom IN ('self', 'other')),
  passenger_name        TEXT,
  passenger_phone       TEXT,
  note                  TEXT,

  -- Lifecycle
  status                TEXT          NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',          -- created, not yet confirmed/paid
      'searching',        -- payment done, searching for driver
      'driver_assigned',  -- driver accepted
      'confirmed',        -- driver confirmed pick-up time
      'in_progress',      -- hire underway
      'completed',        -- hire finished
      'cancelled',        -- cancelled by customer or system
      'no_driver_found'   -- search timeout, no driver accepted
    )),
  cancellation_reason   TEXT,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transport_hires_customer_id
  ON transport_hires (customer_id);

CREATE INDEX IF NOT EXISTS idx_transport_hires_driver_id
  ON transport_hires (driver_id)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transport_hires_status
  ON transport_hires (status);

CREATE INDEX IF NOT EXISTS idx_transport_hires_vehicle_category
  ON transport_hires (vehicle_category);

CREATE INDEX IF NOT EXISTS idx_transport_hires_start_datetime
  ON transport_hires (start_datetime);

CREATE INDEX IF NOT EXISTS idx_transport_hires_customer_status
  ON transport_hires (customer_id, status);

-- ── 3. hire_requests table (driver accept/reject tracking) ───────────────────
-- Mirrors ride_requests for driver dispatch tracking.
CREATE TABLE IF NOT EXISTS hire_requests (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_id               UUID          NOT NULL REFERENCES transport_hires(id) ON DELETE CASCADE,
  driver_id             UUID          NOT NULL REFERENCES drivers(id),
  status                TEXT          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  distance_from_pickup  DECIMAL(10,2),
  estimated_arrival     INTEGER,                                     -- minutes
  batch_number          INTEGER       NOT NULL DEFAULT 1,
  expires_at            TIMESTAMPTZ   NOT NULL,
  responded_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hire_requests_hire_id
  ON hire_requests (hire_id);

CREATE INDEX IF NOT EXISTS idx_hire_requests_driver_id
  ON hire_requests (driver_id);

CREATE INDEX IF NOT EXISTS idx_hire_requests_status
  ON hire_requests (status);

-- ── 4. Hire number sequence function ─────────────────────────────────────────
-- Generates HIRE-YYYYMMDD-NNNN format hire numbers.
CREATE OR REPLACE FUNCTION generate_hire_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_date   TEXT;
  v_seq    INTEGER;
  v_number TEXT;
BEGIN
  v_date := TO_CHAR(now(), 'YYYYMMDD');
  SELECT COUNT(*) + 1
  INTO   v_seq
  FROM   transport_hires
  WHERE  hire_number LIKE 'HIRE-' || v_date || '-%';
  v_number := 'HIRE-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');
  RETURN v_number;
END;
$$;

-- ── 5. Seed hire fare config rows into ride_fare_config ──────────────────────
-- Transport hire reuses the existing ride_fare_config table.
-- Categories: hire_car (standard/premium/vip), hire_mini_bus, hire_bus,
--             hire_truck_10t, hire_truck_20t, hire_truck_30t
-- All use city_tier = 'national' as the seed (admin can add tiered rows later).

INSERT INTO ride_fare_config (
  vehicle_category, service_tier, city_tier,
  estimated_billing_unit, high_traffic_estimated_billing_unit,
  min_amount_less_than_3km, min_amount_for_shared_ride,
  shared_discount_percent, service_fee, rounding_fee, booking_fee,
  fleet_commission_percent, is_active
)
VALUES
  -- Car - Standard hire
  ('hire_car', 'standard',    'national', 500,  650,  4000, 0, 0, 500, 50, 0, 10, true),
  -- Car - Premium hire
  ('hire_car', 'premium',     'national', 700,  900,  5500, 0, 0, 600, 50, 0, 10, true),
  -- Car - VIP hire
  ('hire_car', 'vip',         'national', 1000, 1300, 7500, 0, 0, 800, 50, 0, 10, true),
  -- Mini Bus (7 seater)
  ('hire_mini_bus', 'default','national', 600,  800,  5000, 0, 0, 600, 50, 0, 10, true),
  -- Bus (10 seater)
  ('hire_bus', 'default',     'national', 800,  1000, 7000, 0, 0, 700, 50, 0, 10, true),
  -- Truck 10 Tons
  ('hire_truck', '10t',       'national', 1200, 1500, 10000,0, 0, 1000,50, 0, 10, true),
  -- Truck 20 Tons
  ('hire_truck', '20t',       'national', 1800, 2200, 15000,0, 0, 1200,50, 0, 10, true),
  -- Truck 30 Tons
  ('hire_truck', '30t',       'national', 2500, 3000, 20000,0, 0, 1500,50, 0, 10, true)
ON CONFLICT (vehicle_category, service_tier, city_tier) DO NOTHING;

-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE transport_hires ENABLE ROW LEVEL SECURITY;
ALTER TABLE hire_requests    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_transport_hires"
    ON transport_hires FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_hire_requests"
    ON hire_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
