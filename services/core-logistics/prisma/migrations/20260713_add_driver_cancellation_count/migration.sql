-- Migration: Add driver_cancellation_count tracking
-- Adds a counter column to the drivers table and a helper RPC to increment it safely.
-- No blocking logic — purely for tracking and future analytics.

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS driver_cancellation_count INTEGER NOT NULL DEFAULT 0;

-- RPC called by DriverRideService.cancelRide to track driver-side cancellations
CREATE OR REPLACE FUNCTION increment_driver_cancellation_count(p_driver_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE drivers
  SET driver_cancellation_count = COALESCE(driver_cancellation_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_driver_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN drivers.driver_cancellation_count IS
  'Number of times this driver cancelled an accepted ride before the trip started. Used for analytics and future policy enforcement.';
