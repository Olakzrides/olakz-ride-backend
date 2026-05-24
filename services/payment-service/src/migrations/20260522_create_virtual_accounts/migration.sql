-- Create virtual_accounts table for permanent Flutterwave virtual accounts
CREATE TABLE IF NOT EXISTS virtual_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number VARCHAR(20) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  flw_ref VARCHAR(100) NOT NULL UNIQUE,
  order_ref VARCHAR(100),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS virtual_accounts_user_id_currency_idx
  ON virtual_accounts(user_id, currency_code);

CREATE INDEX IF NOT EXISTS virtual_accounts_flw_ref_idx
  ON virtual_accounts(flw_ref);
