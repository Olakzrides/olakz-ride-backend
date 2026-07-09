-- Migration: Transport Hire — Cash Confirmation & Cancellation Columns
-- Date: 2026-07-04

-- ── 1. Cash payment confirmation (driver confirms cash received after completion) ──
ALTER TABLE transport_hires
  ADD COLUMN IF NOT EXISTS cash_payment_confirmed     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_payment_confirmed_at  TIMESTAMPTZ;

-- ── 2. Partial charge record for mid-trip cancellations ──────────────────────
ALTER TABLE transport_hires
  ADD COLUMN IF NOT EXISTS distance_covered_km  DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS charged_amount       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS refund_amount        DECIMAL(12,2);

-- ── 3. Extend payment_status CHECK to include 'completed' ────────────────────
-- Drop ALL possible names the constraint could have been created under,
-- then recreate with the full set of valid values.
ALTER TABLE transport_hires
  DROP CONSTRAINT IF EXISTS transport_hires_payment_status_check;

ALTER TABLE transport_hires
  DROP CONSTRAINT IF EXISTS transport_hires_payment_status_fkey;

-- Supabase may also auto-name it after the column — cover that case
DO $$
DECLARE
  con_name TEXT;
BEGIN
  FOR con_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'transport_hires'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE transport_hires DROP CONSTRAINT IF EXISTS %I', con_name);
  END LOOP;
END
$$;

ALTER TABLE transport_hires
  ADD CONSTRAINT transport_hires_payment_status_check
  CHECK (payment_status IN (
    'pending',    -- not yet paid / cash awaiting confirmation
    'paid',       -- wallet hold settled
    'refunded',   -- refund issued
    'completed'   -- cash confirmed by driver
  ));

-- ── 4. Index for unconfirmed cash hires ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transport_hires_cash_unconfirmed
  ON transport_hires (cash_payment_confirmed)
  WHERE payment_method = 'cash' AND cash_payment_confirmed = false;
