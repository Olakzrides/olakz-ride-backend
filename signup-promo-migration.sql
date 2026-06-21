-- ─────────────────────────────────────────────────────────────────────────────
-- Signup Promo Feature Migration
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Signup promo campaigns (admin-configured) ─────────────────────────────
CREATE TABLE IF NOT EXISTS signup_promos (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text          NOT NULL,
  promo_amount      numeric(10,2) NOT NULL CHECK (promo_amount > 0),
  total_budget_cap  numeric(12,2) NOT NULL CHECK (total_budget_cap > 0),
  claims_count      integer       NOT NULL DEFAULT 0,
  is_active         boolean       NOT NULL DEFAULT false,
  starts_at         timestamptz   NOT NULL,
  ends_at           timestamptz   NOT NULL,
  created_by        uuid          NOT NULL,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT signup_promos_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT signup_promos_budget_check CHECK (total_budget_cap >= promo_amount)
);

-- Only one promo can be active at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_promos_one_active
  ON signup_promos (is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_signup_promos_active ON signup_promos (is_active);
CREATE INDEX IF NOT EXISTS idx_signup_promos_dates  ON signup_promos (starts_at, ends_at);

-- ── 2. Promo claim fingerprints (fraud prevention) ────────────────────────────
CREATE TABLE IF NOT EXISTS promo_signup_claims (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id    uuid        NOT NULL REFERENCES signup_promos(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL,
  phone_hash  text        NOT NULL,   -- SHA-256 of normalised E.164 phone
  device_id   text,                   -- from X-Device-ID header (mobile app)
  ip_address  inet,                   -- soft signal only, not a hard block
  amount      numeric(10,2) NOT NULL,
  claimed_at  timestamptz NOT NULL DEFAULT now(),

  -- One claim per user per promo
  CONSTRAINT promo_signup_claims_user_promo_unique UNIQUE (promo_id, user_id),
  -- One claim per phone per promo
  CONSTRAINT promo_signup_claims_phone_promo_unique UNIQUE (promo_id, phone_hash)
);

CREATE INDEX IF NOT EXISTS idx_promo_claims_promo_id  ON promo_signup_claims (promo_id);
CREATE INDEX IF NOT EXISTS idx_promo_claims_user_id   ON promo_signup_claims (user_id);
CREATE INDEX IF NOT EXISTS idx_promo_claims_phone     ON promo_signup_claims (phone_hash);
CREATE INDEX IF NOT EXISTS idx_promo_claims_device    ON promo_signup_claims (device_id) WHERE device_id IS NOT NULL;

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE signup_promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_signup_claims ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_signup_promos"
    ON signup_promos FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_promo_signup_claims"
    ON promo_signup_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
