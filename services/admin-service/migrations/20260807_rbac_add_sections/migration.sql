-- ================================================================
-- Add wallet_transactions and email_notifications to the
-- allowed sections in admin_role_permissions.
--
-- The CHECK constraint on the section column must be updated
-- every time a new section is added to PLATFORM_SECTIONS.
-- ================================================================

-- 1. Drop the existing section check constraint
ALTER TABLE admin_role_permissions
  DROP CONSTRAINT IF EXISTS chk_valid_section;

-- 2. Re-add it with the full updated list
ALTER TABLE admin_role_permissions
  ADD CONSTRAINT chk_valid_section CHECK (section IN (
    'dashboard',
    'rides',
    'deliveries',
    'food_orders',
    'marketplace',
    'transport_hire',
    'airtime_data',
    'drivers',
    'vendors',
    'customers',
    'administrators',
    'support_moderation',
    'payments_transactions',
    'wallet_transactions',
    'audit_sheet',
    'pricing',
    'notifications',
    'analytics',
    'system_roles',
    'email_notifications'
  ));

-- 3. Also update the Full Admin Role seed to include the new sections
INSERT INTO admin_role_permissions (role_id, section, can_view, can_create, can_edit, can_delete)
SELECT
  '00000000-0000-0000-0000-000000000099',
  section,
  true, true, true, true
FROM unnest(ARRAY[
  'wallet_transactions',
  'email_notifications'
]) AS section
ON CONFLICT (role_id, section) DO NOTHING;
