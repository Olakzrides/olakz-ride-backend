-- Seed the default Lagos region row used by the delivery service.
-- The UUID 00000000-0000-0000-0000-000000000001 is hardcoded in
-- DeliveryService.DEFAULT_REGION_ID and in the delivery tables migration.
-- Without this row, resolveCityTier falls back to 'low' for all Lagos deliveries.
--
-- Run this once in your Supabase SQL editor:

INSERT INTO regions (id, name, currency_code, country_code, is_active, metadata)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Lagos',
  'NGN',
  'NG',
  true,
  '{}'
)
ON CONFLICT (id) DO UPDATE
  SET name         = EXCLUDED.name,
      currency_code = EXCLUDED.currency_code,
      country_code  = EXCLUDED.country_code,
      is_active     = EXCLUDED.is_active;
