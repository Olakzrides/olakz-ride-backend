-- ================================================================
-- Enforce one-tier-per-state at the DB level.
--
-- The current constraint is UNIQUE(city_tier, state_name) which
-- allows the same state to appear in multiple tiers:
--   (high,   Lagos)
--   (middle, Lagos)   ← both rows valid under old constraint
--
-- We need UNIQUE(state_name) — a state can only be in ONE tier.
-- This ensures resolveCityTierForState always returns exactly one row.
-- ================================================================

-- 1. Clean up any existing duplicate state assignments
--    Keep only the most recently inserted row per state
--    (highest city_tier alphabetically: 'high' > 'middle' — keeps high when both exist)
DELETE FROM city_tier_states
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY state_name
             ORDER BY
               CASE city_tier
                 WHEN 'high'   THEN 1
                 WHEN 'middle' THEN 2
                 WHEN 'low'    THEN 3
               END ASC,
               id ASC
           ) AS rn
    FROM city_tier_states
  ) ranked
  WHERE rn > 1
);

-- 2. Drop the old compound unique constraint
ALTER TABLE city_tier_states
  DROP CONSTRAINT IF EXISTS city_tier_states_city_tier_state_name_key;

-- 3. Drop any other unique constraint on the same columns
DROP INDEX IF EXISTS city_tier_states_city_tier_state_name_idx;

-- 4. Add the new constraint: one tier per state
ALTER TABLE city_tier_states
  ADD CONSTRAINT uq_city_tier_states_state_name UNIQUE (state_name);

-- Re-add index for fast lookups by city_tier (for listing all states in a tier)
CREATE INDEX IF NOT EXISTS idx_city_tier_states_city_tier ON city_tier_states(city_tier);

COMMENT ON CONSTRAINT uq_city_tier_states_state_name ON city_tier_states IS
  'Each Nigerian state can only belong to one city tier at a time.';
