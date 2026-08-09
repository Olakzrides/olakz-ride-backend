-- ================================================================
-- Daily Admin Reports
-- One report per admin per day.
-- Reports older than 6 months are purged automatically by the
-- cleanup job in the admin-service.
-- ================================================================

CREATE TABLE IF NOT EXISTS admin_daily_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID        NOT NULL,
  admin_name    VARCHAR(150) NOT NULL,
  report_date   DATE        NOT NULL,
  department    VARCHAR(100) NOT NULL,
  tasks         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  notes         TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One report per admin per calendar day
  CONSTRAINT uq_admin_daily_report UNIQUE (admin_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_admin_id    ON admin_daily_reports(admin_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date        ON admin_daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_admin_name  ON admin_daily_reports(admin_name);

-- Auto-update updated_at on every row update
CREATE OR REPLACE FUNCTION update_daily_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_reports_updated_at ON admin_daily_reports;
CREATE TRIGGER trg_daily_reports_updated_at
  BEFORE UPDATE ON admin_daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_daily_report_updated_at();

COMMENT ON TABLE admin_daily_reports IS
  'Daily work reports submitted by admin staff. '
  'Purged automatically after 6 months by the admin-service cleanup job.';
