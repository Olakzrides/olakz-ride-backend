-- ============================================================
-- Migration: Add promo display fields to delivery_fare_config
-- Run this in your Supabase SQL editor
-- ============================================================

ALTER TABLE delivery_fare_config
  ADD COLUMN IF NOT EXISTS promo_display_enabled    BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_display_multiplier NUMERIC(5, 2)  NOT NULL DEFAULT 0;

COMMENT ON COLUMN delivery_fare_config.promo_display_enabled IS
  'When true, the delivery fare estimate response includes a fake "original price" crossed out to create a promo illusion. Customer still pays the real calculated fare.';

COMMENT ON COLUMN delivery_fare_config.promo_display_multiplier IS
  'Multiply the real delivery fee by this value to produce the crossed-out "original" price shown to the customer. E.g. 1.75 means the crossed-out price is 75% higher than what they actually pay. Only used when promo_display_enabled = true. Must be 0 (disabled) or > 1.';
