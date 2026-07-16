-- Migration: Fix wallet balance check in create_ride_with_payment_hold
-- Problem: The RPC only counted 'credit','refund','debit','hold' transaction types.
--          This missed 'earning','tip_received','tip_payment','promo_credit' which are
--          all counted by getWalletBalances() in wallet.service.ts.
--          Result: users with earnings couldn't book rides — the RPC saw a lower
--          balance than the app displayed, causing false "Insufficient wallet balance" errors.
-- Fix: Align the RPC balance calculation to match getWalletBalances() exactly.

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
  v_cash_balance DECIMAL;
  v_promo_balance DECIMAL;
  v_total_balance DECIMAL;
  v_active_ride_count INTEGER;
BEGIN
  -- Check for concurrent active rides
  SELECT COUNT(*) INTO v_active_ride_count
  FROM rides
  WHERE user_id = p_user_id
    AND status IN ('searching', 'driver_assigned', 'driver_arrived', 'in_progress');

  IF v_active_ride_count > 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 'User already has an active ride'::TEXT;
    RETURN;
  END IF;

  -- ── Compute wallet balance using the same logic as getWalletBalances() ────────────
  -- Cash credit types: credit, refund, tip_received, earning, tip_payment
  -- Promo credit types: promo_credit
  -- Debit types:        debit, hold, withdrawal
  --
  -- Debits are consumed from cash first, then promo (matching the TypeScript service).
  -- We compute both buckets in a single pass.

  WITH tx AS (
    SELECT transaction_type, amount
    FROM wallet_transactions
    WHERE user_id = p_user_id
      AND status = 'completed'
  ),
  buckets AS (
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type IN ('credit','refund','tip_received','earning','tip_payment') THEN amount ELSE 0 END), 0) AS cash_credits,
      COALESCE(SUM(CASE WHEN transaction_type = 'promo_credit' THEN amount ELSE 0 END), 0)                                            AS promo_credits,
      COALESCE(SUM(CASE WHEN transaction_type IN ('debit','hold','withdrawal') THEN amount ELSE 0 END), 0)                           AS total_debits
    FROM tx
  )
  SELECT
    GREATEST(0,
      CASE
        WHEN cash_credits >= total_debits THEN cash_credits - total_debits
        ELSE 0
      END
    ),
    GREATEST(0,
      CASE
        WHEN cash_credits >= total_debits THEN promo_credits
        ELSE GREATEST(0, promo_credits - (total_debits - cash_credits))
      END
    )
  INTO v_cash_balance, v_promo_balance
  FROM buckets;

  v_total_balance := v_cash_balance + v_promo_balance;

  IF v_total_balance < p_estimated_fare THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID,
      format('Insufficient wallet balance. Available: %s, Required: %s',
             ROUND(v_total_balance, 2), p_estimated_fare)::TEXT;
    RETURN;
  END IF;

  -- Create ride
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

  -- Create payment hold
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

COMMENT ON FUNCTION create_ride_with_payment_hold IS
  'Atomically creates a ride and payment hold. Balance check now matches getWalletBalances() '
  'in wallet.service.ts — counts earning, tip_received, tip_payment, promo_credit correctly.';
