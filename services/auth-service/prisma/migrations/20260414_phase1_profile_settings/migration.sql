-- Phase 1: Profile Settings
-- Adds notification preference and language preference to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
