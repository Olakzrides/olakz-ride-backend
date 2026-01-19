-- Migration: Phase 3 Real-time Features
-- Date: 2026-01-15
-- Description: Add real-time ride matching, driver tracking, and Socket.IO support

-- ============================================
-- RIDE REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ride_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    batch_number INTEGER DEFAULT 1,
    distance_from_pickup DECIMAL(8,2) NOT NULL,
    estimated_arrival INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(ride_id, driver_id)
);

-- Indexes for ride_requests
CREATE INDEX IF NOT EXISTS idx_ride_requests_ride_id ON ride_requests(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_id ON ride_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON ride_requests(status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_expires_at ON ride_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_ride_requests_batch_number ON ride_requests(batch_number);
CREATE INDEX IF NOT EXISTS idx_ride_requests_ride_status ON ride_requests(ride_id, status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_status ON ride_requests(driver_id, status);

-- ============================================
-- DRIVER LOCATION TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS driver_location_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    heading DECIMAL(5,2),
    speed DECIMAL(5,2),
    accuracy DECIMAL(6,2),
    is_online BOOLEAN DEFAULT true,
    is_available BOOLEAN DEFAULT true,
    battery_level INTEGER CHECK (battery_level >= 0 AND battery_level <= 100),
    app_version VARCHAR(20),
    device_info JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for driver_location_tracking
CREATE INDEX IF NOT EXISTS idx_driver_location_tracking_driver_id ON driver_location_tracking(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_location_tracking_created_at ON driver_location_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_driver_location_tracking_online_available ON driver_location_tracking(is_online, is_available);
CREATE INDEX IF NOT EXISTS idx_driver_location_tracking_driver_created ON driver_location_tracking(driver_id, created_at);

-- ============================================
-- RIDE STATUS UPDATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ride_status_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    previous_status VARCHAR(30),
    updated_by UUID NOT NULL,
    updated_by_type VARCHAR(20) NOT NULL CHECK (updated_by_type IN ('customer', 'driver', 'system')),
    message TEXT,
    location JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ride_status_updates
CREATE INDEX IF NOT EXISTS idx_ride_status_updates_ride_id ON ride_status_updates(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_status_updates_status ON ride_status_updates(status);
CREATE INDEX IF NOT EXISTS idx_ride_status_updates_created_at ON ride_status_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_ride_status_updates_ride_created ON ride_status_updates(ride_id, created_at);

-- ============================================
-- SOCKET CONNECTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS socket_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    socket_id VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'driver', 'admin')),
    is_connected BOOLEAN DEFAULT true,
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    device_info JSONB DEFAULT '{}',
    app_version VARCHAR(20),
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ
);

-- Indexes for socket_connections
CREATE INDEX IF NOT EXISTS idx_socket_connections_user_id ON socket_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_socket_connections_user_type ON socket_connections(user_type);
CREATE INDEX IF NOT EXISTS idx_socket_connections_is_connected ON socket_connections(is_connected);
CREATE INDEX IF NOT EXISTS idx_socket_connections_last_activity ON socket_connections(last_activity);
CREATE INDEX IF NOT EXISTS idx_socket_connections_user_connected ON socket_connections(user_id, is_connected);

-- ============================================
-- UPDATE EXISTING TABLES
-- ============================================

-- Add updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_ride_requests_updated_at ON ride_requests;
CREATE TRIGGER update_ride_requests_updated_at 
    BEFORE UPDATE ON ride_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CLEANUP OLD LOCATION DATA (OPTIONAL)
-- ============================================

-- Function to cleanup old location tracking data (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_location_data()
RETURNS void AS $$
BEGIN
    DELETE FROM driver_location_tracking 
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    DELETE FROM socket_connections 
    WHERE disconnected_at IS NOT NULL 
    AND disconnected_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant permissions to service role (adjust as needed)
GRANT ALL ON ride_requests TO service_role;
GRANT ALL ON driver_location_tracking TO service_role;
GRANT ALL ON ride_status_updates TO service_role;
GRANT ALL ON socket_connections TO service_role;

-- Grant read permissions to authenticated users
GRANT SELECT ON ride_requests TO authenticated;
GRANT SELECT ON driver_location_tracking TO authenticated;
GRANT SELECT ON ride_status_updates TO authenticated;
GRANT SELECT ON socket_connections TO authenticated;

-- Note: Adjust permissions based on your RLS policies