-- ─────────────────────────────────────────────────────────────────────────────
-- Vendor Promo Feature Migration
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Vendor promo campaigns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_promos (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner (vendor user_id — same user who manages orders)
  vendor_id           uuid          NOT NULL,   -- references users.id (vendor's user_id)

  -- Store binding — exactly ONE of these is set depending on service_type
  restaurant_id       uuid,                     -- food_restaurants.id (food vendors)
  store_id            uuid,                     -- marketplace_stores.id (marketplace vendors)
  service_type        text          NOT NULL CHECK (service_type IN ('food', 'marketplace')),

  -- Promo config
  code                text          NOT NULL,   -- stored UPPER-CASE — matching is case-insensitive
  discount_percent    numeric(5,2)  NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  max_discount_amount numeric(10,2),            -- optional cap: max ₦X off even if % > cap
  min_order_amount    numeric(10,2) NOT NULL DEFAULT 0, -- minimum subtotal to use code

  -- Usage limits
  total_uses_limit    integer,                  -- null = unlimited
  per_user_limit      integer       NOT NULL DEFAULT 1,
  uses_count          integer       NOT NULL DEFAULT 0,

  -- Lifecycle — status IS the single source of truth
  -- scheduled: created, waiting for starts_at
  -- active:    running — awarding discounts
  -- paused:    vendor temporarily stopped it
  -- ended:     past ends_at OR vendor force-ended it
  status              text          NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'active', 'paused', 'ended')),
  -- Date window — auto-activates on starts_at
  starts_at           timestamptz   NOT NULL,
  ends_at             timestamptz   NOT NULL,

  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT vendor_promos_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT vendor_promos_store_xor   CHECK (
    (service_type = 'food'        AND restaurant_id IS NOT NULL AND store_id IS NULL) OR
    (service_type = 'marketplace' AND store_id       IS NOT NULL AND restaurant_id IS NULL)
  )
);

-- Code uniqueness is per store (same code can exist across different stores/vendors)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_promos_code_restaurant
  ON vendor_promos (UPPER(code), restaurant_id)
  WHERE restaurant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_promos_code_store
  ON vendor_promos (UPPER(code), store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_promos_vendor_id     ON vendor_promos (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_promos_restaurant_id ON vendor_promos (restaurant_id) WHERE restaurant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_promos_store_id      ON vendor_promos (store_id)      WHERE store_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_promos_status_dates  ON vendor_promos (status, starts_at, ends_at);


-- ── 2. Usage tracking (per user, per promo, per order) ────────────────────────
CREATE TABLE IF NOT EXISTS vendor_promo_uses (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id        uuid          NOT NULL REFERENCES vendor_promos(id) ON DELETE CASCADE,
  user_id         uuid          NOT NULL,
  order_id        text          NOT NULL,   -- food_orders.id or marketplace_orders.id
  service_type    text          NOT NULL CHECK (service_type IN ('food', 'marketplace')),
  discount_amount numeric(10,2) NOT NULL,
  used_at         timestamptz   NOT NULL DEFAULT now(),

  -- Idempotency: one use per (promo, order)
  CONSTRAINT vendor_promo_uses_order_unique UNIQUE (promo_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_promo_uses_promo_id ON vendor_promo_uses (promo_id);
CREATE INDEX IF NOT EXISTS idx_vendor_promo_uses_user_id  ON vendor_promo_uses (user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_promo_uses_order_id ON vendor_promo_uses (order_id);


-- ── 3. Add promo columns to food_orders ───────────────────────────────────────
ALTER TABLE food_orders
  ADD COLUMN IF NOT EXISTS promo_id        uuid,
  ADD COLUMN IF NOT EXISTS promo_code      text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS original_total  numeric(10,2);   -- pre-discount total for vendor payout reference


-- ── 4. Add promo columns to marketplace_orders ────────────────────────────────
ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS promo_id        uuid,
  ADD COLUMN IF NOT EXISTS promo_code      text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS original_total  numeric(10,2);   -- pre-discount total for vendor payout reference


-- ── 5. Atomic increment RPC (avoids race conditions on uses_count) ────────────
CREATE OR REPLACE FUNCTION increment_vendor_promo_uses(promo_id_param uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE vendor_promos
  SET    uses_count = uses_count + 1,
         updated_at = now()
  WHERE  id = promo_id_param;
$$;


-- ── 6. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE vendor_promos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_promo_uses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_vendor_promos"
    ON vendor_promos FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access_vendor_promo_uses"
    ON vendor_promo_uses FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
