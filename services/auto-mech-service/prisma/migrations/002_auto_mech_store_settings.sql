-- Auto Mech Service — Store Settings Migration
-- Adds is_open, auto_accept_bookings, estimated_service_time_minutes to auto_mech_vendors

ALTER TABLE auto_mech_vendors
  ADD COLUMN IF NOT EXISTS is_open                        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_accept_bookings           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimated_service_time_minutes INTEGER NOT NULL DEFAULT 30;
