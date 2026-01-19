# API Changes - Quick Reference

## Auth Service Changes

### Modified Responses

#### POST /api/auth/login
**Before:**
```json
{
  "user": {
    "role": "customer"
  }
}
```

**After:**
```json
{
  "user": {
    "roles": ["customer"],
    "activeRole": "customer"
  }
}
```

#### GET /api/users/me
**Before:**
```json
{
  "role": "customer"
}
```

**After:**
```json
{
  "roles": ["customer", "driver"],
  "activeRole": "customer"
}
```

### New Endpoints

#### PUT /api/users/role/:userId (Admin Only)
Update user roles (admin only)

**Request:**
```json
{
  "roles": ["customer", "driver"],
  "activeRole": "driver"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "roles": ["customer", "driver"],
    "activeRole": "driver"
  }
}
```

#### PUT /api/users/switch-role
Switch between assigned roles

**Request:**
```json
{
  "activeRole": "driver"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "roles": ["customer", "driver"],
    "activeRole": "driver"
  }
}
```

---

## Logistics Service Changes

### Modified Endpoints

#### POST /api/drivers/register
**Before:**
```json
{
  "licenseNumber": "DL123456",
  "vehicleTypeId": "uuid",
  "vehicle": { ... }
}
```

**After:**
```json
{
  "identificationType": "national_id",
  "identificationNumber": "12345678",
  "licenseNumber": "DL123456",  // Optional for bicycle/e-scooter
  "vehicleTypeId": "uuid",
  "vehicle": { ... }
}
```

**Response:**
```json
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

## Complete Driver Registration Flow

### 1. Register as Customer
```bash
POST /api/auth/register
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "Password@123"
}
```

### 2. Verify Email
```bash
POST /api/auth/verify-email
{
  "email": "john@example.com",
  "otp": "1234"
}
```

### 3. Login
```bash
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "Password@123"
}

# Response includes:
{
  "user": {
    "roles": ["customer"],
    "activeRole": "customer"
  },
  "accessToken": "...",
  "refreshToken": "..."
}
```

### 4. Register as Driver (Role Auto-Assigned)
```bash
POST /api/drivers/register
Authorization: Bearer {accessToken}
{
  "identificationType": "national_id",
  "identificationNumber": "12345678",
  "licenseNumber": "DL123456",
  "vehicleTypeId": "uuid-from-seed",
  "vehicle": {
    "plateNumber": "ABC123",
    "manufacturer": "Honda",
    "model": "Civic",
    "year": 2023,
    "color": "Black"
  }
}

# System automatically adds 'driver' to user's roles
```

### 5. Check Updated Roles
```bash
GET /api/users/me
Authorization: Bearer {accessToken}

# Response:
{
  "roles": ["customer", "driver"],
  "activeRole": "customer"
}
```

### 6. Upload Documents
```bash
POST /api/drivers/documents
Authorization: Bearer {accessToken}
Content-Type: multipart/form-data

documentType: license
file: [file]
expiryDate: 2025-12-31
```

### 7. Admin Approves Driver
```bash
PUT /api/drivers/{driverId}/approve
Authorization: Bearer {adminAccessToken}
{
  "status": "approved"
}
```

### 8. Switch to Driver Mode
```bash
PUT /api/users/switch-role
Authorization: Bearer {accessToken}
{
  "activeRole": "driver"
}
```

### 9. Go Online
```bash
PUT /api/drivers/status
Authorization: Bearer {accessToken}
{
  "isOnline": true,
  "isAvailable": true
}
```

---

## Identification Types

### Valid Values
- `drivers_license` - Driver's license (required for car, motorcycle, truck, bus)
- `national_id` - National ID card (valid for all vehicle types)
- `passport` - International passport (valid for all vehicle types)

### Vehicle Type Requirements

| Vehicle Type | License Required | Valid Identification Types |
|--------------|------------------|----------------------------|
| bicycle      | No               | national_id, passport      |
| e-scooter    | No               | national_id, passport      |
| motorcycle   | Yes              | drivers_license            |
| car          | Yes              | drivers_license            |
| truck        | Yes              | drivers_license            |
| bus          | Yes              | drivers_license            |

---

## Error Responses

### Driver Already Registered
```json
{
  "success": false,
  "message": "Driver profile already exists for this user"
}
```

### Identification Already Used
```json
{
  "success": false,
  "message": "Identification number is already registered"
}
```

### Invalid Identification Type
```json
{
  "success": false,
  "message": "Invalid identification type. Must be one of: drivers_license, national_id, passport"
}
```

### Role Not Assigned
```json
{
  "success": false,
  "message": "You do not have this role assigned"
}
```

### Admin Only
```json
{
  "success": false,
  "message": "Only admins can update user roles",
  "statusCode": 403
}
```

---

## Testing with Postman

### Environment Variables
```
BASE_URL=http://localhost:3000
ACCESS_TOKEN={{accessToken}}
ADMIN_TOKEN={{adminAccessToken}}
```

### Test Sequence
1. Register → Verify → Login (save accessToken)
2. Register as driver (use accessToken)
3. Get user profile (verify roles array)
4. Switch role to driver
5. Upload documents
6. Login as admin (save adminAccessToken)
7. Approve driver (use adminAccessToken)
8. Switch back to driver
9. Go online

---

## Migration Impact

### Breaking Changes
- ❌ `PUT /api/users/role` (without userId) - Removed
- ⚠️ Response format changed for login and user endpoints (role → roles)

### Non-Breaking Changes
- ✅ New endpoints added
- ✅ Old `role` column kept for backward compatibility
- ✅ Driver registration accepts new fields (old fields still work)

### Recommended Updates
1. Update frontend to use `roles` array instead of `role`
2. Update role switching logic to use new endpoint
3. Update driver registration forms for flexible identification
4. Update admin panel to show roles array

---

## Quick Test Commands

```bash
# Login as customer
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@test.com","password":"Test@1234"}'

# Register as driver
curl -X POST http://localhost:3000/api/drivers/register \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identificationType":"national_id",
    "identificationNumber":"12345678",
    "vehicleTypeId":"GET_FROM_SEED",
    "vehicle":{
      "plateNumber":"ABC123",
      "manufacturer":"Honda",
      "model":"Civic",
      "year":2023,
      "color":"Black"
    }
  }'

# Check roles
curl -X GET http://localhost:3000/api/users/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# Switch role
curl -X PUT http://localhost:3000/api/users/switch-role \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"activeRole":"driver"}'
```
