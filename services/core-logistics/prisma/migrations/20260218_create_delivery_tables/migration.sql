-- CreateTable: deliveries
-- Main table for delivery orders
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(20) UNIQUE NOT NULL,
  
  -- Customer & Recipient
  customer_id UUID NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  recipient_phone VARCHAR(20) NOT NULL,
  
  -- Locations
  pickup_latitude DECIMAL(10, 8) NOT NULL,
  pickup_longitude DECIMAL(11, 8) NOT NULL,
  pickup_address TEXT NOT NULL,
  dropoff_latitude DECIMAL(10, 8) NOT NULL,
  dropoff_longitude DECIMAL(11, 8) NOT NULL,
  dropoff_address TEXT NOT NULL,
  
  -- Package Details
  package_description TEXT,
  package_photo_url TEXT,
  
  -- Delivery Details
  vehicle_type_id UUID NOT NULL,
  delivery_type VARCHAR(20) NOT NULL CHECK (delivery_type IN ('instant', 'scheduled')),
  scheduled_pickup_at TIMESTAMP,
  
  -- Courier Assignment
  courier_id UUID,
  assigned_at TIMESTAMP,
  
  -- Authentication Codes
  pickup_code VARCHAR(20) NOT NULL UNIQUE,
  delivery_code VARCHAR(20) NOT NULL UNIQUE,
  pickup_code_verified_at TIMESTAMP,
  delivery_code_verified_at TIMESTAMP,
  
  -- Status Tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  
  -- Timestamps for each status
  searching_at TIMESTAMP,
  courier_arrived_pickup_at TIMESTAMP,
  picked_up_at TIMESTAMP,
  courier_arrived_delivery_at TIMESTAMP,
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  
  -- Pricing
  estimated_fare DECIMAL(10, 2) NOT NULL,
  final_fare DECIMAL(10, 2),
  currency_code VARCHAR(3) DEFAULT 'NGN',
  distance_km DECIMAL(10, 2),
  
  -- Payment
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'wallet', 'card')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'hold', 'completed', 'refunded')),
  payment_id UUID,
  
  -- Proof of Delivery
  pickup_photo_url TEXT,
  delivery_photo_url TEXT,
  
  -- Metadata
  region_id UUID,
  service_channel_id UUID DEFAULT '91f84fab-1252-47e1-960a-e498daa91c35',
  metadata JSONB DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key constraints for deliveries table
ALTER TABLE deliveries 
ADD CONSTRAINT fk_deliveries_vehicle_type 
FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id);

ALTER TABLE deliveries 
ADD CONSTRAINT fk_deliveries_courier 
FOREIGN KEY (courier_id) REFERENCES drivers(id);

ALTER TABLE deliveries 
ADD CONSTRAINT fk_deliveries_region 
FOREIGN KEY (region_id) REFERENCES regions(id);

-- Create indexes for deliveries table
CREATE INDEX IF NOT EXISTS idx_deliveries_customer ON deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier ON deliveries(courier_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_number ON deliveries(order_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_pickup_code ON deliveries(pickup_code);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_code ON deliveries(delivery_code);
CREATE INDEX IF NOT EXISTS idx_deliveries_scheduled ON deliveries(scheduled_pickup_at) WHERE delivery_type = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_vehicle_type ON deliveries(vehicle_type_id);

-- CreateTable: delivery_status_history
-- Track all status changes for audit trail
CREATE TABLE IF NOT EXISTS delivery_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL,
  location_latitude DECIMAL(10, 8),
  location_longitude DECIMAL(11, 8),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key constraints for delivery_status_history table
ALTER TABLE delivery_status_history 
ADD CONSTRAINT fk_delivery_status_history_delivery 
FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;

-- Create indexes for delivery_status_history
CREATE INDEX IF NOT EXISTS idx_delivery_status_history_delivery ON delivery_status_history(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_status_history_created_at ON delivery_status_history(created_at);

-- CreateTable: delivery_fare_config
-- Fare configuration for different vehicle types and regions
CREATE TABLE IF NOT EXISTS delivery_fare_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_type_id UUID NOT NULL,
  region_id UUID NOT NULL,
  
  -- Pricing
  base_fare DECIMAL(10, 2) NOT NULL,
  price_per_km DECIMAL(10, 2) NOT NULL,
  minimum_fare DECIMAL(10, 2) NOT NULL,
  
  -- Scheduled delivery surcharge
  scheduled_delivery_surcharge DECIMAL(10, 2) DEFAULT 0,
  
  -- Time-based pricing (optional)
  peak_hour_multiplier DECIMAL(3, 2) DEFAULT 1.0,
  
  currency_code VARCHAR(3) DEFAULT 'NGN',
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(vehicle_type_id, region_id)
);

-- Add foreign key constraints for delivery_fare_config table
ALTER TABLE delivery_fare_config 
ADD CONSTRAINT fk_delivery_fare_config_vehicle_type 
FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id);

ALTER TABLE delivery_fare_config 
ADD CONSTRAINT fk_delivery_fare_config_region 
FOREIGN KEY (region_id) REFERENCES regions(id);

-- Create indexes for delivery_fare_config
CREATE INDEX IF NOT EXISTS idx_delivery_fare_config_vehicle_type ON delivery_fare_config(vehicle_type_id);
CREATE INDEX IF NOT EXISTS idx_delivery_fare_config_region ON delivery_fare_config(region_id);
CREATE INDEX IF NOT EXISTS idx_delivery_fare_config_active ON delivery_fare_config(is_active) WHERE is_active = true;

-- Add delivery-related fields to drivers table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='can_do_deliveries') THEN
    ALTER TABLE drivers ADD COLUMN can_do_deliveries BOOLEAN DEFAULT true;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='delivery_rating') THEN
    ALTER TABLE drivers ADD COLUMN delivery_rating DECIMAL(3, 2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='total_deliveries') THEN
    ALTER TABLE drivers ADD COLUMN total_deliveries INTEGER DEFAULT 0;
  END IF;
END $$;

-- Update vehicle_types to support delivery service
UPDATE vehicle_types 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"supports_delivery": true}'::jsonb
WHERE name IN ('truck', 'bicycle', 'bike', 'car');

-- Seed initial fare configuration data
-- Get region IDs and vehicle type IDs for seeding
DO $$
DECLARE
  v_region_id UUID;
  v_car_id UUID;
  v_bike_id UUID;
  v_bicycle_id UUID;
  v_truck_id UUID;
BEGIN
  -- Use Lagos region explicitly (default region for Nigeria)
  v_region_id := '00000000-0000-0000-0000-000000000001';
  
  -- Get vehicle type IDs
  SELECT id INTO v_car_id FROM vehicle_types WHERE name = 'car' LIMIT 1;
  SELECT id INTO v_bike_id FROM vehicle_types WHERE name = 'bike' LIMIT 1;
  SELECT id INTO v_bicycle_id FROM vehicle_types WHERE name = 'bicycle' LIMIT 1;
  SELECT id INTO v_truck_id FROM vehicle_types WHERE name = 'truck' LIMIT 1;
  
  -- Insert fare configurations if region and vehicle types exist
  IF v_region_id IS NOT NULL THEN
    -- Car delivery fares
    IF v_car_id IS NOT NULL THEN
      INSERT INTO delivery_fare_config (vehicle_type_id, region_id, base_fare, price_per_km, minimum_fare, scheduled_delivery_surcharge)
      VALUES (v_car_id, v_region_id, 500, 100, 300, 200)
      ON CONFLICT (vehicle_type_id, region_id) DO NOTHING;
    END IF;
    
    -- Bike delivery fares
    IF v_bike_id IS NOT NULL THEN
      INSERT INTO delivery_fare_config (vehicle_type_id, region_id, base_fare, price_per_km, minimum_fare, scheduled_delivery_surcharge)
      VALUES (v_bike_id, v_region_id, 300, 80, 200, 200)
      ON CONFLICT (vehicle_type_id, region_id) DO NOTHING;
    END IF;
    
    -- Bicycle delivery fares
    IF v_bicycle_id IS NOT NULL THEN
      INSERT INTO delivery_fare_config (vehicle_type_id, region_id, base_fare, price_per_km, minimum_fare, scheduled_delivery_surcharge)
      VALUES (v_bicycle_id, v_region_id, 200, 50, 150, 200)
      ON CONFLICT (vehicle_type_id, region_id) DO NOTHING;
    END IF;
    
    -- Truck delivery fares
    IF v_truck_id IS NOT NULL THEN
      INSERT INTO delivery_fare_config (vehicle_type_id, region_id, base_fare, price_per_km, minimum_fare, scheduled_delivery_surcharge)
      VALUES (v_truck_id, v_region_id, 1000, 150, 800, 200)
      ON CONFLICT (vehicle_type_id, region_id) DO NOTHING;
    END IF;
  END IF;
END $$;

-- Create function to generate order numbers
CREATE OR REPLACE FUNCTION generate_delivery_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  -- Get the count of deliveries today
  SELECT COUNT(*) INTO counter
  FROM deliveries
  WHERE DATE(created_at) = CURRENT_DATE;
  
  -- Generate order number: ORDB + 4 digits
  new_number := 'ORDB' || LPAD((counter + 1)::TEXT, 4, '0');
  
  -- Check if it exists (unlikely but possible with concurrent inserts)
  WHILE EXISTS (SELECT 1 FROM deliveries WHERE order_number = new_number) LOOP
    counter := counter + 1;
    new_number := 'ORDB' || LPAD(counter::TEXT, 4, '0');
  END LOOP;
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate order numbers
CREATE OR REPLACE FUNCTION set_delivery_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_delivery_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_delivery_order_number
BEFORE INSERT ON deliveries
FOR EACH ROW
EXECUTE FUNCTION set_delivery_order_number();

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_delivery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_updated_at
BEFORE UPDATE ON deliveries
FOR EACH ROW
EXECUTE FUNCTION update_delivery_updated_at();

-- Add comments for documentation
COMMENT ON TABLE deliveries IS 'Main table for delivery orders';
COMMENT ON TABLE delivery_status_history IS 'Audit trail for delivery status changes';
COMMENT ON TABLE delivery_fare_config IS 'Fare configuration for delivery service by vehicle type and region';
COMMENT ON COLUMN deliveries.pickup_code IS 'Authentication code for package pickup verification';
COMMENT ON COLUMN deliveries.delivery_code IS 'Authentication code for package delivery verification';
COMMENT ON COLUMN deliveries.status IS 'Current delivery status: pending, searching, assigned, courier_enroute_pickup, arrived_pickup, picked_up, enroute_delivery, arrived_delivery, delivered, cancelled';
