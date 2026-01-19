# ✅ Ready to Test - Driver Registration Improvements

## 🎉 Implementation Status: COMPLETE

All code changes have been implemented and the database has been seeded successfully!

---

## ✅ What's Been Done

### 1. Database Migrations ✅
- Auth service: Multi-role support added
- Logistics service: Flexible identification added
- Both Prisma clients regenerated

### 2. Seed Script ✅
```
✅ Created super admin: superadmin@olakzrides.com
✅ Created test users:
   - Customer: customer@test.com
   - Rider (Customer + Driver): rider@test.com
   - Admin: admin@test.com
   - Password for all: Test@1234
```

### 3. Build Verification ✅
- Auth service builds successfully
- Logistics service builds successfully
- No TypeScript errors

---

## 🚀 Start Testing Now

### Step 1: Start All Services

Open 3 terminals:

**Terminal 1: Auth Service**
```bash
cd services/auth-service
npm run dev
```

**Terminal 2: Logistics Service**
```bash
cd services/core-logistics
npm run dev
```

**Terminal 3: Gateway**
```bash
cd gateway
npm run dev
```

---

### Step 2: Test with Postman

#### Test 1: Login as Customer (Check Multi-Role Response)

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "customer@test.com",
  "password": "Test@1234"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "customer@test.com",
      "roles": ["customer"],
      "activeRole": "customer"
    },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

✅ **Save the `accessToken` for next steps**

---

#### Test 2: Get Vehicle Types

```http
GET http://localhost:3000/api/variants
```

✅ **Copy a `vehicleTypeId` from the response**

---

#### Test 3: Register as Driver (Auto Role Assignment)

```http
POST http://localhost:3000/api/drivers/register
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "identificationType": "national_id",
  "identificationNumber": "TEST12345678",
  "licenseNumber": "DL123456",
  "vehicleTypeId": "PASTE_VEHICLE_TYPE_ID_HERE",
  "vehicle": {
    "plateNumber": "TEST123",
    "manufacturer": "Honda",
    "model": "Civic",
    "year": 2023,
    "color": "Black"
  }
}
```

**Expected Response:**
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

#### Test 4: Verify Role Was Added Automatically

```http
GET http://localhost:3000/api/users/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "roles": ["customer", "driver"],
    "activeRole": "customer"
  }
}
```

✅ **Verify `roles` now includes "driver"**

---

#### Test 5: Switch Active Role

```http
PUT http://localhost:3000/api/users/switch-role
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "activeRole": "driver"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "activeRole": "driver"
  }
}
```

---

#### Test 6: Upload Driver Documents

**⚠️ Important: This is a multipart/form-data request (file upload)**

```http
POST http://localhost:3000/api/drivers/documents
Authorization: Bearer DRIVER_ACCESS_TOKEN
Content-Type: multipart/form-data

Form Data:
- file: [Select a file - PDF, JPG, PNG]
- documentType: license
- expiryDate: 2025-12-31
```

**Valid Document Types:**
- `license` - Driver's license
- `insurance` - Vehicle insurance
- `vehicle_registration` - Vehicle registration
- `profile_photo` - Driver profile photo
- `vehicle_photo` - Vehicle photo

**Expected Response:**
```json
{
  "success": true,
  "message": "Document uploaded successfully. Awaiting verification.",
  "data": {
    "document": {
      "id": "uuid",
      "documentType": "license",
      "documentUrl": "https://supabase-url/storage/...",
      "fileName": "license.pdf",
      "status": "pending"
    }
  }
}
```

---

#### Test 7: Login as Admin

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@test.com",
  "password": "Test@1234"
}
```

✅ **Save the admin `accessToken`**

---

#### Test 7: Login as Admin

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@test.com",
  "password": "Test@1234"
}
```

✅ **Save the admin `accessToken`**

---

#### Test 8: Get All Drivers (Admin)

```http
GET http://localhost:3000/api/drivers?status=pending
Authorization: Bearer ADMIN_ACCESS_TOKEN
```

✅ **Copy the `driverId` from the response**

---

#### Test 9: Verify Document (Admin)

**⚠️ Important: Replace `DOCUMENT_ID` with actual document ID from Test 6**

```http
PUT http://localhost:3000/api/drivers/documents/ACTUAL_DOCUMENT_ID/verify
Authorization: Bearer ADMIN_ACCESS_TOKEN
Content-Type: application/json

{
  "status": "approved",
  "notes": "Document verified successfully"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Document approved successfully"
}
```

---

#### Test 10: Approve Driver (Admin)

**⚠️ Important: Replace `DRIVER_ID` with the actual UUID from Test 8 (without curly braces)**

```http
PUT http://localhost:3000/api/drivers/ACTUAL_DRIVER_ID_HERE/approve
Authorization: Bearer ADMIN_ACCESS_TOKEN
Content-Type: application/json

{
  "status": "approved"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Driver approved successfully"
}
```

---

#### Test 11: Go Online (Driver)
Authorization: Bearer ADMIN_ACCESS_TOKEN
Content-Type: application/json

{
  "status": "approved"
}
```

**Example with real ID:**
```http
PUT http://localhost:3000/api/drivers/572241a3-2eab-418b-b9ab-1e853991ab75/approve
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "approved"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Driver approved successfully"
}
```

---

#### Test 11: Go Online (Driver)

Switch back to the driver's access token:

```http
PUT http://localhost:3000/api/drivers/status
Authorization: Bearer DRIVER_ACCESS_TOKEN
Content-Type: application/json

{
  "isOnline": true,
  "isAvailable": true
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Status updated successfully"
}
```

---

### Step 3: Test Bicycle Driver (No License Required)

#### Test 12: Register Bicycle Driver

```http
POST http://localhost:3000/api/drivers/register
Authorization: Bearer ANOTHER_USER_ACCESS_TOKEN
Content-Type: application/json

{
  "identificationType": "national_id",
  "identificationNumber": "BICYCLE123",
  "vehicleTypeId": "BICYCLE_VEHICLE_TYPE_ID",
  "vehicle": {
    "plateNumber": "BIKE001",
    "manufacturer": "Trek",
    "model": "FX 3",
    "year": 2023,
    "color": "Blue"
  }
}
```

✅ **Notice: No `licenseNumber` required for bicycle!**

---

## 🎯 Success Criteria

- [x] Database migrations completed
- [x] Seed script ran successfully
- [x] Services build without errors
- [ ] Customer can login (sees roles array)
- [ ] Customer can register as driver
- [ ] Driver role is automatically added
- [ ] User can switch between roles
- [ ] Admin can approve drivers
- [ ] Approved driver can go online
- [ ] Bicycle driver can register without license

---

## 📊 Test Results Template

Use this to track your testing:

```
✅ Test 1: Login as customer - PASS/FAIL
✅ Test 2: Get vehicle types - PASS/FAIL
✅ Test 3: Register as driver - PASS/FAIL
✅ Test 4: Verify role added - PASS/FAIL
✅ Test 5: Switch active role - PASS/FAIL
✅ Test 6: Login as admin - PASS/FAIL
✅ Test 7: Get all drivers - PASS/FAIL
✅ Test 8: Approve driver - PASS/FAIL
✅ Test 9: Go online - PASS/FAIL
✅ Test 10: Bicycle driver - PASS/FAIL
```

---

## 🐛 Troubleshooting

### Services won't start?
```bash
# Check for errors
npm run build

# Check logs
# Look for error messages in terminal
```

### Role not added automatically?
- Check driver service logs for errors
- Verify `roles` column exists in users table
- Check Supabase logs

### Can't switch roles?
- Verify user has multiple roles assigned
- Check that activeRole is one of the assigned roles

### Admin can't approve?
- Verify admin user has `roles: ['admin']`
- Check authorization header is correct

---

## 📚 Documentation

- **API Reference:** `API_CHANGES_QUICK_REFERENCE.md`
- **Full Implementation:** `DRIVER_REGISTRATION_IMPROVEMENTS.md`
- **Migration Guide:** `MANUAL_MIGRATION_STEPS.md`
- **Quick Start:** `QUICK_START_IMPROVEMENTS.md`

---

## 🎉 You're All Set!

The driver registration improvements are fully implemented and ready for testing. Follow the test steps above and verify each feature works as expected.

**Key Features to Verify:**
1. ✅ Multi-role support (customer + driver)
2. ✅ Automatic role assignment on driver registration
3. ✅ Flexible identification (national ID, passport, license)
4. ✅ Optional license for bicycle/e-scooter
5. ✅ Role switching between customer and driver
6. ✅ Admin approval workflow

Happy testing! 🚀
