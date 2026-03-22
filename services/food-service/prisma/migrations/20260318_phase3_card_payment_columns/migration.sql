-- ============================================================
-- Phase 3: Card Payment Columns on food_orders
-- Adds Flutterwave reference fields needed for card payment flow
-- ============================================================

ALTER TABLE food_orders
  ADD COLUMN IF NOT EXISTS flw_ref VARCHAR(255),
  ADD COLUMN IF NOT EXISTS flw_tx_ref VARCHAR(255),
  ADD COLUMN IF NOT EXISTS flw_transaction_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_food_orders_flw_ref ON food_orders(flw_ref);
CREATE INDEX IF NOT EXISTS idx_food_orders_flw_tx_ref ON food_orders(flw_tx_ref);
