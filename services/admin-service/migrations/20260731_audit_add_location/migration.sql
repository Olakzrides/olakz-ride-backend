-- Add location column to audit_transactions
-- Admin enters the location for each transaction (free-text, e.g. "Ikeja, Lagos")
-- Searchable via partial case-insensitive match

ALTER TABLE audit_transactions
  ADD COLUMN IF NOT EXISTS location TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_transactions_location
  ON audit_transactions USING gin(to_tsvector('english', COALESCE(location, '')));

-- Also add a simple btree index for ilike queries
CREATE INDEX IF NOT EXISTS idx_audit_transactions_location_text
  ON audit_transactions(location);

COMMENT ON COLUMN audit_transactions.location IS
  'Free-text location of the transaction, e.g. "Ikeja, Lagos". Used for filtering and search.';
