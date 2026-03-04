-- Phase 5: History, Analytics & Polish Migration
-- Created: 2026-02-27
-- Purpose: Add tables and columns for delivery issues, disputes, reminders, timeouts, and analytics

-- =====================================================
-- 1. DELIVERY ISSUES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL, -- user_id of reporter (customer or courier)
  reporter_type VARCHAR(20) NOT NULL CHECK (reporter_type IN ('customer', 'courier')),
  issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN ('package_damaged', 'recipient_unavailable', 'wrong_address', 'courier_misconduct', 'other')),
  description TEXT NOT NULL,
  photo_urls TEXT[], -- Array of photo URLs as evidence
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected')),
  admin_notes TEXT,
  resolved_by UUID, -- admin user_id
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_issues_delivery_id ON delivery_issues(delivery_id);
CREATE INDEX idx_delivery_issues_status ON delivery_issues(status);
CREATE INDEX idx_delivery_issues_reported_by ON delivery_issues(reported_by);
CREATE INDEX idx_delivery_issues_created_at ON delivery_issues(created_at DESC);


-- =====================================================
-- 2. DELIVERY DISPUTES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES delivery_issues(id) ON DELETE SET NULL,
  initiated_by UUID NOT NULL, -- user_id of person who initiated dispute
  initiator_type VARCHAR(20) NOT NULL CHECK (initiator_type IN ('customer', 'courier')),
  dispute_reason TEXT NOT NULL,
  evidence_urls TEXT[], -- Array of evidence photo/document URLs
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'rejected')),
  resolution_type VARCHAR(30) CHECK (resolution_type IN ('refund', 'partial_refund', 'penalty', 'no_action')),
  refund_amount DECIMAL(10, 2),
  penalty_amount DECIMAL(10, 2),
  admin_decision TEXT,
  reviewed_by UUID, -- admin user_id
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_disputes_delivery_id ON delivery_disputes(delivery_id);
CREATE INDEX idx_delivery_disputes_status ON delivery_disputes(status);
CREATE INDEX idx_delivery_disputes_initiated_by ON delivery_disputes(initiated_by);
CREATE INDEX idx_delivery_disputes_created_at ON delivery_disputes(created_at DESC);


-- =====================================================
-- 3. DELIVERY REMINDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  reminder_type VARCHAR(20) NOT NULL CHECK (reminder_type IN ('1_hour_before', '15_min_before')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_reminders_delivery_id ON delivery_reminders(delivery_id);
CREATE INDEX idx_delivery_reminders_status ON delivery_reminders(status);
CREATE INDEX idx_delivery_reminders_scheduled_for ON delivery_reminders(scheduled_for);
CREATE UNIQUE INDEX idx_delivery_reminders_unique ON delivery_reminders(delivery_id, reminder_type);


-- =====================================================
-- 4. ADD NEW COLUMNS TO DELIVERIES TABLE
-- =====================================================

-- Timeout tracking
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS timed_out_at TIMESTAMPTZ;

-- Issue and review flags
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS has_issue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS review_reason TEXT;

-- No-show tracking
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS courier_no_show BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS no_show_reported_at TIMESTAMPTZ;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS rematch_count INTEGER NOT NULL DEFAULT 0;

-- Matching tracking for scheduled deliveries
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS matching_started_at TIMESTAMPTZ;

CREATE INDEX idx_deliveries_timeout_at ON deliveries(timeout_at) WHERE timeout_at IS NOT NULL;
CREATE INDEX idx_deliveries_flagged_for_review ON deliveries(flagged_for_review) WHERE flagged_for_review = TRUE;
CREATE INDEX idx_deliveries_has_issue ON deliveries(has_issue) WHERE has_issue = TRUE;
CREATE INDEX idx_deliveries_scheduled_pickup ON deliveries(scheduled_pickup_at) WHERE scheduled_pickup_at IS NOT NULL AND status = 'pending';


-- =====================================================
-- 5. DELIVERY ANALYTICS MATERIALIZED VIEW (Optional - for performance)
-- =====================================================
-- This view can be used for quick analytics queries
-- Refresh periodically (every 5 minutes via scheduler)

CREATE MATERIALIZED VIEW IF NOT EXISTS delivery_analytics_summary AS
SELECT
  d.region_id,
  d.vehicle_type_id,
  d.delivery_type,
  DATE(d.created_at) as delivery_date,
  COUNT(*) as total_deliveries,
  COUNT(*) FILTER (WHERE d.status = 'delivered') as completed_deliveries,
  COUNT(*) FILTER (WHERE d.status = 'cancelled') as cancelled_deliveries,
  COUNT(*) FILTER (WHERE d.courier_no_show = TRUE) as no_show_count,
  COUNT(*) FILTER (WHERE d.has_issue = TRUE) as issue_count,
  AVG(d.final_fare) FILTER (WHERE d.status = 'delivered') as avg_fare,
  SUM(d.final_fare) FILTER (WHERE d.status = 'delivered') as total_revenue,
  SUM(d.platform_earnings) FILTER (WHERE d.status = 'delivered') as total_platform_earnings,
  SUM(d.courier_earnings) FILTER (WHERE d.status = 'delivered') as total_courier_earnings,
  AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.created_at))/60) FILTER (WHERE d.status = 'delivered') as avg_delivery_time_minutes,
  AVG(d.distance_km) FILTER (WHERE d.status = 'delivered') as avg_distance_km
FROM deliveries d
GROUP BY d.region_id, d.vehicle_type_id, d.delivery_type, DATE(d.created_at);

CREATE UNIQUE INDEX idx_delivery_analytics_summary_unique ON delivery_analytics_summary(region_id, vehicle_type_id, delivery_type, delivery_date);

-- Function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_delivery_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY delivery_analytics_summary;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 6. TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Trigger to set has_issue flag when issue is created
CREATE OR REPLACE FUNCTION set_delivery_has_issue()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE deliveries
  SET has_issue = TRUE, updated_at = NOW()
  WHERE id = NEW.delivery_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_delivery_has_issue
AFTER INSERT ON delivery_issues
FOR EACH ROW
EXECUTE FUNCTION set_delivery_has_issue();

-- Trigger to update delivery status when dispute is resolved
CREATE OR REPLACE FUNCTION handle_dispute_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    UPDATE deliveries
    SET 
      status = CASE 
        WHEN NEW.resolution_type IN ('refund', 'partial_refund') THEN 'cancelled'
        ELSE status
      END,
      updated_at = NOW()
    WHERE id = NEW.delivery_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_handle_dispute_resolution
AFTER UPDATE ON delivery_disputes
FOR EACH ROW
WHEN (NEW.status = 'resolved')
EXECUTE FUNCTION handle_dispute_resolution();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_delivery_issues_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_delivery_issues_timestamp
BEFORE UPDATE ON delivery_issues
FOR EACH ROW
EXECUTE FUNCTION update_delivery_issues_timestamp();

CREATE TRIGGER trigger_update_delivery_disputes_timestamp
BEFORE UPDATE ON delivery_disputes
FOR EACH ROW
EXECUTE FUNCTION update_delivery_issues_timestamp();

-- Comments for documentation
COMMENT ON TABLE delivery_issues IS 'Tracks issues reported during delivery (damaged package, wrong address, etc.)';
COMMENT ON TABLE delivery_disputes IS 'Tracks disputes that require admin resolution with potential refunds/penalties';
COMMENT ON TABLE delivery_reminders IS 'Tracks scheduled reminders sent to customers before pickup time';
COMMENT ON COLUMN deliveries.timeout_at IS 'Calculated timeout deadline based on status and estimated duration';
COMMENT ON COLUMN deliveries.flagged_for_review IS 'Marks delivery for admin review due to timeout or other issues';
COMMENT ON COLUMN deliveries.courier_no_show IS 'Indicates courier did not show up after accepting delivery';
COMMENT ON COLUMN deliveries.rematch_count IS 'Number of times delivery was rematched due to courier no-show';
