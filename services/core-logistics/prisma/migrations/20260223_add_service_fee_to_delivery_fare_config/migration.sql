-- Add service_fee and rounding_fee to delivery_fare_config table
-- These represent platform earnings that are configurable per vehicle type per region

ALTER TABLE delivery_fare_config
ADD COLUMN service_fee DECIMAL(10, 2) DEFAULT 0.00,
ADD COLUMN rounding_fee DECIMAL(10, 2) DEFAULT 0.00;

COMMENT ON COLUMN delivery_fare_config.service_fee IS 'Platform service fee for this vehicle type (e.g., Bicycle: 200, Bike: 300, Car: 500, Truck: 700)';
COMMENT ON COLUMN delivery_fare_config.rounding_fee IS 'Platform rounding fee for this vehicle type';

-- Update existing records with default service fees based on vehicle type
-- Bicycle: 200, Bike: 300, Car: 500, Truck: 700
UPDATE delivery_fare_config
SET service_fee = CASE 
  WHEN vehicle_type_id IN (SELECT id FROM vehicle_types WHERE name = 'bicycle') THEN 200.00
  WHEN vehicle_type_id IN (SELECT id FROM vehicle_types WHERE name = 'bike') THEN 300.00
  WHEN vehicle_type_id IN (SELECT id FROM vehicle_types WHERE name = 'car') THEN 500.00
  WHEN vehicle_type_id IN (SELECT id FROM vehicle_types WHERE name = 'truck') THEN 700.00
  ELSE 0.00
END,
rounding_fee = 0.00
WHERE service_fee IS NULL;
