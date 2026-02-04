-- Migration: Atomic Ride Creation with Payment Hold
-- This ensures ride creation and payment hold happen in a single transaction

-- Create function for atomic ride creation with payment hold
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
  p_currency_code VARCHAR(3),
  p_payment_method VARCHAR(50),
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  ride_id UUID,
  payment_hold_id UUID,
  success BOOLEAN,
  error_message TEXT
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_ride_id UUID;
  v_payment_hold_id UUID;
  v_current_balance DECIMAL;
  v_hold_reference TEXT;
BEGIN
  -- Start transaction (implicit in function)
  
  -- Check if user has sufficient balance
  SELECT COALESCE(
    SUM(CASE 
      WHEN transaction_type IN ('credit', 'refund') THEN amount
      WHEN transaction_type IN ('debit', 'hold') THEN -amount
      ELSE 0
    END), 0
  ) INTO v_current_balance
  FROM wallet_transactions
  WHERE user_id = p_user_id 
    AND currency_code = p_currency_code 
    AND status = 'completed';
  
  -- Check sufficient balance
  IF v_current_balance < p_estimated_fare THEN
    RETURN QUERY SELECT 
      NULL::UUID as ride_id,
      NULL::UUID as payment_hold_id,
      FALSE as success,
      'Insufficient wallet balance' as error_message;
    RETURN;
  END IF;
  
  -- Check for existing active rides
  IF EXISTS (
    SELECT 1 FROM rides 
    WHERE user_id = p_user_id 
      AND status IN ('searching', 'driver_assigned', 'driver_arrived', 'in_progress')
  ) THEN
    RETURN QUERY SELECT 
      NULL::UUID as ride_id,
      NULL::UUID as payment_hold_id,
      FALSE as success,
      'User already has an active ride' as error_message;
    RETURN;
  END IF;
  
  -- Generate IDs
  v_ride_id := gen_random_uuid();
  v_payment_hold_id := gen_random_uuid();
  v_hold_reference := 'hold_' || extract(epoch from now()) || '_' || p_user_id;
  
  -- Create payment hold first
  INSERT INTO wallet_transactions (
    id,
    user_id,
    transaction_type,
    amount,
    currency_code,
    status,
    description,
    reference,
    metadata,
    created_at
  ) VALUES (
    v_payment_hold_id,
    p_user_id,
    'hold',
    p_estimated_fare,
    p_currency_code,
    'completed',
    'Ride booking payment hold',
    v_hold_reference,
    jsonb_build_object(
      'hold_type', 'ride_payment',
      'ride_id', v_ride_id,
      'balance_before', v_current_balance
    ),
    now()
  );
  
  -- Create ride record
  INSERT INTO rides (
    id,
    cart_id,
    user_id,
    variant_id,
    pickup_latitude,
    pickup_longitude,
    pickup_address,
    dropoff_latitude,
    dropoff_longitude,
    dropoff_address,
    estimated_distance,
    estimated_duration,
    estimated_fare,
    currency_code,
    payment_method,
    payment_status,
    payment_hold_id,
    status,
    scheduled_at,
    metadata,
    created_at
  ) VALUES (
    v_ride_id,
    p_cart_id,
    p_user_id,
    p_variant_id,
    p_pickup_latitude,
    p_pickup_longitude,
    p_pickup_address,
    p_dropoff_latitude,
    p_dropoff_longitude,
    p_dropoff_address,
    p_estimated_distance,
    p_estimated_duration,
    p_estimated_fare,
    p_currency_code,
    p_payment_method,
    'pending',
    v_payment_hold_id,
    'searching',
    p_scheduled_at,
    p_metadata,
    now()
  );
  
  -- Return success
  RETURN QUERY SELECT 
    v_ride_id as ride_id,
    v_payment_hold_id as payment_hold_id,
    TRUE as success,
    NULL::TEXT as error_message;
    
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically
    RETURN QUERY SELECT 
      NULL::UUID as ride_id,
      NULL::UUID as payment_hold_id,
      FALSE as success,
      SQLERRM as error_message;
END;
$$;

-- Add payment_hold_id column to rides table if not exists
ALTER TABLE rides ADD COLUMN IF NOT EXISTS payment_hold_id UUID;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'NGN';

-- Add foreign key constraint
ALTER TABLE rides ADD CONSTRAINT fk_rides_payment_hold 
  FOREIGN KEY (payment_hold_id) REFERENCES wallet_transactions(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_rides_user_status ON rides(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rides_payment_hold ON rides(payment_hold_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_currency ON wallet_transactions(user_id, currency_code, status);