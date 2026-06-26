-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor Promo — Fix status column to include 'active'
-- Run in Supabase SQL Editor AFTER vendor-promo-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the existing CHECK constraint (Supabase uses generated constraint names)
--    Find and drop it first
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'vendor_promos'
    AND tc.constraint_type = 'CHECK'
    AND tc.constraint_name LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE vendor_promos DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- 2. Add the correct CHECK constraint with 'active' included
ALTER TABLE vendor_promos
  ADD CONSTRAINT vendor_promos_status_check
    CHECK (status IN ('scheduled', 'active', 'paused', 'ended'));

-- 3. Fix any existing rows that are past their starts_at but still 'scheduled'
UPDATE vendor_promos
SET status = 'active', updated_at = now()
WHERE status = 'scheduled'
  AND starts_at <= now()
  AND ends_at > now();

-- 4. Fix any rows that are past their ends_at but not yet 'ended'
UPDATE vendor_promos
SET status = 'ended', updated_at = now()
WHERE status IN ('scheduled', 'active')
  AND ends_at <= now();

-- Verify
SELECT id, code, status, starts_at, ends_at FROM vendor_promos ORDER BY created_at DESC;
