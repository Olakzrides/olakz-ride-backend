# Testing Guide - OlakzRide Backend

**Quick reference for testing all implemented features**

---

## Prerequisites

### Services Running
```bash
# Gateway (Port 3000)
cd gateway && npm run dev

# Auth Service (Port 3003)
cd services/auth-service && npm run dev

# Core Logistics (Port 3001)
cd services/core-logistics && npm run dev
```

### Test Accounts

**Admin Account:**
- Email: `superadmin@olakzrides.com`
- Password: (from your .env)

**Test Driver:**
- Email: `johnenenche56@gmail.com`

---

## 1. Gateway Health Check

### Test Gateway is Running
```bash
# Gateway health
curl http://localhost:3000/health

# Gateway info
curl http://localhost:3000/
```

**Expected Response:**
```json
{
  "service": "API Gateway",
  "version": "1.0.0",
  "status": "running",
  "endpoints": {
    "auth": "/api/auth/*",
    "admin": "/api/admin/*",
    ...
  }
}
```

---

## 2. Authentication Flow

### Register New User
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123!@#",
  "full_name": "Test User",
  "phone_number": "+1234567890"
}
```

### Login
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "superadmin@olakzrides.com",
  "password": "your-password"
}
```

**Save the `accessToken` from response for subsequent requests.**

---

## 3. Driver Registration Flow

### Step 1: Get Vehicle Types
```bash
GET http://localhost:3000/api/driver-registration/vehicle-types
```

### Step 2: Start Registration
```bash
POST http://localhost:3000/api/driver-registration/start
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "vehicle_type": "motorcycle",
  "service_types": ["ride_hailing", "delivery"]
}
```

**Save the `sessionId` from response.**

### Step 3: Personal Info
```bash
POST http://localhost:3000/api/driver-registration/personal-info
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "session_id": "<session-id>",
  "date_of_birth": "1990-01-01",
  "address": "123 Main St",
  "city": "Lagos",
  "state": "Lagos",
  "postal_code": "100001",
  "country": "Nigeria",
  "emergency_contact_name": "John Doe",
  "emergency_contact_phone": "+2348012345678"
}
```

### Step 4: Vehicle Info
```bash
POST http://localhost:3000/api/driver-registration/vehicle-info
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "session_id": "<session-id>",
  "vehicle_make": "Honda",
  "vehicle_model": "CBR",
  "vehicle_year": 2020,
  "vehicle_color": "Red",
  "license_plate": "ABC123XY",
  "vehicle_registration_number": "REG123456"
}
```

### Step 5: Upload Documents
```bash
POST http://localhost:3000/api/driver-registration/upload-document
Authorization: Bearer <your-token>
Content-Type: multipart/form-data

session_id: <session-id>
document_type: drivers_license
file: <select-file>
```

**Repeat for each required document:**
- `drivers_license`
- `vehicle_registration`
- `vehicle_insurance`
- `profile_photo`

### Step 6: Complete Registration
```bash
POST http://localhost:3000/api/driver-registration/complete
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "session_id": "<session-id>"
}
```

**Expected Result:**
- ✅ Driver registration completed
- ✅ Admin notification email sent to all admins
- ✅ Driver status set to "pending_review"

---

## 4. Admin Operations

### Login as Admin
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "superadmin@olakzrides.com",
  "password": "your-password"
}
```

### Get All Pending Drivers
```bash
GET http://localhost:3000/api/admin/drivers?status=pending_review
Authorization: Bearer <admin-token>
```

### Get Driver Details
```bash
GET http://localhost:3000/api/admin/drivers/<driver-id>
Authorization: Bearer <admin-token>
```

**Response includes:**
- Driver information
- Vehicle details
- Documents with signed URLs
- Registration session details

### Approve Driver
```bash
POST http://localhost:3000/api/admin/drivers/<driver-id>/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "approve",
  "notes": "All documents verified. Welcome to OlakzRide!"
}
```

**Expected Result:**
- ✅ Driver status changed to "approved"
- ✅ Driver notification created in database
- ✅ Approval email sent to driver
- ✅ Email includes welcome message and next steps

### Reject Driver
```bash
POST http://localhost:3000/api/admin/drivers/<driver-id>/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "reject",
  "rejection_reason": "Invalid driver's license",
  "notes": "Please upload a clear photo of your valid driver's license."
}
```

**Expected Result:**
- ✅ Driver status changed to "rejected"
- ✅ Driver notification created in database
- ✅ Rejection email sent to driver
- ✅ Email includes rejection reason and reapplication guidance

---

## 5. Email Notification Testing

### Check Email Logs (Auth Service)

Look for these log entries in auth service console:

**Email Sent Successfully:**
```
[info]: Sending email via internal API: {
  to: "johnenenche56@gmail.com",
  subject: "🎉 Your OlakzRide Driver Application is Approved!"
}
[info]: Email sent successfully via API to johnenenche56@gmail.com
```

### Check Email Logs (Core Logistics)

Look for these log entries in core-logistics console:

**Admin Notification:**
```
[info]: Found admin emails: {
  count: 3,
  emails: ["admin1@example.com", "admin2@example.com", "admin3@example.com"]
}
[info]: Admin notifications sent: {
  successCount: 3,
  failCount: 0,
  totalAdmins: 3
}
```

**Driver Notification:**
```
[info]: Driver review email sent successfully: {
  driverId: "...",
  userId: "...",
  action: "approve",
  email: "johnenenche56@gmail.com"
}
```

---

## 6. Document Verification Testing

### Get All Pending Documents
```bash
GET http://localhost:3000/api/admin/documents?status=pending
Authorization: Bearer <admin-token>
```

### Get Document Details
```bash
GET http://localhost:3000/api/admin/documents/<document-id>
Authorization: Bearer <admin-token>
```

**Response includes:**
- Document metadata
- Signed URL for viewing (valid for 1 hour)
- Driver information
- Upload timestamp

### Approve Document
```bash
POST http://localhost:3000/api/admin/documents/<document-id>/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "approve",
  "notes": "Document verified successfully"
}
```

### Reject Document
```bash
POST http://localhost:3000/api/admin/documents/<document-id>/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "reject",
  "rejection_reason": "Document is blurry and unreadable",
  "notes": "Please upload a clear, high-resolution photo"
}
```

---

## 7. Ride Booking Testing

### Get Fare Estimate
```bash
POST http://localhost:3000/api/ride/estimate
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "pickup_location": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoff_location": {
    "latitude": 6.4541,
    "longitude": 3.3947,
    "address": "Lekki Phase 1, Lagos"
  },
  "variant_id": "<variant-id>"
}
```

### Book Ride
```bash
POST http://localhost:3000/api/ride/book
Authorization: Bearer <user-token>
Content-Type: application/json

{
  "pickup_location": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoff_location": {
    "latitude": 6.4541,
    "longitude": 3.3947,
    "address": "Lekki Phase 1, Lagos"
  },
  "variant_id": "<variant-id>",
  "payment_method": "cash"
}
```

### Get Ride Details
```bash
GET http://localhost:3000/api/ride/<ride-id>
Authorization: Bearer <user-token>
```

---

## 8. Variants Testing

### Get All Variants
```bash
GET http://localhost:3000/api/variants
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "OlakzRide Standard",
      "description": "Affordable rides for everyone",
      "base_fare": 500,
      "per_km_rate": 100,
      "per_minute_rate": 10,
      "minimum_fare": 500,
      "vehicle_types": ["motorcycle", "car"],
      "service_types": ["ride_hailing"]
    }
  ]
}
```

---

## 9. Error Testing

### Test Invalid Token
```bash
GET http://localhost:3000/api/admin/drivers
Authorization: Bearer invalid-token
```

**Expected:** 401 Unauthorized

### Test Missing Required Fields
```bash
POST http://localhost:3000/api/driver-registration/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "vehicle_type": "motorcycle"
  // Missing service_types
}
```

**Expected:** 400 Bad Request with validation error

### Test Service Unavailable
```bash
# Stop auth service
# Then try to login
POST http://localhost:3000/api/auth/login
```

**Expected:** 503 Service Unavailable

---

## 10. Rate Limiting Testing

### Test Auth Rate Limit
```bash
# Send 6 login requests within 15 minutes
# 6th request should be rate limited
```

**Expected:** 429 Too Many Requests

---

## Common Issues & Solutions

### Issue: "Service Unavailable"
**Solution:** Ensure all services are running (gateway, auth, core-logistics)

### Issue: "Invalid token"
**Solution:** Login again to get a fresh token

### Issue: "Email not sent"
**Solution:** Check ZeptoMail API configuration in auth service .env

### Issue: "File upload failed"
**Solution:** Check Supabase storage configuration and bucket permissions

### Issue: "Admin routes not found"
**Solution:** Ensure gateway is running and admin routes are configured

---

## Postman Collection

### Import These Endpoints

1. Create a new Postman collection
2. Add environment variables:
   - `base_url`: `http://localhost:3000`
   - `admin_token`: (get from admin login)
   - `user_token`: (get from user login)
   - `session_id`: (get from registration start)
   - `driver_id`: (get from admin drivers list)

3. Import all endpoints from this guide

---

## Monitoring Logs

### Gateway Logs
```bash
cd gateway
npm run dev
# Watch for proxy requests and errors
```

### Auth Service Logs
```bash
cd services/auth-service
npm run dev
# Watch for email sending and authentication
```

### Core Logistics Logs
```bash
cd services/core-logistics
npm run dev
# Watch for driver registration and admin operations
```

---

## Success Criteria

### ✅ All Tests Pass When:

1. **Authentication:**
   - ✅ Users can register and login
   - ✅ Tokens are generated correctly
   - ✅ Protected routes require authentication

2. **Driver Registration:**
   - ✅ Multi-step registration completes successfully
   - ✅ Documents upload correctly
   - ✅ Admin notification email sent

3. **Admin Operations:**
   - ✅ Admin can view pending drivers
   - ✅ Admin can approve/reject drivers
   - ✅ Driver notification email sent

4. **Email Notifications:**
   - ✅ Approval emails delivered
   - ✅ Rejection emails delivered
   - ✅ Admin notifications delivered

5. **Gateway:**
   - ✅ All routes accessible through gateway
   - ✅ Direct service access blocked (in production)
   - ✅ Error handling works correctly

---

**Last Updated:** February 7, 2026  
**For Support:** Check logs or contact development team
