-- Add vehicle_type column to food_orders so customers can choose delivery vehicle
ALTER TABLE food_orders
  ADD COLUMN IF NOT EXISTS vehicle_type varchar(50) NOT NULL DEFAULT 'motorcycle';
