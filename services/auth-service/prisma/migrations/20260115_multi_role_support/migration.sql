-- Migration: Multi-Role Support
-- Date: 2026-01-15
-- Description: Convert single role to multi-role support with active role tracking

-- Step 1: Add new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['customer']::TEXT[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_role VARCHAR(20) DEFAULT 'customer';

-- Step 2: Migrate existing role data to roles array
UPDATE users SET roles = ARRAY[role]::TEXT[] WHERE roles = ARRAY['customer']::TEXT[];
UPDATE users SET active_role = role WHERE active_role = 'customer';

-- Step 3: Create index on active_role
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users(active_role);

-- Step 4: Drop old role column and index (commented out for safety - uncomment after verification)
-- DROP INDEX IF EXISTS idx_users_role;
-- ALTER TABLE users DROP COLUMN IF EXISTS role;

-- Note: Keep the old 'role' column temporarily for backward compatibility
-- After verifying the migration works, you can uncomment the DROP statements above
