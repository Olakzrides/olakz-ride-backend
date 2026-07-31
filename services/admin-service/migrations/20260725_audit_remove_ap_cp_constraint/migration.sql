-- Remove the AP ≤ CP constraint from audit_transactions.
-- AP (Actual Payout) represents the amount the company pays the rider/vendor.
-- This CAN legally exceed CP (Charge Price) when operational factors
-- such as traffic, weather, or waiting time increase the payout — resulting in a loss.

ALTER TABLE audit_transactions
  DROP CONSTRAINT IF EXISTS audit_transactions_ap_lte_cp;

-- Also update the AP column comment to reflect the correct meaning
COMMENT ON COLUMN audit_transactions.amount_paid IS
  'AP — Actual Payout: the amount the company pays to the rider/vendor after service completion. May exceed charge_price (CP), in which case the company records a loss.';
