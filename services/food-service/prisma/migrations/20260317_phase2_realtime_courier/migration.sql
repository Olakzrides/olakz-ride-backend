-- ============================================================
-- Phase 2: Real-time & Courier Assignment Tables
-- ============================================================

-- Food delivery assignments (audit trail of all courier assignment attempts per order)
CREATE TABLE IF NOT EXISTS food_delivery_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL,                        -- references drivers.id in core-logistics
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',  -- assigned | cancelled | completed
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Food courier location tracking (separate from core-logistics driver_location_tracking)
CREATE TABLE IF NOT EXISTS food_courier_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  heading DECIMAL(5, 2),
  speed DECIMAL(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vendor pickups (courier picks up from vendor to deliver to customer)
CREATE TABLE IF NOT EXISTS food_vendor_pickups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  courier_id UUID,                                 -- assigned courier
  vendor_id UUID NOT NULL,                         -- restaurant owner_id
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- pending | courier_assigned | courier_arrived | picked_up | cancelled
  pickup_code VARCHAR(6),                          -- vendor shows to courier
  special_instructions TEXT,
  courier_arrived_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by VARCHAR(20),                        -- vendor | courier | system
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_food_delivery_assignments_order ON food_delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_food_delivery_assignments_courier ON food_delivery_assignments(courier_id);
CREATE INDEX IF NOT EXISTS idx_food_delivery_assignments_status ON food_delivery_assignments(status);
CREATE INDEX IF NOT EXISTS idx_food_courier_locations_order ON food_courier_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_food_courier_locations_courier ON food_courier_locations(courier_id);
CREATE INDEX IF NOT EXISTS idx_food_vendor_pickups_order ON food_vendor_pickups(order_id);
CREATE INDEX IF NOT EXISTS idx_food_vendor_pickups_courier ON food_vendor_pickups(courier_id);
CREATE INDEX IF NOT EXISTS idx_food_vendor_pickups_restaurant ON food_vendor_pickups(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_vendor_pickups_status ON food_vendor_pickups(status);
