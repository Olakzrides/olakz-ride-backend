-- ================================================================
-- RBAC System — Custom Admin Roles & Permissions
-- ================================================================

-- ----------------------------------------------------------------
-- 1. admin_system_roles
--    Super admin creates named roles (e.g. "Supporters", "Transportation Specialist")
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_system_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_by  UUID NOT NULL,               -- super admin user id
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_system_roles_name      ON admin_system_roles(name);
CREATE INDEX IF NOT EXISTS idx_admin_system_roles_is_active ON admin_system_roles(is_active);

-- ----------------------------------------------------------------
-- 2. admin_role_permissions
--    One row per section per role. Defines what a role can do.
--
--    Sections map to our actual admin dashboard sections:
--      dashboard, rides, deliveries, food_orders, marketplace,
--      transport_hire, airtime_data, drivers, vendors, customers,
--      administrators, support_moderation, payments_transactions,
--      audit_sheet, pricing, notifications, analytics, system_roles
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    UUID NOT NULL REFERENCES admin_system_roles(id) ON DELETE CASCADE,
  section    VARCHAR(50) NOT NULL,
  can_view   BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_edit   BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_role_section UNIQUE (role_id, section),

  CONSTRAINT chk_valid_section CHECK (section IN (
    'dashboard', 'rides', 'deliveries', 'food_orders', 'marketplace',
    'transport_hire', 'airtime_data', 'drivers', 'vendors', 'customers',
    'administrators', 'support_moderation', 'payments_transactions',
    'audit_sheet', 'pricing', 'notifications', 'analytics', 'system_roles'
  ))
);

CREATE INDEX IF NOT EXISTS idx_admin_role_permissions_role_id ON admin_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_role_permissions_section ON admin_role_permissions(section);

-- ----------------------------------------------------------------
-- 3. admin_user_roles
--    Links an admin user to their assigned system role.
--    One active role per admin at a time.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE,         -- one role per admin
  role_id     UUID NOT NULL REFERENCES admin_system_roles(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL,               -- super admin who assigned
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_roles_user_id ON admin_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_roles_role_id ON admin_user_roles(role_id);

-- ----------------------------------------------------------------
-- 4. Auto-update updated_at triggers
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_rbac_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_system_roles_updated_at ON admin_system_roles;
CREATE TRIGGER trg_admin_system_roles_updated_at
  BEFORE UPDATE ON admin_system_roles
  FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_admin_role_permissions_updated_at ON admin_role_permissions;
CREATE TRIGGER trg_admin_role_permissions_updated_at
  BEFORE UPDATE ON admin_role_permissions
  FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

DROP TRIGGER IF EXISTS trg_admin_user_roles_updated_at ON admin_user_roles;
CREATE TRIGGER trg_admin_user_roles_updated_at
  BEFORE UPDATE ON admin_user_roles
  FOR EACH ROW EXECUTE FUNCTION update_rbac_updated_at();

-- ----------------------------------------------------------------
-- 5. Seed a "Full Admin Role" that has all permissions enabled
--    so super admin always has a ready-made full-access role
-- ----------------------------------------------------------------
INSERT INTO admin_system_roles (id, name, description, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  'Full Admin Role',
  'Full access to all sections of the admin dashboard',
  '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (name) DO NOTHING;

INSERT INTO admin_role_permissions (role_id, section, can_view, can_create, can_edit, can_delete)
SELECT
  '00000000-0000-0000-0000-000000000099',
  section,
  true, true, true, true
FROM unnest(ARRAY[
  'dashboard', 'rides', 'deliveries', 'food_orders', 'marketplace',
  'transport_hire', 'airtime_data', 'drivers', 'vendors', 'customers',
  'administrators', 'support_moderation', 'payments_transactions',
  'audit_sheet', 'pricing', 'notifications', 'analytics', 'system_roles'
]) AS section
ON CONFLICT (role_id, section) DO NOTHING;
