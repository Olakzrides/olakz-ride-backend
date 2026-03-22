-- Add vendor_id to food_restaurants linking to vendors.user_id in platform-service
-- vendor_id = the vendor's user_id (cross-service reference, no FK constraint)
ALTER TABLE food_restaurants
  ADD COLUMN IF NOT EXISTS vendor_id UUID;

CREATE INDEX IF NOT EXISTS idx_food_restaurants_vendor_id ON food_restaurants(vendor_id);

-- Backfill: existing restaurants link vendor_id = owner_id
UPDATE food_restaurants SET vendor_id = owner_id WHERE vendor_id IS NULL;
