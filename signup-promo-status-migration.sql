-- ─────────────────────────────────────────────────────────────────────────────
-- Signup Promo Status Model Migration
-- Run AFTER signup-promo-migration.sql
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the status column
--    Stored statuses: scheduled | paused | ended | deactivated
--    'active' is derived at query time from the date window — never stored.
ALTER TABLE signup_promos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'paused', 'ended', 'deactivated'));

-- 2. Migrate existing rows
--    Any row that was is_active=true is now treated as 'scheduled'
--    (the date window query will surface it as active automatically).
UPDATE signup_promos SET status = 'scheduled';

-- 3. Drop the old partial unique index — uniqueness is now enforced in app logic
--    (only one promo can be effectively active at a time based on dates + status)
DROP INDEX IF EXISTS idx_signup_promos_one_active;

-- 4. New indexes
CREATE INDEX IF NOT EXISTS idx_signup_promos_status     ON signup_promos (status);
CREATE INDEX IF NOT EXISTS idx_signup_promos_status_dates ON signup_promos (status, starts_at, ends_at);
