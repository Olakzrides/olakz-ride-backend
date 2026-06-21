-- Add device fingerprint + IP columns to pending_registrations.
-- phone was added ad-hoc; this migration formalises it alongside the fraud signals.

-- phone: E.164 normalised number stored at registration time
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- device_id: ANDROID_ID on Android, identifierForVendor on iOS.
-- Sent by the mobile app in the X-Device-ID request header.
-- Used as a hard fraud gate — one promo claim per device per campaign.
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS device_id TEXT;

-- ip_address: soft signal only — stored for forensics, not used as a hard block
-- because many users share IPs (mobile carriers, NAT, shared WiFi).
ALTER TABLE pending_registrations
  ADD COLUMN IF NOT EXISTS ip_address INET;

-- Index device_id for fast fraud lookups against promo_signup_claims
CREATE INDEX IF NOT EXISTS idx_pending_reg_device_id
  ON pending_registrations (device_id)
  WHERE device_id IS NOT NULL;
