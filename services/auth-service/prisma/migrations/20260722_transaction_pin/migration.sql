-- Add transaction PIN to users table
-- NULL = user has not set a PIN yet
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS transaction_pin_hash VARCHAR(255);

COMMENT ON COLUMN users.transaction_pin_hash IS
  'Bcrypt hash of the user 4-digit transaction PIN. NULL means no PIN has been set.';
