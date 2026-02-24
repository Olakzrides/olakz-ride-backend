-- Phase 4: Delivery Completion & Rating System
-- Add delivery ratings table and courier earnings tracking

-- =====================================================
-- 1. Create delivery_ratings table
-- =====================================================
CREATE TABLE delivery_ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  
  -- Customer rates courier
  courier_rating INTEGER CHECK (courier_rating >= 1 AND courier_rating <= 5),
  courier_feedback TEXT,
  courier_rated_at TIMESTAMP WITH TIME ZONE,
  
  -- Courier rates customer
  customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
  customer_feedback TEXT,
  customer_rated_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one rating record per delivery
  CONSTRAINT unique_delivery_rating UNIQUE (delivery_id)
);

-- Indexes for performance
CREATE INDEX idx_delivery_ratings_delivery_id ON delivery_ratings(delivery_id);
CREATE INDEX idx_delivery_ratings_customer_id ON delivery_ratings(customer_id);
CREATE INDEX idx_delivery_ratings_courier_id ON delivery_ratings(courier_id);
CREATE INDEX idx_delivery_ratings_courier_rating ON delivery_ratings(courier_rating) WHERE courier_rating IS NOT NULL;

COMMENT ON TABLE delivery_ratings IS 'Stores ratings for completed deliveries - both customer and courier can rate each other';
COMMENT ON COLUMN delivery_ratings.courier_rating IS 'Customer rating of courier (1-5 stars)';
COMMENT ON COLUMN delivery_ratings.customer_rating IS 'Courier rating of customer (1-5 stars)';

-- =====================================================
-- 2. Add courier earnings columns to deliveries table
-- =====================================================
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS courier_earnings DECIMAL(12, 2),
ADD COLUMN IF NOT EXISTS platform_earnings DECIMAL(12, 2);

COMMENT ON COLUMN deliveries.courier_earnings IS 'Amount earned by courier for this delivery';
COMMENT ON COLUMN deliveries.platform_earnings IS 'Platform earnings (service_fee + rounding_fee)';

-- =====================================================
-- 3. Create function to recalculate courier delivery rating
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_courier_delivery_rating(p_courier_id UUID)
RETURNS VOID AS $$
DECLARE
  v_avg_rating DECIMAL(3, 2);
  v_total_ratings INTEGER;
BEGIN
  -- Calculate average rating from all deliveries where courier was rated
  SELECT 
    COALESCE(AVG(courier_rating), 0),
    COUNT(courier_rating)
  INTO v_avg_rating, v_total_ratings
  FROM delivery_ratings
  WHERE courier_id = p_courier_id
    AND courier_rating IS NOT NULL;
  
  -- Update driver's delivery rating
  UPDATE drivers
  SET 
    delivery_rating = v_avg_rating,
    updated_at = NOW()
  WHERE id = p_courier_id;
  
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_courier_delivery_rating IS 'Recalculates courier average delivery rating based on all ratings';

-- =====================================================
-- 4. Create trigger to update courier rating on new rating
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_recalculate_courier_delivery_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate when courier rating is added or updated
  IF (TG_OP = 'INSERT' AND NEW.courier_rating IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND NEW.courier_rating IS NOT NULL AND 
      (OLD.courier_rating IS NULL OR OLD.courier_rating != NEW.courier_rating)) THEN
    PERFORM recalculate_courier_delivery_rating(NEW.courier_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_courier_delivery_rating
AFTER INSERT OR UPDATE ON delivery_ratings
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_courier_delivery_rating();

-- =====================================================
-- 5. Create function to update courier total earnings
-- =====================================================
CREATE OR REPLACE FUNCTION update_courier_delivery_earnings()
RETURNS TRIGGER AS $$
BEGIN
  -- Update when delivery is completed and earnings are set
  IF NEW.status = 'delivered' AND NEW.courier_earnings IS NOT NULL AND 
     (OLD.status != 'delivered' OR OLD.courier_earnings IS NULL) THEN
    
    UPDATE drivers
    SET 
      total_delivery_earnings = COALESCE(total_delivery_earnings, 0) + NEW.courier_earnings,
      updated_at = NOW()
    WHERE id = NEW.courier_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_courier_delivery_earnings
AFTER UPDATE ON deliveries
FOR EACH ROW
WHEN (NEW.courier_id IS NOT NULL)
EXECUTE FUNCTION update_courier_delivery_earnings();

-- =====================================================
-- 6. Create function to update delivery_ratings timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_delivery_rating_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_rating_timestamp
BEFORE UPDATE ON delivery_ratings
FOR EACH ROW
EXECUTE FUNCTION update_delivery_rating_timestamp();
