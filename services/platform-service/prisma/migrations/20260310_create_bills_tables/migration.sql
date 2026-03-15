-- ==========================================
-- BILL PAYMENTS SCHEMA (PRODUCTION READY)
-- ==========================================

-- 1. Network Providers
CREATE TABLE network_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  flw_biller_code VARCHAR(50) NOT NULL,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  supports_airtime BOOLEAN DEFAULT true,
  supports_data BOOLEAN DEFAULT true,
  min_airtime_amount DECIMAL(10, 2) DEFAULT 50.00,
  max_airtime_amount DECIMAL(10, 2) DEFAULT 500000.00,
  metadata JSON DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Data Bundles
CREATE TABLE data_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_code VARCHAR(20) NOT NULL,
  bundle_code VARCHAR(50) NOT NULL,
  bundle_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  validity VARCHAR(50),
  validity_type VARCHAR(20),
  data_size VARCHAR(50),
  flw_item_code VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  -- Cache management
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Constraints
  CONSTRAINT fk_data_bundles_network FOREIGN KEY (network_code) REFERENCES network_providers(code) ON DELETE CASCADE,
  CONSTRAINT chk_validity_type CHECK (validity_type IN ('daily', 'weekly', 'monthly', 'yearly', 'one-time'))
);

-- 3. Bill Transactions
CREATE TABLE bill_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,
  network VARCHAR(20) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency_code VARCHAR(3) DEFAULT 'NGN',
  -- Data bundle specific
  bundle_code VARCHAR(50),
  bundle_name VARCHAR(100),
  bundle_validity VARCHAR(50),
  -- Payment details
  payment_method VARCHAR(20) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'pending',
  -- Wallet tracking
  wallet_transaction_id UUID,
  wallet_balance_before DECIMAL(10, 2),
  wallet_balance_after DECIMAL(10, 2),
  -- Flutterwave details
  flw_reference VARCHAR(100) UNIQUE,
  flw_tx_ref VARCHAR(100) UNIQUE,
  flw_biller_code VARCHAR(50),
  flw_item_code VARCHAR(50),
  flw_response JSON DEFAULT '{}',
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  -- Timestamps
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Constraints
  CONSTRAINT fk_bill_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bill_transactions_wallet FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  CONSTRAINT chk_transaction_type CHECK (transaction_type IN ('airtime', 'data')),
  CONSTRAINT chk_payment_method CHECK (payment_method IN ('wallet', 'card', 'bank_transfer')),
  CONSTRAINT chk_status CHECK (status IN ('pending', 'processing', 'successful', 'failed', 'reversed')),
  CONSTRAINT chk_payment_status CHECK (payment_status IN ('pending', 'successful', 'failed'))
);

-- 4. Beneficiaries
CREATE TABLE bill_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  network_code VARCHAR(20) NOT NULL,
  is_favorite BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_beneficiaries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_beneficiaries_network FOREIGN KEY (network_code) REFERENCES network_providers(code) ON DELETE CASCADE
);

-- ==========================================
-- INDEXES
-- ==========================================

-- bill_transactions indexes
CREATE INDEX idx_bill_transactions_user_id ON bill_transactions(user_id);
CREATE INDEX idx_bill_transactions_status ON bill_transactions(status);
CREATE INDEX idx_bill_transactions_type ON bill_transactions(transaction_type);
CREATE INDEX idx_bill_transactions_flw_ref ON bill_transactions(flw_reference);
CREATE INDEX idx_bill_transactions_created_at ON bill_transactions(created_at DESC);
CREATE INDEX idx_bill_transactions_phone ON bill_transactions(phone_number);

-- network_providers indexes
CREATE INDEX idx_network_providers_code ON network_providers(code);
CREATE INDEX idx_network_providers_active ON network_providers(is_active);

-- data_bundles indexes
CREATE INDEX idx_data_bundles_network ON data_bundles(network_code);
CREATE INDEX idx_data_bundles_validity_type ON data_bundles(validity_type);
CREATE INDEX idx_data_bundles_active ON data_bundles(is_active);
CREATE INDEX idx_data_bundles_sort_order ON data_bundles(sort_order);
CREATE UNIQUE INDEX idx_data_bundles_network_code ON data_bundles(network_code, bundle_code);

-- bill_beneficiaries indexes
CREATE INDEX idx_bill_beneficiaries_user_id ON bill_beneficiaries(user_id);
CREATE INDEX idx_bill_beneficiaries_phone ON bill_beneficiaries(phone_number);
CREATE INDEX idx_bill_beneficiaries_network ON bill_beneficiaries(network_code);
CREATE UNIQUE INDEX idx_bill_beneficiaries_user_phone ON bill_beneficiaries(user_id, phone_number);

-- ==========================================
-- TRIGGERS FOR AUTO-UPDATE
-- ==========================================

-- Create trigger function (only once)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_network_providers_updated_at 
  BEFORE UPDATE ON network_providers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_data_bundles_updated_at 
  BEFORE UPDATE ON data_bundles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bill_transactions_updated_at 
  BEFORE UPDATE ON bill_transactions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bill_beneficiaries_updated_at 
  BEFORE UPDATE ON bill_beneficiaries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- SEED DATA
-- ==========================================

-- Verified biller codes from Flutterwave API (2026-03-11)
-- AIRTIME: BIL099 (MTN), BIL102 (GLO), BIL100 (Airtel), BIL103 (9Mobile)
-- DATA: BIL104 (MTN), BIL105 (GLO), BIL106 (Airtel), BIL107 (9Mobile)

INSERT INTO network_providers (name, code, flw_biller_code, supports_airtime, supports_data, min_airtime_amount, max_airtime_amount, is_active) VALUES
('MTN', 'mtn', 'BIL099', true, true, 50.00, 500000.00, true),
('GLO', 'glo', 'BIL102', true, true, 50.00, 500000.00, true),
('Airtel', 'airtel', 'BIL100', true, true, 50.00, 500000.00, true),
('9Mobile', '9mobile', 'BIL103', true, true, 50.00, 500000.00, true);
