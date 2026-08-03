-- ================================================================
-- Track which admin submitted (locked) each day's audit
--
-- Adds two columns to both audit tables:
--   locked_by       UUID  — the admin's user ID who clicked "Submit"
--   locked_by_name  TEXT  — their resolved display name at submit time
--
-- These are NULL until the day is locked.
-- ================================================================

ALTER TABLE audit_transactions
  ADD COLUMN IF NOT EXISTS locked_by      UUID    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locked_by_name TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locked_at      TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE audit_expenditures
  ADD COLUMN IF NOT EXISTS locked_by      UUID    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locked_by_name TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locked_at      TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN audit_transactions.locked_by      IS 'Admin user ID who submitted/locked this day''s audit';
COMMENT ON COLUMN audit_transactions.locked_by_name IS 'Resolved display name of the admin who locked, captured at lock time';
COMMENT ON COLUMN audit_transactions.locked_at      IS 'Timestamp when this record was locked';

COMMENT ON COLUMN audit_expenditures.locked_by      IS 'Admin user ID who submitted/locked this day''s audit';
COMMENT ON COLUMN audit_expenditures.locked_by_name IS 'Resolved display name of the admin who locked, captured at lock time';
COMMENT ON COLUMN audit_expenditures.locked_at      IS 'Timestamp when this record was locked';
