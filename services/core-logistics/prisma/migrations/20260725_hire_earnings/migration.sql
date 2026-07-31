-- Add total_hire_earnings column to drivers table
-- Tracks cumulative earnings from completed transport hire bookings,
-- consistent with total_earnings (rides) and total_delivery_earnings (deliveries).

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS total_hire_earnings DECIMAL(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN drivers.total_hire_earnings IS
  'Cumulative earnings from completed transport hire bookings (wallet payment credited at completion, cash payment credited after confirmCashPayment).';

CREATE INDEX IF NOT EXISTS idx_drivers_total_hire_earnings ON drivers(total_hire_earnings);
