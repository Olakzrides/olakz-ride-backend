-- Add ride sharing functionality
-- Allows passengers to share ride tracking with friends/family

-- Add share token and expiry to rides table
ALTER TABLE rides 
ADD COLUMN share_token VARCHAR(255) UNIQUE,
ADD COLUMN share_token_created_at TIMESTAMPTZ,
ADD COLUMN share_token_expires_at TIMESTAMPTZ,
ADD COLUMN share_token_revoked BOOLEAN DEFAULT false;

-- Index for fast token lookup
CREATE INDEX idx_rides_share_token ON rides(share_token) WHERE share_token IS NOT NULL;

-- Index for cleanup of expired tokens
CREATE INDEX idx_rides_share_token_expires ON rides(share_token_expires_at) WHERE share_token_expires_at IS NOT NULL;

COMMENT ON COLUMN rides.share_token IS 'Unique token for public ride tracking link';
COMMENT ON COLUMN rides.share_token_created_at IS 'When the share link was generated';
COMMENT ON COLUMN rides.share_token_expires_at IS 'When the share link expires (2 hours after ride completion)';
COMMENT ON COLUMN rides.share_token_revoked IS 'Whether passenger has revoked the share link';
