-- Add separate admin_password_hash column to users table.
--
-- Purpose:
--   When a regular user is promoted to admin, the super admin sets a
--   dedicated admin password stored in this column. The original
--   password_hash is never touched, so the user can still log into the
--   mobile app with their original password even after being promoted or
--   subsequently demoted/suspended as admin.
--
-- Login routing:
--   X-Client-Type: admin  → checks admin_password_hash (falls back to
--                            password_hash if admin_password_hash is null)
--   No header (mobile app) → checks password_hash only

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_password_hash VARCHAR(255);

COMMENT ON COLUMN users.admin_password_hash IS
  'Separate password hash for admin dashboard login. Set by super admin when promoting a user. Does not affect the user''s mobile app password (password_hash).';
