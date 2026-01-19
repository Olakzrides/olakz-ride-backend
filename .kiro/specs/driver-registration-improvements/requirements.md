# Requirements Document: Driver Registration Improvements

## Introduction

Improvements to the driver registration system to align with industry best practices (Uber, Lyft, Bolt) and handle edge cases for different vehicle types.

## Glossary

- **User**: A person with an account in the system
- **Customer**: A user who can book rides (default role)
- **Driver**: A user who can provide PASSENGER RIDES using any vehicle type (requires approval)
- **Courier**: (Future) A user who can provide PACKAGE/FOOD DELIVERY (separate role, separate service)
- **Admin**: A user who can manage the platform
- **Super Admin**: The initial admin created during deployment
- **Vehicle Type**: Category of vehicle (bicycle, motorcycle, car, truck, bus)
- **Ride**: Passenger transportation service
- **Delivery**: Package/food transportation service (future feature)

## Requirements

### Requirement 1: Super Admin Initialization

**User Story:** As a platform owner, I want a super admin account created automatically during deployment, so that I can manage the platform without manual database manipulation.

#### Acceptance Criteria

1. WHEN the auth service starts for the first time, THE System SHALL check if a super admin exists
2. IF no super admin exists, THE System SHALL create one using environment variables
3. THE System SHALL use SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD from environment
4. THE Super Admin SHALL have role='admin', emailVerified=true, status='active'
5. THE System SHALL log the super admin creation (without password)

### Requirement 2: Multi-Role Support

**User Story:** As a user, I want to be both a customer and a driver simultaneously, so that I can book rides and provide rides with the same account.

**Note:** Driver role is for PASSENGER RIDES only. Future courier role will handle deliveries.

#### Acceptance Criteria

1. THE User SHALL have an array of roles instead of a single role
2. THE User SHALL have an activeRole field to track current mode
3. WHEN a user registers, THE System SHALL assign roles=['customer'] by default
4. WHEN a user registers as a driver, THE System SHALL add 'driver' to their roles array
5. THE System SHALL NOT remove existing roles when adding new ones
6. THE Driver role SHALL be for passenger transportation only (not deliveries)

### Requirement 3: Automatic Role Assignment on Driver Registration

**User Story:** As a user, I want to become a driver by registering as one, so that I don't have to manually change my role first.

#### Acceptance Criteria

1. WHEN a user calls POST /api/drivers/register, THE System SHALL automatically add 'driver' to their roles
2. THE System SHALL NOT require the user to have 'driver' role before registration
3. IF the user already has a driver profile, THE System SHALL reject the request
4. THE Driver profile SHALL be created with status='pending'
5. THE User SHALL be able to use customer features while driver approval is pending

### Requirement 4: Flexible Identification for Different Vehicle Types

**User Story:** As a bicycle driver, I want to register without a driver's license, so that I can provide bicycle rides.

**Note:** Bicycle drivers provide PASSENGER RIDES on bicycles (like Uber bicycle rides), not deliveries.

#### Acceptance Criteria

1. THE Driver registration SHALL accept identificationType (drivers_license, national_id, passport)
2. THE Driver registration SHALL require identificationNumber for all vehicle types
3. WHEN vehicleType is bicycle or e-scooter, THE System SHALL NOT require licenseNumber
4. WHEN vehicleType is car, motorcycle, truck, or bus, THE System SHALL require licenseNumber
5. THE Document upload SHALL support different document types based on vehicle type
6. THE Driver SHALL provide PASSENGER RIDES regardless of vehicle type

### Requirement 5: Remove Manual Role Change Endpoint

**User Story:** As a platform owner, I want to prevent users from manually changing roles, so that role assignment follows proper workflows.

#### Acceptance Criteria

1. THE System SHALL remove or restrict the PUT /api/users/role endpoint
2. THE Endpoint SHALL only be accessible to admins
3. WHEN a non-admin tries to change roles, THE System SHALL return 403 Forbidden
4. THE System SHALL log all role changes for audit purposes

### Requirement 6: Admin Management

**User Story:** As a super admin, I want to create additional admin accounts, so that I can delegate platform management.

#### Acceptance Criteria

1. THE System SHALL provide POST /api/admin/users endpoint (admin only)
2. WHEN a super admin creates an admin, THE System SHALL set role=['admin']
3. THE System SHALL send invitation email to new admins
4. THE System SHALL log all admin creation actions
5. ONLY users with role='admin' SHALL access admin endpoints

## Document Format

### Vehicle Type Requirements Matrix

| Vehicle Type | License Required | Insurance Required | Registration Required | Min Age |
|--------------|------------------|--------------------|-----------------------|---------|
| Bicycle      | No               | No                 | No                    | 18      |
| E-scooter    | No               | No                 | No                    | 18      |
| Motorcycle   | Yes (Motorcycle) | Yes                | Yes                   | 18      |
| Car          | Yes (Car)        | Yes                | Yes                   | 21      |
| Truck        | Yes (Commercial) | Yes                | Yes                   | 25      |
| Bus          | Yes (Commercial) | Yes                | Yes                   | 25      |

### Role Transition Matrix

| From Role  | To Role(s)        | Method                    | Approval Required |
|------------|-------------------|---------------------------|-------------------|
| -          | customer          | Registration              | No                |
| customer   | customer, driver  | Driver Registration       | Yes               |
| customer   | customer, admin   | Admin Creation (by admin) | No                |
| driver     | driver            | Cannot remove             | N/A               |
| admin      | admin             | Cannot remove             | N/A               |

## Notes

- Users can have multiple roles: `roles: ['customer', 'driver']`
- Users switch between roles using `activeRole` field
- Driver registration automatically adds driver role
- Super admin is seeded, not registered
- License requirements vary by vehicle type
- **Driver role is for PASSENGER RIDES only** (all vehicle types)
- **Courier role (future)** will handle PACKAGE/FOOD DELIVERY
- A user can be both driver AND courier (future feature)
- Bicycle drivers provide bicycle rides, not deliveries
