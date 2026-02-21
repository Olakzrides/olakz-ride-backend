-- Phase 3: Delivery Matching Infrastructure
-- Add service_types to drivers table and create delivery_requests table

-- =====================================================
-- 1. Add service_types column to drivers table
-- =====================================================
ALTER TABLE drivers
ADD COLUMN service_types TEXT[] DEFAULT ARRAY['ride']::TEXT[];

COMMENT ON COLUMN drivers.service_types IS 'Array of service types: ride, delivery. Determines which requests driver receives.';

-- Update existing drivers to have 'ride' service type by default
UPDATE drivers
SET service_types = ARRAY['ride']::TEXT[]
WHERE service_types IS NULL;

-- =====================================================
-- 2. Create delivery_requests table (similar to ride_requests)
-- =====================================================
CREATE TABLE delivery_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  batch_number INTEGER NOT NULL,
  distance_from_pickup DECIMAL(10, 2),
  estimated_arrival INTEGER,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  responded_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT delivery_requests_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

-- Indexes for performance
CREATE INDEX idx_delivery_requests_delivery_id ON delivery_requests(delivery_id);
CREATE INDEX idx_delivery_requests_courier_id ON delivery_requests(courier_id);
CREATE INDEX idx_delivery_requests_status ON delivery_requests(status);
CREATE INDEX idx_delivery_requests_batch_number ON delivery_requests(batch_number);
CREATE INDEX idx_delivery_requests_expires_at ON delivery_requests(expires_at);

-- Composite index for finding pending requests
CREATE INDEX idx_delivery_requests_pending ON delivery_requests(delivery_id, status, expires_at)
WHERE status = 'pending';

COMMENT ON TABLE delivery_requests IS 'Tracks delivery requests sent to couriers for matching';
COMMENT ON COLUMN delivery_requests.batch_number IS 'Batch number for grouping requests sent together';
COMMENT ON COLUMN delivery_requests.distance_from_pickup IS 'Distance in km from courier to pickup location';
COMMENT ON COLUMN delivery_requests.estimated_arrival IS 'Estimated arrival time in minutes';

-- =====================================================
-- 3. Add courier earnings tracking columns to drivers
-- =====================================================
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_rating DECIMAL(3, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_delivery_earnings DECIMAL(12, 2) DEFAULT 0.00;

COMMENT ON COLUMN drivers.total_deliveries IS 'Total number of completed deliveries';
COMMENT ON COLUMN drivers.delivery_rating IS 'Average rating for delivery service';
COMMENT ON COLUMN drivers.total_delivery_earnings IS 'Total earnings from deliveries';

-- =====================================================
-- 4. Update deliveries table for matching
-- =====================================================
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS searching_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS courier_arrived_pickup_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS courier_arrived_delivery_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN deliveries.searching_at IS 'Timestamp when courier matching started';
COMMENT ON COLUMN deliveries.courier_arrived_pickup_at IS 'Timestamp when courier arrived at pickup location';
COMMENT ON COLUMN deliveries.courier_arrived_delivery_at IS 'Timestamp when courier arrived at delivery location';

-- =====================================================
-- 5. Create function to update delivery request timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION update_delivery_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_request_timestamp
BEFORE UPDATE ON delivery_requests
FOR EACH ROW
EXECUTE FUNCTION update_delivery_request_timestamp();

-- =====================================================
-- 6. Create function to update courier delivery stats
-- =====================================================
CREATE OR REPLACE FUNCTION update_courier_delivery_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update when delivery is completed
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    UPDATE drivers
    SET 
      total_deliveries = total_deliveries + 1,
      updated_at = NOW()
    WHERE id = NEW.courier_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_courier_delivery_stats
AFTER UPDATE ON deliveries
FOR EACH ROW
WHEN (NEW.courier_id IS NOT NULL)
EXECUTE FUNCTION update_courier_delivery_stats();
