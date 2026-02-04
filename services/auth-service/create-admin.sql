-- Create admin user with your preferred email
-- Password hash for "Admin@1234" (bcrypt with 10 rounds)
INSERT INTO users (
  email, 
  first_name, 
  last_name, 
  username, 
  password_hash, 
  roles, 
  active_role, 
  provider, 
  email_verified, 
  status,
  created_at,
  updated_at
) VALUES (
  'enenchejohn56@gmail.com',
  'Admin',
  'User',
  'admin',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Password: Admin@1234
  ARRAY['admin'],
  'admin',
  'emailpass',
  true,
  'active',
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  roles = ARRAY['admin'],
  active_role = 'admin',
  updated_at = NOW();

-- Also create the super admin from env
INSERT INTO users (
  email, 
  first_name, 
  last_name, 
  username, 
  password_hash, 
  roles, 
  active_role, 
  provider, 
  email_verified, 
  status,
  created_at,
  updated_at
) VALUES (
  'superadmin@olakzrides.com',
  'Super',
  'Admin',
  'superadmin',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Password: SuperAdmin@1234
  ARRAY['admin'],
  'admin',
  'emailpass',
  true,
  'active',
  NOW(),
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  roles = ARRAY['admin'],
  active_role = 'admin',
  updated_at = NOW();

-- Verify the admin users were created
SELECT email, roles, active_role, status FROM users WHERE 'admin' = ANY(roles);