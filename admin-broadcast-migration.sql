-- ─────────────────────────────────────────────────────────────────────────────
-- Admin Broadcast Notifications Migration
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Admin broadcasts table ─────────────────────────────────────────────────
-- Stores each broadcast campaign sent by an admin.
-- One row per send — users' inbox rows in notification_history link back here.
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text          NOT NULL,
  body              text          NOT NULL,
  target_role       text          NOT NULL DEFAULT 'all'
                      CHECK (target_role IN ('all', 'customer', 'driver', 'vendor')),
  data              jsonb         NOT NULL DEFAULT '{}',   -- extra key-value for mobile app
  location_filter   jsonb,                                  -- reserved for future location targeting
  sent_by           uuid          NOT NULL,                 -- admin user_id
  status            text          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
  devices_targeted  integer       NOT NULL DEFAULT 0,       -- total device tokens attempted
  devices_reached   integer       NOT NULL DEFAULT 0,       -- successfully delivered
  fcm_message_id    text,                                   -- FCM message ID (topic sends only)
  error_message     text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_sent_by    ON admin_broadcasts (sent_by);
CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_target_role ON admin_broadcasts (target_role);
CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_created_at  ON admin_broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_broadcasts_status      ON admin_broadcasts (status);

-- ── 2. Add broadcast_id to notification_history ───────────────────────────────
-- Links each user's inbox entry back to the originating broadcast.
ALTER TABLE notification_history
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES admin_broadcasts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notification_history_broadcast_id
  ON notification_history (broadcast_id)
  WHERE broadcast_id IS NOT NULL;

-- ── 3. Auto-cleanup: delete broadcast notification_history rows after 30 days ─
-- Runs as a Supabase cron job or can be triggered from Node.js setInterval.
-- The function is created here; scheduling is done separately.
CREATE OR REPLACE FUNCTION cleanup_old_broadcast_notifications()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM notification_history
  WHERE notification_type = 'broadcast'
    AND sent_at < now() - INTERVAL '90 days';
$$;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE admin_broadcasts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_admin_broadcasts"
    ON admin_broadcasts FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
