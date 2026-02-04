-- Check if admin users exist
SELECT id, email, roles, active_role, status, created_at 
FROM users 
WHERE 'admin' = ANY(roles) OR active_role = 'admin';