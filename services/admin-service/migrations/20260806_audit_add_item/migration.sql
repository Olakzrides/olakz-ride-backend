-- Add item column to audit_transactions
-- Free-text description of what was transported/serviced
-- e.g. "Food items", "Electronics package", "Passenger ride"
-- Optional — admin fills it in when relevant

ALTER TABLE audit_transactions
  ADD COLUMN IF NOT EXISTS item TEXT DEFAULT NULL;

COMMENT ON COLUMN audit_transactions.item IS
  'Optional description of what was transported or serviced. '
  'E.g. "Food items", "Electronics package", "Passenger ride".';
