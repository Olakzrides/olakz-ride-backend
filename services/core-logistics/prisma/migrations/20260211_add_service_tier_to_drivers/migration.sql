-- Add service_tier_id column to drivers table
-- This separates service tier (Standard/Premium/VIP) from physical vehicle type (car/motorcycle/etc.)

-- Step 1: Add the column as nullable first
ALTER TABLE drivers ADD COLUMN service_tier_id UUID;

-- Step 2: Set default to Standard tier for all existing drivers
-- Standard tier UUID: 00000000-0000-0000-0000-000000000011
UPDATE drivers 
SET service_tier_id = '00000000-0000-0000-0000-000000000011'
WHERE service_tier_id IS NULL;

-- Step 3: Make the column NOT NULL
ALTER TABLE drivers ALTER COLUMN service_tier_id SET NOT NULL;

-- Step 4: Add foreign key constraint
ALTER TABLE drivers 
ADD CONSTRAINT fk_drivers_service_tier 
FOREIGN KEY (service_tier_id) 
REFERENCES vehicle_types(id);

-- Step 5: Add index for performance
CREATE INDEX idx_drivers_service_tier ON drivers(service_tier_id);

-- Step 6: Add comment for documentation
COMMENT ON COLUMN drivers.service_tier_id IS 'Service tier (Standard/Premium/VIP) - determines pricing and matching';
COMMENT ON COLUMN drivers.vehicle_type_id IS 'DEPRECATED: Use service_tier_id for matching. This field kept for backward compatibility';
