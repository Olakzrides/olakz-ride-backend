-- CreateTable: recent_locations
-- Stores user's recently visited locations for quick access
-- Auto-updated when rides complete

CREATE TABLE recent_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  location_type VARCHAR(20) NOT NULL, -- 'pickup' or 'dropoff'
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  address TEXT NOT NULL,
  visit_count INT DEFAULT 1,
  last_visited_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient user queries ordered by recency
CREATE INDEX idx_recent_locations_user ON recent_locations(user_id, last_visited_at DESC);

-- Unique constraint to prevent duplicate addresses per user
CREATE UNIQUE INDEX idx_recent_locations_unique ON recent_locations(user_id, address);

-- Index for location type filtering
CREATE INDEX idx_recent_locations_type ON recent_locations(user_id, location_type);

COMMENT ON TABLE recent_locations IS 'Stores recently visited locations for quick access in UI';
COMMENT ON COLUMN recent_locations.visit_count IS 'Number of times user has visited this location';
COMMENT ON COLUMN recent_locations.last_visited_at IS 'Most recent visit timestamp for ordering';
