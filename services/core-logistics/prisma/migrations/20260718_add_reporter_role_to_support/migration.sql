-- ================================================================
-- Add reporter_role to disputes and support_chats
-- Tracks whether the reporter is a customer, driver, or vendor
-- ================================================================

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS reporter_role VARCHAR(20) NOT NULL DEFAULT 'customer';

ALTER TABLE support_chats
  ADD COLUMN IF NOT EXISTS reporter_role VARCHAR(20) NOT NULL DEFAULT 'customer';

CREATE INDEX IF NOT EXISTS idx_disputes_reporter_role    ON disputes(reporter_role);
CREATE INDEX IF NOT EXISTS idx_support_chats_reporter_role ON support_chats(reporter_role);

-- Backfill existing rows: look up active_role from users table
UPDATE disputes d
SET reporter_role = COALESCE(
  (SELECT u.active_role FROM users u WHERE u.id = d.customer_id LIMIT 1),
  'customer'
);

UPDATE support_chats sc
SET reporter_role = COALESCE(
  (SELECT u.active_role FROM users u WHERE u.id = sc.customer_id LIMIT 1),
  'customer'
);
