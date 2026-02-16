-- Migration: Add tip functionality to rides
-- Created: 2026-02-16
-- Description: Add tip_amount and tip_payment_status columns to rides table

-- Add tip columns to rides table
ALTER TABLE rides 
ADD COLUMN tip_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN tip_payment_status VARCHAR(20) DEFAULT NULL,
ADD COLUMN tip_paid_at TIMESTAMPTZ(6) DEFAULT NULL;

-- Add index for tip queries
CREATE INDEX idx_rides_tip_status ON rides(tip_payment_status) WHERE tip_payment_status IS NOT NULL;

-- Add comment
COMMENT ON COLUMN rides.tip_amount IS 'Tip amount given to driver by passenger';
COMMENT ON COLUMN rides.tip_payment_status IS 'Status of tip payment: pending, completed, failed';
COMMENT ON COLUMN rides.tip_paid_at IS 'Timestamp when tip was successfully paid';
