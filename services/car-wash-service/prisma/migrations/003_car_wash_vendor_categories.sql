-- ============================================================
-- Car Wash Service — Vendor Custom Categories
-- Run after 001 and 002 migrations
-- ============================================================

-- Per-vendor custom categories.
-- System categories (exterior_wash, interior_wash etc.) are hardcoded in the app.
-- Vendors can create their own categories in addition to or instead of system ones.
CREATE TABLE IF NOT EXISTS car_wash_vendor_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID         NOT NULL REFERENCES car_wash_vendors(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_car_wash_vendor_categories_vendor_id
  ON car_wash_vendor_categories(vendor_id);
CREATE INDEX IF NOT EXISTS idx_car_wash_vendor_categories_vendor_active
  ON car_wash_vendor_categories(vendor_id, is_active);

-- Add custom_category_id to car_wash_services so a service can link to
-- either a system category key (existing `category` column) or a vendor category.
-- When custom_category_id is set it takes priority on the vendor dashboard.
ALTER TABLE car_wash_services
  ADD COLUMN IF NOT EXISTS custom_category_id UUID
    REFERENCES car_wash_vendor_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_car_wash_services_custom_category
  ON car_wash_services(custom_category_id);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_car_wash_vendor_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_car_wash_vendor_categories_updated_at'
  ) THEN
    CREATE TRIGGER set_car_wash_vendor_categories_updated_at
      BEFORE UPDATE ON car_wash_vendor_categories
      FOR EACH ROW EXECUTE FUNCTION update_car_wash_vendor_categories_updated_at();
  END IF;
END;
$$;

-- RLS
ALTER TABLE car_wash_vendor_categories ENABLE ROW LEVEL SECURITY;

-- Approved vendor's categories are publicly readable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'car_wash_vendor_categories'
      AND policyname = 'public_read_active_vendor_categories'
  ) THEN
    CREATE POLICY "public_read_active_vendor_categories"
      ON car_wash_vendor_categories FOR SELECT
      USING (
        is_active = true AND EXISTS (
          SELECT 1 FROM car_wash_vendors v
          WHERE v.id = vendor_id AND v.status = 'approved'
        )
      );
  END IF;
END;
$$;
