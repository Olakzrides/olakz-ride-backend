-- Migration: Add function to increment driver earnings
-- Created: 2026-02-16
-- Description: Create function to safely increment driver total_earnings

-- Create function to increment driver earnings
CREATE OR REPLACE FUNCTION increment_driver_earnings(
  p_driver_id UUID,
  p_amount DECIMAL(10,2)
)
RETURNS VOID AS $$
BEGIN
  UPDATE drivers
  SET 
    total_earnings = total_earnings + p_amount,
    updated_at = NOW()
  WHERE id = p_driver_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION increment_driver_earnings IS 'Increment driver total earnings by specified amount';
