-- Phase 2: Rider Matching, Delivery & Real-time Tracking

CREATE TABLE IF NOT EXISTS marketplace_rider_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'assigned',
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_rider_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL,
  latitude decimal(10,8) NOT NULL,
  longitude decimal(11,8) NOT NULL,
  heading decimal(5,2),
  speed decimal(6,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_rider_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  delivery_fee decimal(10,2) NOT NULL,
  total_earned decimal(10,2) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_rider_assignments_order ON marketplace_rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_rider_assignments_rider ON marketplace_rider_assignments(rider_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_rider_locations_order ON marketplace_rider_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_rider_earnings_rider ON marketplace_rider_earnings(rider_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_searching ON marketplace_orders(status) WHERE status = 'searching_rider';
