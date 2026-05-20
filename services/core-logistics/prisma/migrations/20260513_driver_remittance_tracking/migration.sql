-- Migration: Driver Remittance Tracking
-- Adds remittance tracking fields to drivers table and creates driver_remittance_log table

-- ─── 1. Add remittance tracking fields to drivers table ──────────────────────

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS pending_remittance_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_remittance_count   INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remittance_blocked         BOOLEAN       NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_drivers_remittance_blocked ON drivers (remittance_blocked);

-- ─── 2. Create driver_remittance_log table ────────────────────────────────────
-- Tracks every platform remittance attempt for cash rides.
-- status values:
--   auto_deducted  — deducted from wallet automatically at trip completion
--   pending        — wallet had insufficient balance, awaiting payment
--   settled        — driver topped up wallet and pending amount was cleared

CREATE TABLE IF NOT EXISTS driver_remittance_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   UUID        NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  ride_id     UUID        NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  settled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_remittance_log_driver_id     ON driver_remittance_log (driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_remittance_log_ride_id       ON driver_remittance_log (ride_id);
CREATE INDEX IF NOT EXISTS idx_driver_remittance_log_status        ON driver_remittance_log (status);
CREATE INDEX IF NOT EXISTS idx_driver_remittance_log_driver_status ON driver_remittance_log (driver_id, status);
