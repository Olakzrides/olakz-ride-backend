-- ============================================================
-- Auto Mech Service — Vendor Custom Categories
-- Run after 001 and 002 migrations
-- ============================================================

CREATE TABLE IF NOT EXISTS auto_mech_vendor_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID         NOT NULL REFERENCES auto_mech_vendors(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_mech_vendor_categories_vendor_id
  ON auto_mech_vendor_categories(vendor_id);
CREATE INDEX IF NOT EXISTS idx_auto_mech_vendor_categories_vendor_active
  ON auto_mech_vendor_categories(vendor_id, is_active);

ALTER TABLE auto_mech_services
  ADD COLUMN IF NOT EXISTS custom_category_id UUID
    REFERENCES auto_mech_vendor_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auto_mech_services_custom_category
  ON auto_mech_services(custom_category_id);

CREATE OR REPLACE FUNCTION update_auto_mech_vendor_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_auto_mech_vendor_categories_updated_at'
  ) THEN
    CREATE TRIGGER set_auto_mech_vendor_categories_updated_at
      BEFORE UPDATE ON auto_mech_vendor_categories
      FOR EACH ROW EXECUTE FUNCTION update_auto_mech_vendor_categories_updated_at();
  END IF;
END;
$$;

ALTER TABLE auto_mech_vendor_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'auto_mech_vendor_categories'
      AND policyname = 'public_read_active_auto_mech_vendor_categories'
  ) THEN
    CREATE POLICY "public_read_active_auto_mech_vendor_categories"
      ON auto_mech_vendor_categories FOR SELECT
      USING (
        is_active = true AND EXISTS (
          SELECT 1 FROM auto_mech_vendors v
          WHERE v.id = vendor_id AND v.status = 'approved'
        )
      );
  END IF;
END;
$$;
