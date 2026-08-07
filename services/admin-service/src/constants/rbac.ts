/**
 * All platform sections used in the RBAC permission matrix.
 * These map 1-to-1 with the admin dashboard sidebar sections.
 */
export const PLATFORM_SECTIONS = [
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
  'audit_sheet',
  'pricing',
  'notifications',
  'analytics',
  'system_roles',
  'email_notifications',
] as const;

export type PlatformSection = (typeof PLATFORM_SECTIONS)[number];
export type PermissionAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';

export interface SectionPermissions {
  section:    PlatformSection;
  can_view:   boolean;
  can_create: boolean;
  can_edit:   boolean;
  can_delete: boolean;
}

/**
 * Maps HTTP method to the required permission action.
 */
export function methodToAction(method: string): PermissionAction {
  switch (method.toUpperCase()) {
    case 'GET':    return 'can_view';
    case 'POST':   return 'can_create';
    case 'PUT':
    case 'PATCH':  return 'can_edit';
    case 'DELETE': return 'can_delete';
    default:       return 'can_view';
  }
}

/**
 * Maps an admin API route path to the platform section it belongs to.
 * Used by the RBAC middleware to look up the required permission.
 */
export function pathToSection(path: string): PlatformSection | null {
  if (path.includes('/rides'))                return 'rides';
  if (path.includes('/deliveries'))           return 'deliveries';
  if (path.includes('/food'))                 return 'food_orders';
  if (path.includes('/marketplace'))          return 'marketplace';
  if (path.includes('/hire'))                 return 'transport_hire';
  if (path.includes('/airtime'))              return 'airtime_data';
  if (path.includes('/drivers'))              return 'drivers';
  if (path.includes('/vendors'))              return 'vendors';
  if (path.includes('/users'))                return 'customers';
  if (path.includes('/administrators'))       return 'administrators';
  if (path.includes('/support'))              return 'support_moderation';
  if (path.includes('/payments') ||
      path.includes('/remittance'))           return 'payments_transactions';
  if (path.includes('/audit'))                return 'audit_sheet';
  if (path.includes('/pricing'))              return 'pricing';
  if (path.includes('/notifications') ||
      path.includes('/broadcast'))            return 'notifications';
  if (path.includes('/analytics'))            return 'analytics';
  if (path.includes('/system-roles'))         return 'system_roles';
  if (path.includes('/email-logs'))           return 'email_notifications';
  if (path.includes('/dashboard') ||
      path.includes('/health'))               return 'dashboard';
  return null;
}
