-- Fix vehicle_service_capabilities to match business rules:
--
--  ride     → car, bus, minibus
--  delivery → car, motorcycle, bicycle, truck, bus, minibus (all vehicles)
--
-- Changes from previous seed:
--   bus:       had ride only      → now ride + delivery
--   minibus:   had ride+delivery  → unchanged (already correct)
--   truck:     had delivery only  → unchanged
--   car:       had ride+delivery  → unchanged
--   motorcycle/bicycle: had delivery → unchanged

-- ---------------------------------------------------------------
-- 1. Ensure bus has BOTH 'ride' and 'delivery' capabilities
-- ---------------------------------------------------------------
INSERT INTO vehicle_service_capabilities (vehicle_type_id, service_type_id)
SELECT vt.id, st.id
FROM vehicle_types vt, service_types st
WHERE vt.name = 'bus'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. Ensure minibus has BOTH 'ride' and 'delivery' capabilities
-- ---------------------------------------------------------------
INSERT INTO vehicle_service_capabilities (vehicle_type_id, service_type_id)
SELECT vt.id, st.id
FROM vehicle_types vt, service_types st
WHERE vt.name = 'minibus'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Ensure car has BOTH 'ride' and 'delivery' capabilities
-- ---------------------------------------------------------------
INSERT INTO vehicle_service_capabilities (vehicle_type_id, service_type_id)
SELECT vt.id, st.id
FROM vehicle_types vt, service_types st
WHERE vt.name = 'car'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Ensure truck has 'delivery' capability
-- ---------------------------------------------------------------
INSERT INTO vehicle_service_capabilities (vehicle_type_id, service_type_id)
SELECT vt.id, st.id
FROM vehicle_types vt, service_types st
WHERE vt.name = 'truck' AND st.name = 'delivery'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 5. Ensure motorcycle has 'delivery' capability only
--    (remove 'ride' if it somehow exists)
-- ---------------------------------------------------------------
DELETE FROM vehicle_service_capabilities
WHERE vehicle_type_id = (SELECT id FROM vehicle_types WHERE name = 'motorcycle')
  AND service_type_id = (SELECT id FROM service_types WHERE name = 'ride');

INSERT INTO vehicle_service_capabilities (vehicle_type_id, service_type_id)
SELECT vt.id, st.id
FROM vehicle_types vt, service_types st
WHERE vt.name = 'motorcycle' AND st.name = 'delivery'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 6. Ensure bicycle has 'delivery' capability only
--    (remove 'ride' if it somehow exists)
-- ---------------------------------------------------------------
DELETE FROM vehicle_service_capabilities
WHERE vehicle_type_id = (SELECT id FROM vehicle_types WHERE name = 'bicycle')
  AND service_type_id = (SELECT id FROM service_types WHERE name = 'ride');

INSERT INTO vehicle_service_capabilities (vehicle_type_id, service_type_id)
SELECT vt.id, st.id
FROM vehicle_types vt, service_types st
WHERE vt.name = 'bicycle' AND st.name = 'delivery'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 7. Fix any existing drivers whose service_types contain 'ride'
--    but whose vehicle type is motorcycle or bicycle — reset to delivery only.
-- ---------------------------------------------------------------
UPDATE drivers d
SET service_types = ARRAY['delivery']::TEXT[],
    updated_at    = NOW()
FROM vehicle_types vt
WHERE d.vehicle_type_id = vt.id
  AND vt.name IN ('motorcycle', 'bicycle')
  AND 'ride' = ANY(d.service_types);

-- ---------------------------------------------------------------
-- 8. Ensure car/bus/minibus drivers with no service_types
--    get defaulted to their primary service (ride).
-- ---------------------------------------------------------------
UPDATE drivers d
SET service_types = ARRAY['ride']::TEXT[],
    updated_at    = NOW()
FROM vehicle_types vt
WHERE d.vehicle_type_id = vt.id
  AND vt.name IN ('car', 'bus', 'minibus')
  AND (d.service_types IS NULL OR array_length(d.service_types, 1) = 0);

-- ===============================================================
-- FIX: Sync can_do_deliveries with service_types
-- ===============================================================

-- ---------------------------------------------------------------
-- 9. Backfill can_do_deliveries for ALL existing drivers based
--    on their current service_types array.
--    true  → service_types contains 'delivery'
--    false → service_types does NOT contain 'delivery'
-- ---------------------------------------------------------------
UPDATE drivers
SET can_do_deliveries = ('delivery' = ANY(COALESCE(service_types, ARRAY[]::TEXT[]))),
    updated_at        = NOW();

-- ---------------------------------------------------------------
-- 10. Create a trigger so can_do_deliveries stays in sync
--     automatically whenever service_types is updated.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_can_do_deliveries()
RETURNS TRIGGER AS $$
BEGIN
  NEW.can_do_deliveries := ('delivery' = ANY(COALESCE(NEW.service_types, ARRAY[]::TEXT[])));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_can_do_deliveries ON drivers;

CREATE TRIGGER trg_sync_can_do_deliveries
BEFORE INSERT OR UPDATE OF service_types
ON drivers
FOR EACH ROW
EXECUTE FUNCTION sync_can_do_deliveries();
