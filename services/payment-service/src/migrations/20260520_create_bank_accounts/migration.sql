-- Migration: Create bank_accounts table
-- Stores user bank account details for withdrawals

CREATE TABLE IF NOT EXISTS bank_accounts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number VARCHAR(20)  NOT NULL,
  account_name   VARCHAR(100) NOT NULL,
  bank_code      VARCHAR(10)  NOT NULL,
  bank_name      VARCHAR(100) NOT NULL,
  is_default     BOOLEAN      NOT NULL DEFAULT false,
  is_verified    BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts (user_id);
