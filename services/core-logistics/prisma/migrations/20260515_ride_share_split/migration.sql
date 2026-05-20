-- Migration: Ride Share Split
-- Adds share_discount_applied flag to rides table.
-- When a customer shares a ride, this flag is set to true so the
-- fare split is only calculated once per ride.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS share_discount_applied BOOLEAN NOT NULL DEFAULT false;

-- Also add metadata column to driver_remittance_log if missing
-- (needed for cash_at_office payment recording)
ALTER TABLE driver_remittance_log
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_rides_share_discount_applied
  ON rides (share_discount_applied)
  WHERE share_discount_applied = true;
