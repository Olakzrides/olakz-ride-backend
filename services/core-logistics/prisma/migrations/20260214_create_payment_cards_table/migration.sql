-- Create payment_cards table for storing tokenized card information
CREATE TABLE IF NOT EXISTS payment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  card_token VARCHAR(255) NOT NULL UNIQUE,
  authorization_code VARCHAR(255),
  card_last4 VARCHAR(4) NOT NULL,
  card_brand VARCHAR(20) NOT NULL,
  card_type VARCHAR(20),
  card_exp_month VARCHAR(2) NOT NULL,
  card_exp_year VARCHAR(4) NOT NULL,
  cardholder_name VARCHAR(100),
  bank_name VARCHAR(100),
  country_code VARCHAR(2),
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  provider VARCHAR(20) DEFAULT 'flutterwave',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_cards_user_id ON payment_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_cards_default ON payment_cards(user_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_payment_cards_active ON payment_cards(user_id, is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE payment_cards IS 'Stores tokenized payment card information from Flutterwave';
COMMENT ON COLUMN payment_cards.card_token IS 'Flutterwave card token for charging';
COMMENT ON COLUMN payment_cards.authorization_code IS 'Flutterwave authorization code for recurring charges';
COMMENT ON COLUMN payment_cards.is_default IS 'Whether this is the users default payment card';
COMMENT ON COLUMN payment_cards.provider IS 'Payment provider: flutterwave, paystack, stripe';
