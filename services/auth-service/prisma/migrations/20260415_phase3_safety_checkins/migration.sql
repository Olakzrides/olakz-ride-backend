-- Phase 3: Safety Check-ins
-- Adds emergency contact and alert timer fields to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alert_timer_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_timer_minutes INTEGER DEFAULT 6;
