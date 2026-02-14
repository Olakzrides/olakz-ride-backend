-- Migration: Create ride_stops table for multiple waypoints feature
-- Date: February 13, 2026

CREATE TABLE ride_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  cart_id UUID REFERENCES ride_carts(id) ON DELETE CASCADE,
  stop_order INT NOT NULL,
  stop_type VARCHAR(20) NOT NULL CHECK (stop_type IN ('pickup', 'waypoint', 'dropoff')),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address TEXT NOT NULL,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  wait_time_minutes INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_ride_stops_ride_id ON ride_stops(ride_id);
CREATE INDEX idx_ride_stops_cart_id ON ride_stops(cart_id);
CREATE INDEX idx_ride_stops_order ON ride_stops(ride_id, stop_order);
CREATE INDEX idx_ride_stops_type ON ride_stops(stop_type);

-- Comments
COMMENT ON TABLE ride_stops IS 'Stores multiple stops/waypoints for rides';
COMMENT ON COLUMN ride_stops.stop_type IS 'Type of stop: pickup (origin), waypoint (intermediate), dropoff (destination)';
COMMENT ON COLUMN ride_stops.stop_order IS 'Order of the stop in the route (1, 2, 3, ...)';
COMMENT ON COLUMN ride_stops.wait_time_minutes IS 'Actual wait time at this stop in minutes';
