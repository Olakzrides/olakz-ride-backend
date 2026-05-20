-- Migration: Cash Payment Confirmation
-- Adds cash payment tracking fields to the rides table.
-- For cash rides, remittance is only processed after the driver
-- explicitly confirms they received the cash from the customer.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS cash_payment_confirmed     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_payment_confirmed_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rides_cash_payment_confirmed
  ON rides (cash_payment_confirmed)
  WHERE payment_method = 'cash' AND cash_payment_confirmed = false;
