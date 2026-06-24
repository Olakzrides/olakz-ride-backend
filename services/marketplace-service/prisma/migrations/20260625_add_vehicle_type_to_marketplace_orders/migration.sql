-- Add vehicle_type column to marketplace_orders so customers can choose delivery vehicle
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS vehicle_type varchar(50) NOT NULL DEFAULT 'motorcycle';
