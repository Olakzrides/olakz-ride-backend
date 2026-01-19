# Driver Registration Improvements - Implementation Summary

## Overview

This document summarizes the improvements made to the driver registration system to align with industry best practices (Uber, Lyft, Bolt) and handle edge cases for different vehicle types.

## Changes Implemented

### 1. Auth Service - Multi-Role Support

#### Schema Changes (`services/auth-service/prisma/schema.prisma`)
- **Changed:** `role` (string) → `roles` (string array)
- **Added:** `activeRole` field to track current active role
- **Default:** New users get `roles: ['customer']` and `activeRole: 'customer'`
- **Index:** Added index on `active_role` for performance

#### Seed Script (`services/auth-service/prisma/seed.ts`)
- **Added:** Super admin initialization from environment variables
- **Environment Variables:**
  - `SUPER_ADMIN_EMAIL` - Email for super admin account
  - `SUPER_ADMIN_PASSWORD` - Password for super admin account
- **Test Users Updated:**
  - Customer: `roles: ['customer']`
  - Rider: `roles: ['customer', 'driver']` (multi-role example)
  - Admin: `roles: ['admin']`

#### Service Layer (`services/auth-service/src/services/user.service.ts`)
- **New Methods:**
  - `updateRoles(userId, roles, activeRole)` - Admin only, update user roles
  - `addRole(userId, role)` - Add a role to user's roles array
  - `switchActiveRole(userId, activeRole)` - Switch between assigned roles
- **Updated Methods:**
  - `getUserById()` - Returns `roles` and `activeRole` instead of `role`
  - `formatUserData()` - Updated to include new fields

#### Controller Layer (`services/auth-service/src/controllers/user.controller.ts`)
- **Updated:** `updateRole()` - Now admin-only, requires admin role check
- **Added:** `switchActiveRole()` - Allows users to switch between their assigned roles

#### Routes (`services/auth-service/src/routes/user.routes.ts`)
- **Changed:** `PUT /api/users/role` → `PUT /api/users/role/:userId` (Admin only)
- **Added:** `PUT /api/users/switch-role` (User can switch their active role)

#### Validators (`services/auth-service/src/validators/user.validator.ts`)
- **Updated:** `updateRoleValidator` to accept `roles` array and optional `activeRole`
- **Removed:** Vehicle type validation (moved to driver registration)

#### Migration (`services/auth-service/prisma/migrations/20260115_multi_role_support/migration.sql`)
- Adds `roles` and `active_role` columns
- Migrates existing `role` data to `roles` array
- Creates index on `active_role`
- Keeps old `role` column temporarily for backward compatibility

---

### 2. Logistics Service - Flexible Driver Identification

#### Schema Changes (`services/core-logistics/prisma/schema.prisma`)
- **Added:** `identificationType` field (drivers_license, national_id, passport)
- **Added:** `identificationNumber` field (unique)
- **Changed:** `licenseNumber` from required to optional (for bicycle/e-scooter)
- **Unique Constraint:** Moved from `licenseNumber` to `identificationNumber`

#### Types (`services/core-logistics/src/types/index.ts`)
- **Updated:** `DriverRegistrationRequest` interface:
  ```typescript
  {
    identificationType: 'drivers_license' | 'national_id' | 'passport';
    identificationNumber: string;
    licenseNumber?: string; // Optional
    vehicleTypeId: string;
    vehicle: { ... }
  }
  ```
- **Updated:** `DriverProfileUpdateRequest` with new fields

#### Service Layer (`services/core-logistics/src/services/driver.service.ts`)
- **Updated:** `registerDriver()` method:
  - Validates `identificationNumber` uniqueness
  - Makes `licenseNumber` optional
  - Automatically adds 'driver' role to user via direct database update
- **Added:** `addDriverRoleToUser()` private method:
  - Checks if user already has driver role
  - Adds 'driver' to user's roles array
  - Updates user record in auth database

#### Controller Layer (`services/core-logistics/src/controllers/driver.controller.ts`)
- **Updated:** `registerDriver()` validation:
  - Requires `identificationType`, `identificationNumber`, `vehicleTypeId`
  - `licenseNumber` is optional
  - Validates identification type against allowed values
- **Updated:** `updateProfile()` to support new fields
- **Response Message:** Now includes "Driver role added automatically"

#### Migration (`services/core-logistics/prisma/migrations/20260115_flexible_driver_identification/migration.sql`)
- Adds `identification_type` and `identification_number` columns
- Migrates existing `license_number` to `identification_number`
- Makes `license_number` nullable
- Creates unique index on `identification_number`
- Drops unique constraint on `license_number`

---

## Vehicle Type Requirements Matrix

| Vehicle Type | License Required | Identification Required | Min Age |
|--------------|------------------|-------------------------|---------|
| Bicycle      | No               | Yes (any type)          | 18      |
| E-scooter    | No               | Yes (any type)          | 18      |
| Motorcycle   | Yes              | Yes (drivers_license)   | 18      |
| Car          | Yes              | Yes (drivers_license)   | 21      |
| Truck        | Yes              | Yes (drivers_license)   | 25      |
| Bus          | Yes              | Yes (drivers_license)   | 25      |

---

## Role Transition Flow

### New User Registration
1. User registers → Gets `roles: ['customer']`, `activeRole: 'customer'`
2. User can book rides as customer

### Driver Registration
1. Customer calls `POST /api/drivers/register`
2. System validates identification and vehicle details
3. System creates driver profile with `status: 'pending'`
4. **System automatically adds 'driver' to user's roles array**
5. User now has `roles: ['customer', 'driver']`
6. User can continue using customer features while awaiting approval
7. Admin approves driver → `status: 'approved'`
8. Driver can now go online and accept rides

### Role Switching
1. User with multiple roles can switch active role:
   ```
   PUT /api/users/switch-role
   { "activeRole": "driver" }
   ```
2. JWT tokens will reflect the active role
3. User can switch back to customer anytime

---

## API Changes

### Auth Service

#### Updated Endpoints

**PUT /api/users/role/:userId** (Admin Only - CHANGED)
```json
Request:
{
  "roles": ["customer", "driver"],
  "activeRole": "driver"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "roles": ["customer", "driver"],
    "activeRole": "driver",
    ...
  }
}
```

**PUT /api/users/switch-role** (NEW)
```json
Request:
{
  "activeRole": "driver"
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "roles": ["customer", "driver"],
    "activeRole": "driver",
    ...
  }
}
```

**GET /api/users/me** (Updated Response)
```json
Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "roles": ["customer", "driver"],
    "activeRole": "customer",
    ...
  }
}
```

### Logistics Service

#### Updated Endpoints

**POST /api/drivers/register** (Updated Request)
```json
Request:
{
  "identificationType": "national_id",
  "identificationNumber": "12345678",
  "licenseNumber": "DL123456", // Optional for bicycle/e-scooter
  "vehicleTypeId": "uuid",
  "vehicle": {
    "plateNumber": "ABC123",
    "manufacturer": "Honda",
    "model": "CBR",
    "year": 2023,
    "color": "Red"
  }
}

Response:
{
  "success": true,
  "message": "Driver registration successful. Driver role added automatically. Awaiting admin approval.",
  "data": {
    "driver": { ... },
    "vehicle": { ... }
  }
}
```

---

## Migration Steps

### 1. Auth Service Migration

```bash
cd services/auth-service

# Run migration SQL
psql $DATABASE_URL -f prisma/migrations/20260115_multi_role_support/migration.sql

# Or use Prisma
npx prisma migrate dev --name multi_role_support

# Run seed to create super admin
npm run seed
```

### 2. Logistics Service Migration

```bash
cd services/core-logistics

# Run migration SQL
psql $DATABASE_URL -f prisma/migrations/20260115_flexible_driver_identification/migration.sql

# Or use Prisma
npx prisma migrate dev --name flexible_driver_identification
```

### 3. Update Environment Variables

Add to `services/auth-service/.env`:
```env
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123!
```

---

## Testing Checklist

### Auth Service Tests

- [ ] Super admin is created on first seed
- [ ] New users get `roles: ['customer']` by default
- [ ] User can register and login successfully
- [ ] Login returns `roles` and `activeRole` in response
- [ ] Non-admin cannot call `PUT /api/users/role/:userId`
- [ ] Admin can update user roles
- [ ] User can switch between assigned roles
- [ ] User cannot switch to a role they don't have

### Logistics Service Tests

- [ ] Customer can register as driver without having driver role first
- [ ] Driver registration automatically adds 'driver' role
- [ ] Bicycle driver can register without license number
- [ ] Car driver registration requires license number
- [ ] Identification number must be unique
- [ ] Driver profile shows correct identification fields
- [ ] Admin can approve/reject drivers
- [ ] Approved driver can go online

### Integration Tests

- [ ] Complete flow: Register → Register as Driver → Admin Approval → Go Online
- [ ] User can book rides as customer and provide rides as driver
- [ ] Role switching works correctly
- [ ] JWT tokens reflect active role

---

## Backward Compatibility

### Auth Service
- Old `role` column is kept temporarily
- Existing code reading `role` will still work
- After verification, uncomment DROP statements in migration

### Logistics Service
- Old `license_number` column is kept
- Existing drivers will have their license migrated to identification
- New drivers can use flexible identification

---

## Security Considerations

1. **Role Changes:** Only admins can modify user roles via API
2. **Driver Registration:** Automatically adds driver role (no manual intervention needed)
3. **Super Admin:** Created from environment variables (not via API)
4. **Active Role:** Users can only switch to roles they have assigned
5. **Audit Trail:** All role changes are logged

---

## Future Enhancements

1. **Courier Role:** Add separate role for package/food delivery
2. **Role Permissions:** Implement fine-grained permissions per role
3. **Document Validation:** Auto-verify documents based on vehicle type
4. **Age Verification:** Enforce minimum age requirements per vehicle type
5. **License Validation:** Integrate with government APIs to verify licenses

---

## Notes

- **Driver Role:** For PASSENGER RIDES only (all vehicle types)
- **Courier Role (Future):** For PACKAGE/FOOD DELIVERY
- Users can have both driver and courier roles simultaneously
- Bicycle drivers provide bicycle rides, not deliveries
- Super admin should be created during deployment, not via registration

---

## Support

For issues or questions:
1. Check the requirements document: `.kiro/specs/driver-registration-improvements/requirements.md`
2. Review migration logs for any errors
3. Verify environment variables are set correctly
4. Check Supabase logs for database errors
