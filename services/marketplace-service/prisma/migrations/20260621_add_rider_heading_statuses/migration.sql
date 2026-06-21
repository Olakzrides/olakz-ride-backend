-- Add heading_to_store_at and heading_to_customer_at timestamp columns
-- to support the new "Rider on the way to vendor" and "Rider on the way to customer" statuses

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS heading_to_store_at timestamptz,
  ADD COLUMN IF NOT EXISTS heading_to_customer_at timestamptz;
