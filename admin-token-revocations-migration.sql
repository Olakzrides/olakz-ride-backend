-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Token Revocations
-- Run once in Supabase SQL Editor
--
-- Purpose:
--   Enables instant forced-logout when a super admin removes an admin's role.
--   One row per user — stores the timestamp of the most recent revocation.
--   The adminAuthMiddleware rejects any JWT whose iat (issued-at) is BEFORE
--   this timestamp, even if the JWT signature is still technically valid.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_token_revocations (
  user_id    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revoked_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by the middleware on every admin request
CREATE INDEX IF NOT EXISTS idx_admin_token_revocations_user_id
  ON admin_token_revocations (user_id);

-- RLS: only service role can read/write (admin-service uses service role key)
ALTER TABLE admin_token_revocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_token_revocations"
    ON admin_token_revocations FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
