-- Migration: Add recipient fields for "Book for Someone Else" feature
-- Date: February 13, 2026

-- Add booking_type column to track if ride is for self or someone else
ALTER TABLE rides
ADD COLUMN booking_type VARCHAR(20) DEFAULT 'for_me' CHECK (booking_type IN ('for_me', 'for_friend'));

-- Add recipient details columns (nullable, only used when booking_type = 'for_friend')
ALTER TABLE rides
ADD COLUMN recipient_name VARCHAR(100),
ADD COLUMN recipient_phone VARCHAR(20);

-- Add comment for documentation
COMMENT ON COLUMN rides.booking_type IS 'Type of booking: for_me (default) or for_friend';
COMMENT ON COLUMN rides.recipient_name IS 'Name of the person receiving the ride (only for booking_type = for_friend)';
COMMENT ON COLUMN rides.recipient_phone IS 'Phone number of the person receiving the ride (only for booking_type = for_friend)';

-- Create index for querying rides by booking type
CREATE INDEX idx_rides_booking_type ON rides(booking_type);
