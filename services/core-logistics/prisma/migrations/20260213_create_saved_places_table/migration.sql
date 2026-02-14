-- Migration: Create saved_places table for user's favorite locations
-- Date: February 13, 2026

CREATE TABLE saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  place_type VARCHAR(20) NOT NULL CHECK (place_type IN ('home', 'work', 'favorite')),
  label VARCHAR(100),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_saved_places_user_id ON saved_places(user_id);
CREATE INDEX idx_saved_places_type ON saved_places(user_id, place_type);
CREATE INDEX idx_saved_places_default ON saved_places(user_id, is_default);

-- Ensure only one default place per type per user
CREATE UNIQUE INDEX idx_saved_places_unique_default 
ON saved_places(user_id, place_type, is_default) 
WHERE is_default = true;

-- Comments
COMMENT ON TABLE saved_places IS 'Stores user favorite locations (home, work, custom)';
COMMENT ON COLUMN saved_places.place_type IS 'Type of place: home, work, or favorite';
COMMENT ON COLUMN saved_places.is_default IS 'Whether this is the default place for this type';
