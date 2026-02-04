# Design Document: Driver Registration Improvements

## Overview

This design document outlines the implementation approach for improving the driver registration system to align with industry best practices and handle edge cases for different vehicle types. The design focuses on multi-role support, flexible identification requirements, and proper admin management.

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth Service  │    │ Core Logistics  │    │ Platform Service│
│                 │    │                 │    │                 │
│ - User Mgmt     │◄──►│ - Driver Reg    │◄──►│ - Admin Mgmt    │
│ - Role Mgmt     │    │ - Document Mgmt │    │ - Store Mgmt    │
│ - Super Admin   │    │ - Vehicle Types │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Database Schema Changes

#### User Role System Enhancement

```sql
-- Update users table to support multiple roles
ALTER TABLE users 
ADD COLUMN roles TEXT[] DEFAULT ARRAY['customer'],
ADD COLUMN active_role TEXT DEFAULT 'customer';

-- Migration for existing users
UPDATE users SET roles = ARRAY[role] WHERE roles IS NULL;
```

#### Super Admin Seeding

```sql
-- Super admin initialization during deployment
INSERT INTO users (id, email, password_hash, roles, active_role, email_verified, status)
VALUES (
  gen_random_uuid(),
  $SUPER_ADMIN_EMAIL,
  $HASHED_PASSWORD,
  ARRAY['admin'],
  'admin',
  true,
  'active'
) ON CONFLICT (email) DO NOTHING;
```

## Component Design

### 1. Super Admin Initialization

**Service**: `SuperAdminService` (Auth Service)

```typescript
interface SuperAdminConfig {
  email: string;
  password: string;
  skipIfExists: boolean;
}

class SuperAdminService {
  async initializeSuperAdmin(config: SuperAdminConfig): Promise<void>
  async checkSuperAdminExists(): Promise<boolean>
}
```

**Implementation Strategy**:
- Check environment variables on auth service startup
- Create super admin if none exists
- Use secure password hashing
- Log creation (without password) for audit

### 2. Multi-Role Support System

**Service**: `RoleManagementService` (Auth Service)

```typescript
interface UserRoles {
  userId: string;
  roles: string[];
  activeRole: string;
}

class RoleManagementService {
  async addRole(userId: string, role: string): Promise<void>
  async switchActiveRole(userId: string, role: string): Promise<void>
  async getUserRoles(userId: string): Promise<UserRoles>
  async validateRoleAccess(userId: string, requiredRole: string): Promise<boolean>
}
```

**Role Transition Rules**:
- Users start with `['customer']` role
- Driver registration adds `'driver'` to roles array
- Admin creation sets `['admin']` role
- Users cannot remove roles, only add them
- `activeRole` determines current permissions

### 3. Flexible Vehicle Identification

**Service**: `VehicleIdentificationService` (Core Logistics)

```typescript
interface IdentificationRequirements {
  vehicleType: string;
  requiresLicense: boolean;
  acceptedIdTypes: string[];
  minimumAge: number;
}

class VehicleIdentificationService {
  async getIdentificationRequirements(vehicleType: string): Promise<IdentificationRequirements>
  async validateIdentification(vehicleType: string, idData: any): Promise<ValidationResult>
}
```

**Vehicle Type Matrix**:
```typescript
const VEHICLE_REQUIREMENTS = {
  bicycle: {
    requiresLicense: false,
    acceptedIdTypes: ['national_id', 'passport'],
    minimumAge: 18
  },
  motorcycle: {
    requiresLicense: true,
    acceptedIdTypes: ['drivers_license'],
    minimumAge: 18
  },
  car: {
    requiresLicense: true,
    acceptedIdTypes: ['drivers_license'],
    minimumAge: 21
  }
  // ... other vehicle types
};
```

### 4. Admin Management System

**Service**: `AdminManagementService` (Platform Service)

```typescript
interface AdminCreationRequest {
  email: string;
  firstName: string;
  lastName: string;
  permissions?: string[];
}

class AdminManagementService {
  async createAdmin(request: AdminCreationRequest, createdBy: string): Promise<User>
  async listAdmins(): Promise<User[]>
  async deactivateAdmin(adminId: string, deactivatedBy: string): Promise<void>
}
```

## API Design

### Authentication & Role Management

```typescript
// Enhanced authentication middleware
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    activeRole: string;
  };
}

// Role-based access control
const requireRole = (role: string) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.roles.includes(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};
```

### Driver Registration Enhancements

```typescript
// POST /api/driver-registration/register/initiate
interface RegistrationRequest {
  vehicle_type: string;
  service_types: string[];
  identification_type?: 'drivers_license' | 'national_id' | 'passport';
}

// Enhanced validation based on vehicle type
const validateRegistrationRequest = (req: RegistrationRequest): ValidationResult => {
  const requirements = getVehicleRequirements(req.vehicle_type);
  
  if (requirements.requiresLicense && req.identification_type !== 'drivers_license') {
    return { isValid: false, error: 'Driver license required for this vehicle type' };
  }
  
  return { isValid: true };
};
```

### Admin Endpoints

```typescript
// POST /api/admin/users (Admin only)
interface CreateAdminRequest {
  email: string;
  firstName: string;
  lastName: string;
}

// GET /api/admin/driver-registrations (Admin only)
interface DriverRegistrationFilter {
  status?: 'pending' | 'approved' | 'rejected';
  vehicleType?: string;
  dateFrom?: string;
  dateTo?: string;
}
```

## Security Considerations

### Role-Based Access Control

1. **Middleware Enhancement**:
   - Update auth middleware to handle multiple roles
   - Implement role hierarchy (admin > driver > customer)
   - Add role switching validation

2. **Endpoint Protection**:
   - Admin endpoints require `admin` role
   - Driver endpoints require `driver` role
   - User can access endpoints for their active role

### Data Validation

1. **Vehicle-Specific Validation**:
   - Dynamic validation based on vehicle type
   - Age requirements per vehicle category
   - Document requirements per vehicle type

2. **Input Sanitization**:
   - Validate all user inputs
   - Sanitize file uploads
   - Prevent SQL injection and XSS

## Correctness Properties

### Property 1: Role Consistency
**Validates: Requirements 2.1, 2.2, 2.3**

```typescript
// Property: User roles array must always contain activeRole
property("user active role must be in roles array", (user: User) => {
  return user.roles.includes(user.activeRole);
});
```

### Property 2: Vehicle Type Validation
**Validates: Requirements 4.1, 4.2, 4.3**

```typescript
// Property: License requirements must match vehicle type
property("license requirements match vehicle type", (vehicleType: string, hasLicense: boolean) => {
  const requirements = getVehicleRequirements(vehicleType);
  if (requirements.requiresLicense) {
    return hasLicense === true;
  }
  return true; // License optional for this vehicle type
});
```

### Property 3: Admin Creation Authorization
**Validates: Requirements 6.1, 6.2, 6.3**

```typescript
// Property: Only admins can create other admins
property("only admins can create admins", (creatorRole: string, targetRole: string) => {
  if (targetRole === 'admin') {
    return creatorRole === 'admin';
  }
  return true; // Non-admin creation allowed for other roles
});
```

### Property 4: Age Requirements
**Validates: Requirements 4.4**

```typescript
// Property: Driver age must meet vehicle type requirements
property("driver age meets vehicle requirements", (vehicleType: string, driverAge: number) => {
  const requirements = getVehicleRequirements(vehicleType);
  return driverAge >= requirements.minimumAge;
});
```

### Property 5: Super Admin Uniqueness
**Validates: Requirements 1.1, 1.2**

```typescript
// Property: Only one super admin should exist per deployment
property("super admin uniqueness", (users: User[]) => {
  const superAdmins = users.filter(u => u.email === process.env.SUPER_ADMIN_EMAIL);
  return superAdmins.length <= 1;
});
```

## Implementation Strategy

### Phase 1: Core Role System
1. Update user schema for multiple roles
2. Implement RoleManagementService
3. Update authentication middleware
4. Add role switching endpoints

### Phase 2: Super Admin & Admin Management
1. Implement SuperAdminService
2. Add super admin initialization to startup
3. Create AdminManagementService
4. Add admin creation endpoints

### Phase 3: Vehicle Type Flexibility
1. Update vehicle type requirements matrix
2. Implement VehicleIdentificationService
3. Update registration validation logic
4. Add vehicle-specific form configurations

### Phase 4: Integration & Testing
1. Update all existing endpoints
2. Add comprehensive test suite
3. Update API documentation
4. Deploy with proper migrations

## Testing Strategy

### Unit Tests
- Role management functions
- Vehicle type validation logic
- Admin creation workflows
- Super admin initialization

### Integration Tests
- End-to-end registration flows
- Role switching scenarios
- Admin management workflows
- Multi-vehicle type registrations

### Property-Based Tests
- Role consistency properties
- Vehicle validation properties
- Age requirement properties
- Admin authorization properties

## Migration Plan

### Database Migrations
1. Add roles and active_role columns
2. Migrate existing single roles to arrays
3. Create super admin record
4. Update indexes for role queries

### Code Migrations
1. Update authentication middleware
2. Modify existing controllers
3. Add new service classes
4. Update API responses

### Deployment Strategy
1. Deploy database migrations first
2. Deploy auth service updates
3. Deploy core logistics updates
4. Deploy platform service updates
5. Verify super admin creation
6. Test role switching functionality

## Monitoring & Observability

### Metrics to Track
- Role switching frequency
- Admin creation events
- Registration completion rates by vehicle type
- Super admin login events

### Logging Requirements
- All role changes (audit trail)
- Admin creation/deactivation
- Super admin initialization
- Failed authorization attempts

### Alerts
- Multiple super admin creation attempts
- Unauthorized admin creation attempts
- High registration failure rates
- Suspicious role switching patterns