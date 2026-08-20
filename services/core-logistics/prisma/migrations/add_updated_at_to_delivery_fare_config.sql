-- Add updated_at column to delivery_fare_config if it doesn't exist
-- This prevents silent UPDATE failures when code writes updated_at to the table

ALTER TABLE delivery_fare_config
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill existing rows
UPDATE delivery_fare_config SET updated_at = now() WHERE updated_at IS NULL;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_delivery_fare_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_delivery_fare_config_updated_at'
  ) THEN
    CREATE TRIGGER set_delivery_fare_config_updated_at
      BEFORE UPDATE ON delivery_fare_config
      FOR EACH ROW EXECUTE FUNCTION update_delivery_fare_config_updated_at();
  END IF;
END;
$$;
