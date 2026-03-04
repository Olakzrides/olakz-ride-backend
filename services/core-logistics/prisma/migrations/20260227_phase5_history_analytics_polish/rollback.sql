-- Rollback Phase 5 Migration
-- This script reverses all changes made in the Phase 5 migration

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_handle_dispute_resolution ON delivery_disputes;
DROP TRIGGER IF EXISTS trigger_set_delivery_has_issue ON delivery_issues;
DROP TRIGGER IF EXISTS trigger_update_delivery_issues_timestamp ON delivery_issues;
DROP TRIGGER IF EXISTS trigger_update_delivery_disputes_timestamp ON delivery_disputes;

-- Drop functions
DROP FUNCTION IF EXISTS handle_dispute_resolution();
DROP FUNCTION IF EXISTS set_delivery_has_issue();
DROP FUNCTION IF EXISTS update_delivery_issues_timestamp();
DROP FUNCTION IF EXISTS refresh_delivery_analytics();

-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS delivery_analytics_summary;

-- Remove columns from deliveries table
ALTER TABLE deliveries DROP COLUMN IF EXISTS timeout_at;
ALTER TABLE deliveries DROP COLUMN IF EXISTS timed_out_at;
ALTER TABLE deliveries DROP COLUMN IF EXISTS has_issue;
ALTER TABLE deliveries DROP COLUMN IF EXISTS flagged_for_review;
ALTER TABLE deliveries DROP COLUMN IF EXISTS review_reason;
ALTER TABLE deliveries DROP COLUMN IF EXISTS courier_no_show;
ALTER TABLE deliveries DROP COLUMN IF EXISTS no_show_reported_at;
ALTER TABLE deliveries DROP COLUMN IF EXISTS rematch_count;
ALTER TABLE deliveries DROP COLUMN IF EXISTS matching_started_at;

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS delivery_reminders;
DROP TABLE IF EXISTS delivery_disputes;
DROP TABLE IF EXISTS delivery_issues;
