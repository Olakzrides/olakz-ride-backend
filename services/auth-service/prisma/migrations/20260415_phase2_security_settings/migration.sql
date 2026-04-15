-- Phase 2: Security Settings
-- Adds biometric toggle, wallet PIN hash, and wallet PIN enabled flag to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wallet_pin_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wallet_pin_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wallet_pin_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_pin_locked_until TIMESTAMPTZ;
