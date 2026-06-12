-- Migration: Introduce city_tier_states lookup table
-- Date: 2026-05-26
-- Replaces the redundant `states` JSONB column on ride_fare_config with a
-- normalised table. One row per (city_tier, state_name) — shared across all
-- vehicle categories that belong to that tier.

-- ─── 1. Create city_tier_states table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS city_tier_states (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  city_tier   VARCHAR(20) NOT NULL,   -- high | middle | low  (never 'national')
  state_name  VARCHAR(100) NOT NULL,  -- e.g. "Lagos", "FCT"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT city_tier_states_unique UNIQUE (city_tier, state_name),
  CONSTRAINT city_tier_states_tier_check CHECK (city_tier IN ('high', 'middle', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_city_tier_states_tier
  ON city_tier_states (city_tier);

CREATE INDEX IF NOT EXISTS idx_city_tier_states_state
  ON city_tier_states (state_name);

COMMENT ON TABLE city_tier_states IS
  'Maps Nigerian states to a city pricing tier (high/middle/low). '
  'A state can belong to at most one tier. States not listed here fall back to national pricing.';

-- ─── 2. Migrate existing data from ride_fare_config.states ───────────────────
-- Pull distinct (city_tier, state) pairs out of the JSONB arrays and insert them.
-- Uses jsonb_array_elements_text to expand the array.

INSERT INTO city_tier_states (city_tier, state_name)
SELECT DISTINCT
  rfc.city_tier,
  s.state_name
FROM ride_fare_config rfc,
     jsonb_array_elements_text(rfc.states) AS s(state_name)
WHERE rfc.city_tier <> 'national'
  AND rfc.states IS NOT NULL
  AND jsonb_array_length(rfc.states) > 0
ON CONFLICT (city_tier, state_name) DO NOTHING;

-- ─── 3. Drop the states column from ride_fare_config ─────────────────────────
-- It is now redundant — all state lookups go through city_tier_states.

ALTER TABLE ride_fare_config
DROP COLUMN IF EXISTS states;

-- ─── 4. Verify ───────────────────────────────────────────────────────────────

-- SELECT city_tier, COUNT(*) AS state_count
-- FROM city_tier_states
-- GROUP BY city_tier
-- ORDER BY city_tier;
