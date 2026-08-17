-- ============================================================
-- Car Wash Service — Initial Schema Migration
-- Run this in your Supabase SQL editor or via psql
-- ============================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- CAR_WASH_VENDORS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS car_wash_vendors (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE,          -- references auth users table
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
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | suspended | inactive
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

CREATE INDEX IF NOT EXISTS idx_car_wash_vendors_user_id  ON car_wash_vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_car_wash_vendors_status   ON car_wash_vendors(status);
CREATE INDEX IF NOT EXISTS idx_car_wash_vendors_city     ON car_wash_vendors(city);
CREATE INDEX IF NOT EXISTS idx_car_wash_vendors_state    ON car_wash_vendors(state);
CREATE INDEX IF NOT EXISTS idx_car_wash_vendors_rating   ON car_wash_vendors(rating DESC);

-- ─────────────────────────────────────────────────────────────
-- CAR_WASH_SERVICES (packages)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS car_wash_services (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID        NOT NULL REFERENCES car_wash_vendors(id) ON DELETE CASCADE,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  category         VARCHAR(50)  NOT NULL,   -- exterior_wash | interior_wash | engine_wash | full_car_wash | car_vacuuming | wax_and_polish
  duration_minutes INTEGER      NOT NULL,
  price            NUMERIC(10, 2) NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_car_wash_services_vendor_id        ON car_wash_services(vendor_id);
CREATE INDEX IF NOT EXISTS idx_car_wash_services_category         ON car_wash_services(category);
CREATE INDEX IF NOT EXISTS idx_car_wash_services_is_active        ON car_wash_services(is_active);
CREATE INDEX IF NOT EXISTS idx_car_wash_services_vendor_active    ON car_wash_services(vendor_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- CAR_WASH_BOOKINGS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS car_wash_bookings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID        NOT NULL,
  vendor_id            UUID        NOT NULL REFERENCES car_wash_vendors(id),
  service_id           UUID        NOT NULL REFERENCES car_wash_services(id),

  booking_type         VARCHAR(20)  NOT NULL DEFAULT 'book_now',  -- book_now | scheduled
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending',   -- pending | confirmed | in_progress | completed | cancelled | no_show

  scheduled_at         TIMESTAMPTZ,

  service_address      TEXT         NOT NULL,
  service_latitude     NUMERIC(10, 8) NOT NULL,
  service_longitude    NUMERIC(11, 8) NOT NULL,

  vehicle_description  TEXT,
  vehicle_photo_urls   TEXT[]       NOT NULL DEFAULT '{}',

  notes                TEXT,

  total_amount         NUMERIC(10, 2) NOT NULL,
  payment_method       VARCHAR(20)  NOT NULL DEFAULT 'wallet',  -- wallet | card | cash
  payment_status       VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded

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

CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_customer_id      ON car_wash_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_vendor_id        ON car_wash_bookings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_service_id       ON car_wash_bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_status           ON car_wash_bookings(status);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_booking_type     ON car_wash_bookings(booking_type);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_scheduled_at     ON car_wash_bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_created_at       ON car_wash_bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_vendor_status    ON car_wash_bookings(vendor_id, status);
CREATE INDEX IF NOT EXISTS idx_car_wash_bookings_customer_status  ON car_wash_bookings(customer_id, status);

-- ─────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at TRIGGER
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_car_wash_updated_at_column()
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
  FOREACH t IN ARRAY ARRAY['car_wash_vendors', 'car_wash_services', 'car_wash_bookings']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'set_car_wash_updated_at_' || t
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER set_car_wash_updated_at_%I
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_car_wash_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (Supabase)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE car_wash_vendors  ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_wash_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_wash_bookings ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved vendors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'car_wash_vendors'
      AND policyname = 'public_read_approved_car_wash_vendors'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "public_read_approved_car_wash_vendors"
        ON car_wash_vendors FOR SELECT
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
      AND tablename  = 'car_wash_services'
      AND policyname = 'public_read_active_car_wash_services'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "public_read_active_car_wash_services"
        ON car_wash_services FOR SELECT
        USING (
          is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM car_wash_vendors v
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

-- Example operating_hours JSON stored in car_wash_vendors:
-- {
--   "monday":    { "open": "08:00", "close": "19:00", "closed": false },
--   "tuesday":   { "open": "08:00", "close": "19:00", "closed": false },
--   "wednesday": { "open": "08:00", "close": "19:00", "closed": false },
--   "thursday":  { "open": "08:00", "close": "19:00", "closed": false },
--   "friday":    { "open": "08:00", "close": "19:00", "closed": false },
--   "saturday":  { "open": "08:00", "close": "19:00", "closed": false },
--   "sunday":    { "open": "10:00", "close": "17:00", "closed": false }
-- }
