-- Migration: Flexible Driver Identification
-- Date: 2026-01-15
-- Description: Add flexible identification fields and make license optional for bicycle/e-scooter drivers

-- Step 1: Add new identification columns
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS identification_type VARCHAR(50);
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS identification_number VARCHAR(100);

-- Step 2: Migrate existing license_number data to new fields
UPDATE drivers 
SET identification_type = 'drivers_license',
    identification_number = license_number
WHERE identification_type IS NULL;

-- Step 3: Make license_number nullable (for bicycle/e-scooter drivers)
ALTER TABLE drivers ALTER COLUMN license_number DROP NOT NULL;

-- Step 4: Add unique constraint on identification_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_identification_number ON drivers(identification_number);

-- Step 5: Drop unique constraint on license_number (since it's now optional)
DROP INDEX IF EXISTS drivers_license_number_key;

-- Note: The old license_number column is kept for backward compatibility
-- It will be required for car/motorcycle/truck/bus drivers but optional for bicycle/e-scooter
