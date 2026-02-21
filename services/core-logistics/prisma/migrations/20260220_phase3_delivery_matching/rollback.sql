-- Rollback Phase 3: Delivery Matching Infrastructure

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_courier_delivery_stats ON deliveries;
DROP TRIGGER IF EXISTS trigger_update_delivery_request_timestamp ON delivery_requests;

-- Drop functions
DROP FUNCTION IF EXISTS update_courier_delivery_stats();
DROP FUNCTION IF EXISTS update_delivery_request_timestamp();

-- Remove columns from deliveries table
ALTER TABLE deliveries
DROP COLUMN IF EXISTS searching_at,
DROP COLUMN IF EXISTS courier_arrived_pickup_at,
DROP COLUMN IF EXISTS courier_arrived_delivery_at;

-- Remove courier earnings columns from drivers table
ALTER TABLE drivers
DROP COLUMN IF EXISTS total_deliveries,
DROP COLUMN IF EXISTS delivery_rating,
DROP COLUMN IF EXISTS total_delivery_earnings;

-- Drop delivery_requests table
DROP TABLE IF EXISTS delivery_requests;

-- Remove service_types column from drivers table
ALTER TABLE drivers
DROP COLUMN IF EXISTS service_types;
