-- Rollback script for delivery tables migration
-- Run this if you need to undo the migration

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_delivery_updated_at ON deliveries;
DROP TRIGGER IF EXISTS trigger_set_delivery_order_number ON deliveries;

-- Drop functions
DROP FUNCTION IF EXISTS update_delivery_updated_at();
DROP FUNCTION IF EXISTS set_delivery_order_number();
DROP FUNCTION IF EXISTS generate_delivery_order_number();

-- Drop tables (in reverse order of creation)
DROP TABLE IF EXISTS delivery_fare_config CASCADE;
DROP TABLE IF EXISTS delivery_status_history CASCADE;
DROP TABLE IF EXISTS deliveries CASCADE;

-- Remove delivery-related columns from drivers table
ALTER TABLE drivers DROP COLUMN IF EXISTS can_do_deliveries;
ALTER TABLE drivers DROP COLUMN IF EXISTS delivery_rating;
ALTER TABLE drivers DROP COLUMN IF EXISTS total_deliveries;

-- Revert vehicle_types metadata changes (optional - only if needed)
-- UPDATE vehicle_types 
-- SET metadata = metadata - 'supports_delivery'
-- WHERE name IN ('truck', 'bicycle', 'bike', 'car');
