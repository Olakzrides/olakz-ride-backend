-- ============================================================
-- Phase 3: Delivery Execution, Ratings & History
-- ============================================================

-- Add delivery_code to food_orders (generated at order creation)
ALTER TABLE food_orders
  ADD COLUMN IF NOT EXISTS delivery_code VARCHAR(4),
  ADD COLUMN IF NOT EXISTS pickup_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS arrived_vendor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Ratings table
CREATE TABLE IF NOT EXISTS food_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id),
  courier_id UUID,
  restaurant_rating SMALLINT NOT NULL CHECK (restaurant_rating BETWEEN 1 AND 5),
  delivery_rating SMALLINT CHECK (delivery_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)  -- one rating per order
);

-- Courier earnings table
CREATE TABLE IF NOT EXISTS food_courier_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id UUID NOT NULL,           -- references drivers.id
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  delivery_fee DECIMAL(10, 2) NOT NULL,
  tip_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_earned DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_food_ratings_order ON food_ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_food_ratings_restaurant ON food_ratings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_ratings_courier ON food_ratings(courier_id);
CREATE INDEX IF NOT EXISTS idx_food_courier_earnings_courier ON food_courier_earnings(courier_id);
CREATE INDEX IF NOT EXISTS idx_food_courier_earnings_status ON food_courier_earnings(status);
CREATE INDEX IF NOT EXISTS idx_food_orders_delivery_code ON food_orders(delivery_code);
