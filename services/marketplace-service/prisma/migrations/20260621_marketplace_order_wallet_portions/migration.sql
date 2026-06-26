-- Add wallet_cash_portion and wallet_promo_portion to marketplace_orders.
-- These columns record how much of each order payment came from cash vs promo balance,
-- enabling correct bucket routing when a refund is issued (cancellation, rejection, etc).
-- Promo refunds go back as promo_credit; cash refunds go back as refund.

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS wallet_cash_portion  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS wallet_promo_portion NUMERIC(10,2);
