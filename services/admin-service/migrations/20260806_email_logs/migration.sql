-- ================================================================
-- Email Transaction Logs
-- Every email sent by the platform is recorded here.
-- Admin can view, filter, and resend failed/sent emails.
-- ================================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email  VARCHAR(255) NOT NULL,
  recipient_name   VARCHAR(150),
  subject          TEXT        NOT NULL,
  body_html        TEXT        NOT NULL,
  email_type       VARCHAR(50) NOT NULL,   -- otp | welcome | driver_approval | driver_rejection | admin_pending | admin_approval | order_confirmation | dispute | broadcast | other
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  error_message    TEXT,
  resend_count     INT         NOT NULL DEFAULT 0,
  last_resent_at   TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT email_logs_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient  ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status     ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_type       ON email_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_email_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_logs_updated_at ON email_logs;
CREATE TRIGGER trg_email_logs_updated_at
  BEFORE UPDATE ON email_logs
  FOR EACH ROW EXECUTE FUNCTION update_email_logs_updated_at();

COMMENT ON TABLE email_logs IS
  'All outbound emails sent by the Olakz platform. '
  'Admins can view status and resend failed emails from the dashboard.';
