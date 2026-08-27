-- ============================================================
-- Auto Mech Service — Migration 004: Booking Enhancements
-- 
-- What this adds:
--  1. auto_mech_services   → price_min, price_max (range pricing shown on UI)
--  2. auto_mech_bookings   → booking_reference (#MEC-YYYY-XXXXXX)
--                          → vehicle_make, vehicle_model, vehicle_year, vehicle_plate_number
--                            (replaces free-text vehicle_description for structured booking form)
--                          → estimated_cost_min, estimated_cost_max (₦15,000 - ₦50,000 range)
--                          → duration_display (e.g. "60-180 minutes" on confirm screen)
--  3. Booking reference    → auto-generate sequence + trigger
--  4. auto_mech_vendors    → is_open index (missing from 002)
--  5. RLS service-role     → bypass policies so backend can write all tables
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. PRICE RANGE on auto_mech_services
--    The UI shows "₦15,000 - ₦50,000".
--    price stays as the base/min price for backward compat.
--    price_min mirrors price; price_max is the upper bound.
--    If price_max IS NULL the service has a fixed price (no range).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auto_mech_services
  ADD COLUMN IF NOT EXISTS price_min NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS price_max NUMERIC(10, 2);

-- Back-fill: price_min = price for all existing rows
UPDATE auto_mech_services
SET price_min = price
WHERE price_min IS NULL;

-- price_min must be > 0; price_max must be >= price_min when set
ALTER TABLE auto_mech_services
  ADD CONSTRAINT chk_auto_mech_service_price_min_positive
    CHECK (price_min IS NULL OR price_min >= 0),
  ADD CONSTRAINT chk_auto_mech_service_price_max_range
    CHECK (price_max IS NULL OR (price_min IS NOT NULL AND price_max >= price_min));

COMMENT ON COLUMN auto_mech_services.price_min IS
  'Minimum estimated cost for this service. Mirrors price column for backward compat.';
COMMENT ON COLUMN auto_mech_services.price_max IS
  'Maximum estimated cost. NULL means fixed price. When set, UI shows "₦X - ₦Y" range.';

-- ─────────────────────────────────────────────────────────────
-- 2. VEHICLE STRUCTURED FIELDS on auto_mech_bookings
--    The booking form collects Make, Model, Year, Plate Number
--    as separate fields. vehicle_description kept for free-text notes.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auto_mech_bookings
  ADD COLUMN IF NOT EXISTS vehicle_make         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vehicle_model        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vehicle_year         SMALLINT,
  ADD COLUMN IF NOT EXISTS vehicle_plate_number VARCHAR(30);

-- Soft constraint: year must be a reasonable car year if provided
ALTER TABLE auto_mech_bookings
  ADD CONSTRAINT chk_auto_mech_booking_vehicle_year
    CHECK (vehicle_year IS NULL OR (vehicle_year >= 1900 AND vehicle_year <= 2100));

CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_vehicle_plate
  ON auto_mech_bookings(vehicle_plate_number)
  WHERE vehicle_plate_number IS NOT NULL;

COMMENT ON COLUMN auto_mech_bookings.vehicle_make         IS 'e.g. Toyota, Honda, Mercedes';
COMMENT ON COLUMN auto_mech_bookings.vehicle_model        IS 'e.g. Camry, Accord, C-Class';
COMMENT ON COLUMN auto_mech_bookings.vehicle_year         IS '4-digit year e.g. 2026';
COMMENT ON COLUMN auto_mech_bookings.vehicle_plate_number IS 'e.g. AHD583';

-- ─────────────────────────────────────────────────────────────
-- 3. ESTIMATED COST RANGE on auto_mech_bookings
--    Stored at booking time from the service price range so the
--    confirmation screen always shows the original estimate even
--    if the service pricing changes later.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auto_mech_bookings
  ADD COLUMN IF NOT EXISTS estimated_cost_min NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS estimated_cost_max NUMERIC(10, 2);

-- Back-fill from total_amount for existing rows
UPDATE auto_mech_bookings
SET estimated_cost_min = total_amount
WHERE estimated_cost_min IS NULL;

COMMENT ON COLUMN auto_mech_bookings.estimated_cost_min IS
  'Lower bound of cost estimate shown to customer at booking time.';
COMMENT ON COLUMN auto_mech_bookings.estimated_cost_max IS
  'Upper bound of cost estimate. NULL means fixed price. Matches service price range at booking time.';

-- ─────────────────────────────────────────────────────────────
-- 4. DURATION DISPLAY on auto_mech_bookings
--    Derived from service.duration_minutes at booking time.
--    Stored as a human-readable string e.g. "60-180 minutes"
--    so the confirm screen never needs to re-query the service.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auto_mech_bookings
  ADD COLUMN IF NOT EXISTS duration_display VARCHAR(50);

COMMENT ON COLUMN auto_mech_bookings.duration_display IS
  'Human-readable duration shown on confirmation screen e.g. "60-180 minutes".';

-- ─────────────────────────────────────────────────────────────
-- 5. BOOKING REFERENCE — auto-generated #MEC-YYYY-XXXXXX
--    Format: MEC-{YEAR}-{6-digit zero-padded sequence per year}
--    e.g.  MEC-2024-001234
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auto_mech_bookings
  ADD COLUMN IF NOT EXISTS booking_reference VARCHAR(30) UNIQUE;

-- Per-year sequence table so numbers reset each calendar year
CREATE TABLE IF NOT EXISTS auto_mech_booking_ref_seq (
  year          SMALLINT PRIMARY KEY,
  last_sequence INTEGER  NOT NULL DEFAULT 0
);

-- Function: atomically increment per-year counter and return next value
CREATE OR REPLACE FUNCTION next_auto_mech_booking_sequence(p_year SMALLINT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO auto_mech_booking_ref_seq (year, last_sequence)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_sequence = auto_mech_booking_ref_seq.last_sequence + 1
  RETURNING last_sequence INTO v_next;
  RETURN v_next;
END;
$$;

-- Function: build the reference string
CREATE OR REPLACE FUNCTION generate_auto_mech_booking_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_year    SMALLINT;
  v_seq     INTEGER;
BEGIN
  -- Only generate once (on INSERT or when still NULL)
  IF NEW.booking_reference IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.created_at)::SMALLINT;
  v_seq  := next_auto_mech_booking_sequence(v_year);

  NEW.booking_reference := 'MEC-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$;

-- Trigger: fires before INSERT so the reference is set immediately
DROP TRIGGER IF EXISTS trg_auto_mech_booking_reference ON auto_mech_bookings;
CREATE TRIGGER trg_auto_mech_booking_reference
  BEFORE INSERT ON auto_mech_bookings
  FOR EACH ROW EXECUTE FUNCTION generate_auto_mech_booking_reference();

-- Back-fill references for any existing rows that don't have one yet
DO $$
DECLARE
  rec    RECORD;
  v_year SMALLINT;
  v_seq  INTEGER;
BEGIN
  FOR rec IN
    SELECT id, created_at
    FROM auto_mech_bookings
    WHERE booking_reference IS NULL
    ORDER BY created_at ASC
  LOOP
    v_year := EXTRACT(YEAR FROM rec.created_at)::SMALLINT;
    v_seq  := next_auto_mech_booking_sequence(v_year);

    UPDATE auto_mech_bookings
    SET booking_reference = 'MEC-' || v_year::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0')
    WHERE id = rec.id;
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_reference
  ON auto_mech_bookings(booking_reference);

-- ─────────────────────────────────────────────────────────────
-- 6. MISSING INDEX on auto_mech_vendors.is_open
--    (column added in 002 but index was not created)
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_auto_mech_vendors_is_open
  ON auto_mech_vendors(is_open);

-- ─────────────────────────────────────────────────────────────
-- 7. RLS — service-role bypass policies
--    Supabase service-role key must be able to INSERT/UPDATE/DELETE
--    from the backend. Without these the service role is blocked by RLS.
-- ─────────────────────────────────────────────────────────────

-- auto_mech_vendors: service role full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'auto_mech_vendors'
      AND policyname = 'service_role_all_auto_mech_vendors'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service_role_all_auto_mech_vendors"
        ON auto_mech_vendors
        USING     (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role')
    $policy$;
  END IF;
END;
$$;

-- auto_mech_services: service role full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'auto_mech_services'
      AND policyname = 'service_role_all_auto_mech_services'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service_role_all_auto_mech_services"
        ON auto_mech_services
        USING     (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role')
    $policy$;
  END IF;
END;
$$;

-- auto_mech_bookings: service role full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'auto_mech_bookings'
      AND policyname = 'service_role_all_auto_mech_bookings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service_role_all_auto_mech_bookings"
        ON auto_mech_bookings
        USING     (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role')
    $policy$;
  END IF;
END;
$$;

-- auto_mech_vendor_categories: service role full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'auto_mech_vendor_categories'
      AND policyname = 'service_role_all_auto_mech_vendor_categories'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "service_role_all_auto_mech_vendor_categories"
        ON auto_mech_vendor_categories
        USING     (auth.role() = 'service_role')
        WITH CHECK (auth.role() = 'service_role')
    $policy$;
  END IF;
END;
$$;
