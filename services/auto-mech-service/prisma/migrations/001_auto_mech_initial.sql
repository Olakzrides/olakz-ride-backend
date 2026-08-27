-- ============================================================
-- Auto Mech Service — Initial Schema Migration
-- Run this in your Supabase SQL editor or via psql
-- ============================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- AUTO_MECH_VENDORS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_mech_vendors (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE,
  business_name     VARCHAR(150) NOT NULL,
  description       TEXT,
  phone             VARCHAR(20)  NOT NULL,
  email             VARCHAR(150),
  address           TEXT         NOT NULL,
  city              VARCHAR(100) NOT NULL,
  state             VARCHAR(100) NOT NULL,
  latitude          NUMERIC(10, 8) NOT NULL,
  longitude         NUMERIC(11, 8) NOT NULL,
  cover_image_url   TEXT,
  logo_url          TEXT,
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  rating            NUMERIC(3, 2) NOT NULL DEFAULT 0,
  total_customers   INTEGER      NOT NULL DEFAULT 0,
  total_hours_served NUMERIC(10, 2) NOT NULL DEFAULT 0,
  operating_hours   JSONB        NOT NULL DEFAULT '{}',
  rejection_reason  TEXT,
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_mech_vendors_user_id  ON auto_mech_vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_mech_vendors_status   ON auto_mech_vendors(status);
CREATE INDEX IF NOT EXISTS idx_auto_mech_vendors_city     ON auto_mech_vendors(city);
CREATE INDEX IF NOT EXISTS idx_auto_mech_vendors_state    ON auto_mech_vendors(state);
CREATE INDEX IF NOT EXISTS idx_auto_mech_vendors_rating   ON auto_mech_vendors(rating DESC);

-- ─────────────────────────────────────────────────────────────
-- AUTO_MECH_SERVICES (packages)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_mech_services (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID        NOT NULL REFERENCES auto_mech_vendors(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  category         VARCHAR(50)  NOT NULL,   -- oil_change | tyre_service | brake_service | engine_repair | electrical_repair | general_service
  duration_minutes INTEGER      NOT NULL,
  price            NUMERIC(10, 2) NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_mech_services_vendor_id        ON auto_mech_services(vendor_id);
CREATE INDEX IF NOT EXISTS idx_auto_mech_services_category         ON auto_mech_services(category);
CREATE INDEX IF NOT EXISTS idx_auto_mech_services_is_active        ON auto_mech_services(is_active);
CREATE INDEX IF NOT EXISTS idx_auto_mech_services_vendor_active    ON auto_mech_services(vendor_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- AUTO_MECH_BOOKINGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_mech_bookings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID        NOT NULL,
  vendor_id            UUID        NOT NULL REFERENCES auto_mech_vendors(id),
  service_id           UUID        NOT NULL REFERENCES auto_mech_services(id),

  booking_type         VARCHAR(20)  NOT NULL DEFAULT 'book_now',
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending',

  scheduled_at         TIMESTAMPTZ,

  service_address      TEXT         NOT NULL,
  service_latitude     NUMERIC(10, 8) NOT NULL,
  service_longitude    NUMERIC(11, 8) NOT NULL,

  vehicle_description  TEXT,
  vehicle_photo_urls   TEXT[]       NOT NULL DEFAULT '{}',

  notes                TEXT,

  total_amount         NUMERIC(10, 2) NOT NULL,
  payment_method       VARCHAR(20)  NOT NULL DEFAULT 'wallet',
  payment_status       VARCHAR(20)  NOT NULL DEFAULT 'pending',

  cancellation_reason  TEXT,
  cancelled_at         TIMESTAMPTZ,

  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,

  customer_rating      SMALLINT CHECK (customer_rating BETWEEN 1 AND 5),
  customer_feedback    TEXT,

  vendor_rating        SMALLINT CHECK (vendor_rating BETWEEN 1 AND 5),

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_customer_id      ON auto_mech_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_vendor_id        ON auto_mech_bookings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_service_id       ON auto_mech_bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_status           ON auto_mech_bookings(status);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_booking_type     ON auto_mech_bookings(booking_type);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_scheduled_at     ON auto_mech_bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_created_at       ON auto_mech_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_vendor_status    ON auto_mech_bookings(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_auto_mech_bookings_customer_status  ON auto_mech_bookings(customer_id, status);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_auto_mech_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['auto_mech_vendors', 'auto_mech_services', 'auto_mech_bookings']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'set_auto_mech_updated_at_' || t
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER set_auto_mech_updated_at_%I
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_auto_mech_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (Supabase)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE auto_mech_vendors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_mech_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_mech_bookings ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved vendors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'auto_mech_vendors'
      AND policyname = 'public_read_approved_auto_mech_vendors'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "public_read_approved_auto_mech_vendors"
        ON auto_mech_vendors FOR SELECT
        USING (status = 'approved')
    $policy$;
  END IF;
END;
$$;

-- Anyone can read active services of approved vendors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'auto_mech_services'
      AND policyname = 'public_read_active_auto_mech_services'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "public_read_active_auto_mech_services"
        ON auto_mech_services FOR SELECT
        USING (
          is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM auto_mech_vendors v
            WHERE v.id = vendor_id AND v.status = 'approved'
          )
        )
    $policy$;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- SEED: Default operating hours helper comment
-- ─────────────────────────────────────────────────────────────

-- Example operating_hours JSON stored in auto_mech_vendors:
-- {
--   "monday":    { "open": "08:00", "close": "19:00", "closed": false },
--   "tuesday":   { "open": "08:00", "close": "19:00", "closed": false },
--   "wednesday": { "open": "08:00", "close": "19:00", "closed": false },
--   "thursday":  { "open": "08:00", "close": "19:00", "closed": false },
--   "friday":    { "open": "08:00", "close": "19:00", "closed": false },
--   "saturday":  { "open": "08:00", "close": "19:00", "closed": false },
--   "sunday":    { "open": "10:00", "close": "17:00", "closed": false }
-- }
