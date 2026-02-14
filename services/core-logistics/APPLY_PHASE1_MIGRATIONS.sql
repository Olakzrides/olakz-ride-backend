-- ============================================
-- PHASE 1 MIGRATIONS - Apply Manually via Supabase Dashboard
-- Date: February 13, 2026
-- ============================================

-- Migration 1: Add recipient fields to rides
-- ============================================
ALTER TABLE rides
ADD COLUMN IF NOT EXISTS booking_type VARCHAR(20) DEFAULT 'for_me' CHECK (booking_type IN ('for_me', 'for_friend'));

ALTER TABLE rides
ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(20);

COMMENT ON COLUMN rides.booking_type IS 'Type of booking: for_me (default) or for_friend';
COMMENT ON COLUMN rides.recipient_name IS 'Name of the person receiving the ride (only for booking_type = for_friend)';
COMMENT ON COLUMN rides.recipient_phone IS 'Phone number of the person receiving the ride (only for booking_type = for_friend)';

CREATE INDEX IF NOT EXISTS idx_rides_booking_type ON rides(booking_type);

-- Migration 2: Update create_ride_with_payment_hold function
-- ============================================
DROP FUNCTION IF EXISTS create_ride_with_payment_hold(
  p_cart_id UUID,
  p_user_id UUID,
  p_variant_id UUID,
  p_pickup_latitude DECIMAL,
  p_pickup_longitude DECIMAL,
  p_pickup_address TEXT,
  p_dropoff_latitude DECIMAL,
  p_dropoff_longitude DECIMAL,
  p_dropoff_address TEXT,
  p_estimated_distance DECIMAL,
  p_estimated_duration INTEGER,
  p_estimated_fare DECIMAL,
  p_currency_code VARCHAR,
  p_payment_method VARCHAR,
  p_scheduled_at TIMESTAMPTZ,
  p_metadata JSONB
);

CREATE OR REPLACE FUNCTION create_ride_with_payment_hold(
  p_cart_id UUID,
  p_user_id UUID,
  p_variant_id UUID,
  p_pickup_latitude DECIMAL,
  p_pickup_longitude DECIMAL,
  p_pickup_address TEXT,
  p_dropoff_latitude DECIMAL,
  p_dropoff_longitude DECIMAL,
  p_dropoff_address TEXT,
  p_estimated_distance DECIMAL,
  p_estimated_duration INTEGER,
  p_estimated_fare DECIMAL,
  p_currency_code VARCHAR,
  p_payment_method VARCHAR,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_booking_type VARCHAR DEFAULT 'for_me',
  p_recipient_name VARCHAR DEFAULT NULL,
  p_recipient_phone VARCHAR DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  success BOOLEAN,
  ride_id UUID,
  payment_hold_id UUID,
  error_message TEXT
) AS $$
DECLARE
  v_ride_id UUID;
  v_payment_hold_id UUID;
  v_wallet_balance DECIMAL;
  v_active_ride_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_active_ride_count
  FROM rides
  WHERE user_id = p_user_id
    AND status IN ('searching', 'driver_assigned', 'driver_arrived', 'in_progress');

  IF v_active_ride_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'User already has an active ride'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(
    CASE 
      WHEN transaction_type IN ('credit', 'refund') THEN amount
      WHEN transaction_type IN ('debit', 'hold') THEN -amount
      ELSE 0
    END
  ), 0) INTO v_wallet_balance
  FROM wallet_transactions
  WHERE user_id = p_user_id
    AND status IN ('completed', 'hold');

  IF v_wallet_balance < p_estimated_fare THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 
      format('Insufficient wallet balance. Available: %s, Required: %s', v_wallet_balance, p_estimated_fare)::TEXT;
    RETURN;
  END IF;

  INSERT INTO rides (
    cart_id,
    user_id,
    variant_id,
    status,
    booking_type,
    recipient_name,
    recipient_phone,
    pickup_latitude,
    pickup_longitude,
    pickup_address,
    dropoff_latitude,
    dropoff_longitude,
    dropoff_address,
    estimated_distance,
    estimated_duration,
    estimated_fare,
    payment_method,
    payment_status,
    scheduled_at,
    metadata
  ) VALUES (
    p_cart_id,
    p_user_id,
    p_variant_id,
    CASE WHEN p_scheduled_at IS NOT NULL THEN 'scheduled' ELSE 'searching' END,
    p_booking_type,
    p_recipient_name,
    p_recipient_phone,
    p_pickup_latitude,
    p_pickup_longitude,
    p_pickup_address,
    p_dropoff_latitude,
    p_dropoff_longitude,
    p_dropoff_address,
    p_estimated_distance,
    p_estimated_duration,
    p_estimated_fare,
    p_payment_method,
    'pending',
    p_scheduled_at,
    p_metadata
  ) RETURNING id INTO v_ride_id;

  INSERT INTO wallet_transactions (
    user_id,
    ride_id,
    transaction_type,
    amount,
    currency_code,
    status,
    description,
    metadata
  ) VALUES (
    p_user_id,
    v_ride_id,
    'hold',
    p_estimated_fare,
    p_currency_code,
    'hold',
    format('Payment hold for ride %s', v_ride_id),
    jsonb_build_object(
      'ride_id', v_ride_id,
      'estimated_fare', p_estimated_fare,
      'booking_type', p_booking_type,
      'recipient_name', p_recipient_name
    )
  ) RETURNING id INTO v_payment_hold_id;

  RETURN QUERY SELECT TRUE, v_ride_id, v_payment_hold_id, NULL::TEXT;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Migration 3: Create ride_stops table
-- ============================================
CREATE TABLE IF NOT EXISTS ride_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  cart_id UUID REFERENCES ride_carts(id) ON DELETE CASCADE,
  stop_order INT NOT NULL,
  stop_type VARCHAR(20) NOT NULL CHECK (stop_type IN ('pickup', 'waypoint', 'dropoff')),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address TEXT NOT NULL,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  wait_time_minutes INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_stops_ride_id ON ride_stops(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_stops_cart_id ON ride_stops(cart_id);
CREATE INDEX IF NOT EXISTS idx_ride_stops_order ON ride_stops(ride_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_ride_stops_type ON ride_stops(stop_type);

COMMENT ON TABLE ride_stops IS 'Stores multiple stops/waypoints for rides';
COMMENT ON COLUMN ride_stops.stop_type IS 'Type of stop: pickup (origin), waypoint (intermediate), dropoff (destination)';
COMMENT ON COLUMN ride_stops.stop_order IS 'Order of the stop in the route (1, 2, 3, ...)';
COMMENT ON COLUMN ride_stops.wait_time_minutes IS 'Actual wait time at this stop in minutes';

-- Migration 4: Create saved_places table
-- ============================================
CREATE TABLE IF NOT EXISTS saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  place_type VARCHAR(20) NOT NULL CHECK (place_type IN ('home', 'work', 'favorite')),
  label VARCHAR(100),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_places_user_id ON saved_places(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_places_type ON saved_places(user_id, place_type);
CREATE INDEX IF NOT EXISTS idx_saved_places_default ON saved_places(user_id, is_default);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_places_unique_default 
ON saved_places(user_id, place_type, is_default) 
WHERE is_default = true;

COMMENT ON TABLE saved_places IS 'Stores user favorite locations (home, work, custom)';
COMMENT ON COLUMN saved_places.place_type IS 'Type of place: home, work, or favorite';
COMMENT ON COLUMN saved_places.is_default IS 'Whether this is the default place for this type';

-- ============================================
-- DONE! All Phase 1 migrations applied
-- ============================================


-- ============================================
-- PHASE 2 MIGRATION - Payment Cards (Flutterwave)
-- Date: February 14, 2026
-- ============================================

-- Create payment_cards table for storing tokenized card information
CREATE TABLE IF NOT EXISTS payment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  card_token VARCHAR(255) NOT NULL UNIQUE,
  authorization_code VARCHAR(255),
  card_last4 VARCHAR(4) NOT NULL,
  card_brand VARCHAR(20) NOT NULL,
  card_type VARCHAR(20),
  card_exp_month VARCHAR(2) NOT NULL,
  card_exp_year VARCHAR(4) NOT NULL,
  cardholder_name VARCHAR(100),
  bank_name VARCHAR(100),
  country_code VARCHAR(2),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  provider VARCHAR(20) DEFAULT 'flutterwave',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_cards_user_id ON payment_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_cards_default ON payment_cards(user_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_payment_cards_active ON payment_cards(user_id, is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE payment_cards IS 'Stores tokenized payment card information from Flutterwave';
COMMENT ON COLUMN payment_cards.card_token IS 'Flutterwave card token for charging';
COMMENT ON COLUMN payment_cards.authorization_code IS 'Flutterwave authorization code for recurring charges';
COMMENT ON COLUMN payment_cards.is_default IS 'Whether this is the users default payment card';
COMMENT ON COLUMN payment_cards.provider IS 'Payment provider: flutterwave, paystack, stripe';

-- ============================================
-- DONE! Phase 2.1 migration applied
-- ============================================
