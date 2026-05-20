-- Migration: Create withdrawals table

CREATE TABLE IF NOT EXISTS withdrawals (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES users(id),
  bank_account_id  UUID          NOT NULL REFERENCES bank_accounts(id),
  amount           DECIMAL(12,2) NOT NULL,
  fee              DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount       DECIMAL(12,2) NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
  flw_transfer_id  VARCHAR(100),
  flw_reference    VARCHAR(100),
  failure_reason   TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- status values: pending | processing | completed | failed

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals (user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status  ON withdrawals (status);
