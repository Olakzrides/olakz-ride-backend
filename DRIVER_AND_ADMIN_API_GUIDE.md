# OlakzRide Driver & Admin API Integration Guide

**Version:** 1.0.0  
**Last Updated:** February 7, 2026  
**Base URL:** `https://olakzride.duckdns.org`  
**Environment:** Production

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Driver Registration Flow](#driver-registration-flow)
4. [Driver Management APIs](#driver-management-apis)
5. [Admin Driver Review APIs](#admin-driver-review-apis)
6. [Admin Document Review APIs](#admin-document-review-apis)
7. [Error Handling](#error-handling)
8. [Status Codes](#status-codes)
9. [Testing Guide](#testing-guide)

---

## Overview

This document provides comprehensive API documentation for integrating the OlakzRide driver registration and admin review systems into your frontend applications.

### Key Features

- **Multi-step Driver Registration**: Guided registration process with validation
- **Document Upload & Verification**: Secure document handling with OCR processing
- **Admin Review System**: Complete driver and document review workflow
- **Real-time Status Updates**: Track registration progress
- **Email Notifications**: Automated notifications for drivers and admins

### API Architecture

```
Frontend → Gateway (Port 3000) → Backend Services
```

All requests must go through the gateway at `https://olakzride.duckdns.org`

---

## Authentication

### Overview

All authenticated endpoints require a JWT token in the Authorization header.

### Headers Required

```http
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

### Getting Authentication Token

Use the auth endpoints to register/login and obtain tokens:

```http
POST /api/auth/login
POST /api/auth/register
```

See the main API documentation for complete auth flow.

---

## Driver Registration Flow

The driver registration is a **multi-step process** that must be completed in order:

### Registration Steps

1. **Get Vehicle Types** (Public - No Auth)
2. **Initiate Registration** (Authenticated)
3. **Submit Personal Info** (Authenticated)
4. **Submit Vehicle Details** (Authenticated)
5. **Upload Documents** (Authenticated)
6. **Submit for Review** (Authenticated)

### Flow Diagram

```
Start → Get Vehicle Types → Initiate Registration → Personal Info → 
Vehicle Details → Upload Documents → Submit → Admin Review → Approved/Rejected
```

---

## API Endpoints - Driver Registration

### 1. Get Vehicle Types

**Endpoint:** `GET /api/driver-registration/vehicle-types`  
**Authentication:** Not Required (Public)  
**Description:** Get all available vehicle types and their service capabilities

#### Request

```http
GET https://olakzride.duckdns.org/api/driver-registration/vehicle-types
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "vehicle_types": [
      {
        "id": "uuid",
        "name": "Motorcycle",
        "description": "Two-wheeled vehicle for quick deliveries",
        "available_services": ["ride_hailing", "delivery", "food_delivery"],
        "icon_url": "https://...",
        "requirements": {
          "license_required": true,
          "insurance_required": true,
          "registration_required": true
        }
      },
      {
        "id": "uuid",
        "name": "Car",
        "description": "Four-wheeled vehicle for passenger transport",
        "available_services": ["ride_hailing", "delivery"],
        "icon_url": "https://...",
        "requirements": {
          "license_required": true,
          "insurance_required": true,
          "registration_required": true
        }
      }
    ]
  }
}
```

#### Vehicle Types Available

- `motorcycle` - Motorcycles and scooters
- `car` - Standard cars
- `van` - Vans and small trucks
- `truck` - Large trucks
- `bicycle` - Bicycles

#### Service Types Available

- `ride_hailing` - Passenger transport
- `delivery` - Package delivery
- `food_delivery` - Food delivery
- `courier` - Document courier

---

### 2. Get Vehicle Form Configuration

**Endpoint:** `GET /api/driver-registration/vehicle-types/:vehicleType/form-config`  
**Authentication:** Not Required (Public)  
**Description:** Get vehicle-specific form fields and validation rules

#### Request

```http
GET https://olakzride.duckdns.org/api/driver-registration/vehicle-types/motorcycle/form-config
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "vehicle_type": "motorcycle",
    "required_fields": [
      "vehicle_make",
      "vehicle_model",
      "vehicle_year",
      "license_plate",
      "vehicle_color"
    ],
    "optional_fields": [
      "vehicle_registration_number",
      "engine_capacity"
    ],
    "validation_rules": {
      "vehicle_year": {
        "min": 2010,
        "max": 2026
      },
      "license_plate": {
        "pattern": "^[A-Z0-9]{6,10}$"
      }
    }
  }
}
```

---

### 3. Initiate Registration

**Endpoint:** `POST /api/driver-registration/register/initiate`  
**Authentication:** Required  
**Description:** Start a new driver registration session

#### Request

```http
POST https://olakzride.duckdns.org/api/driver-registration/register/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "vehicle_type": "motorcycle",
  "service_types": ["ride_hailing", "delivery"]
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vehicle_type | string | Yes | Vehicle type (motorcycle, car, van, truck, bicycle) |
| service_types | array | Yes | Array of service types to offer |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "personal_info",
    "progress_percentage": 25,
    "expires_at": "2026-02-08T10:00:00Z",
    "next_action": {
      "step": "personal_info",
      "endpoint": "/api/driver-registration/register/{registration_id}/personal-info",
      "method": "POST"
    }
  }
}
```

#### Error Responses

**400 - Invalid Vehicle/Service Combination**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_VEHICLE_SERVICE_COMBINATION",
    "message": "Selected services are not available for this vehicle type",
    "details": {
      "vehicle_type": "bicycle",
      "invalid_services": ["ride_hailing"],
      "allowed_services": ["delivery", "food_delivery"]
    }
  }
}
```

**409 - Session Already Exists**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_ALREADY_EXISTS",
    "message": "You already have an active registration session"
  }
}
```

---

### 4. Submit Personal Information

**Endpoint:** `POST /api/driver-registration/register/:id/personal-info`  
**Authentication:** Required  
**Description:** Submit driver's personal information

#### Request

```http
POST https://olakzride.duckdns.org/api/driver-registration/register/{registration_id}/personal-info
Authorization: Bearer <token>
Content-Type: application/json

{
  "full_name": "John Doe",
  "date_of_birth": "1990-01-15",
  "phone_number": "+2348012345678",
  "address": "123 Main Street",
  "city": "Lagos",
  "state": "Lagos",
  "postal_code": "100001",
  "country": "Nigeria",
  "emergency_contact_name": "Jane Doe",
  "emergency_contact_phone": "+2348087654321"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| full_name | string | Yes | Driver's full name |
| date_of_birth | string | Yes | Date of birth (YYYY-MM-DD) |
| phone_number | string | Yes | Phone number with country code |
| address | string | Yes | Street address |
| city | string | Yes | City |
| state | string | Yes | State/Province |
| postal_code | string | Yes | Postal/ZIP code |
| country | string | Yes | Country |
| emergency_contact_name | string | Yes | Emergency contact name |
| emergency_contact_phone | string | Yes | Emergency contact phone |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/{registration_id}/vehicle-details",
      "method": "POST"
    }
  }
}
```

#### Error Responses

**400 - Validation Error**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "errors": [
      {
        "field": "date_of_birth",
        "code": "AGE_REQUIREMENT_NOT_MET",
        "message": "Driver must be at least 18 years old",
        "value": "2010-01-15"
      }
    ]
  }
}
```

**404 - Session Not Found**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Registration session not found"
  }
}
```

**410 - Session Expired**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Registration session has expired. Please start a new registration."
  }
}
```

---

### 5. Submit Vehicle Details

**Endpoint:** `POST /api/driver-registration/register/:id/vehicle-details`  
**Authentication:** Required  
**Description:** Submit vehicle information

#### Request

```http
POST https://olakzride.duckdns.org/api/driver-registration/register/{registration_id}/vehicle-details
Authorization: Bearer <token>
Content-Type: application/json

{
  "vehicle_make": "Honda",
  "vehicle_model": "CBR 150",
  "vehicle_year": 2022,
  "vehicle_color": "Red",
  "license_plate": "ABC123XY",
  "vehicle_registration_number": "REG123456789",
  "engine_capacity": "150cc"
}
```

#### Request Body (Motorcycle)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vehicle_make | string | Yes | Vehicle manufacturer |
| vehicle_model | string | Yes | Vehicle model |
| vehicle_year | number | Yes | Year of manufacture (2010-2026) |
| vehicle_color | string | Yes | Vehicle color |
| license_plate | string | Yes | License plate number |
| vehicle_registration_number | string | No | Registration number |
| engine_capacity | string | No | Engine size (e.g., "150cc") |

#### Request Body (Car/Van/Truck)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vehicle_make | string | Yes | Vehicle manufacturer |
| vehicle_model | string | Yes | Vehicle model |
| vehicle_year | number | Yes | Year of manufacture |
| vehicle_color | string | Yes | Vehicle color |
| license_plate | string | Yes | License plate number |
| vehicle_registration_number | string | Yes | Registration number |
| vin_number | string | No | Vehicle Identification Number |
| seating_capacity | number | Yes (Car) | Number of seats |
| cargo_capacity | string | Yes (Van/Truck) | Cargo capacity |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "documents",
    "progress_percentage": 75,
    "document_requirements": {
      "required_documents": [
        {
          "type": "drivers_license",
          "name": "Driver's License",
          "description": "Valid driver's license",
          "required": true
        },
        {
          "type": "vehicle_registration",
          "name": "Vehicle Registration",
          "description": "Vehicle registration certificate",
          "required": true
        },
        {
          "type": "vehicle_insurance",
          "name": "Vehicle Insurance",
          "description": "Valid insurance certificate",
          "required": true
        },
        {
          "type": "profile_photo",
          "name": "Profile Photo",
          "description": "Clear photo of driver",
          "required": true
        }
      ]
    },
    "next_action": {
      "step": "documents",
      "endpoint": "/api/driver-registration/register/{registration_id}/documents",
      "method": "POST"
    }
  }
}
```

---

### 6. Upload Documents

**Endpoint:** `POST /api/driver-registration/register/:id/documents`  
**Authentication:** Required  
**Content-Type:** `multipart/form-data`  
**Description:** Upload required documents (supports multiple files)

#### Request

```http
POST https://olakzride.duckdns.org/api/driver-registration/register/{registration_id}/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- documents: [File] (multiple files)
- documentTypes: ["drivers_license", "vehicle_registration", "vehicle_insurance", "profile_photo"]
```

#### Request Format (Form Data)

**Option 1: Multiple files with documentTypes array**
```javascript
const formData = new FormData();
formData.append('documents', driversLicenseFile);
formData.append('documents', vehicleRegistrationFile);
formData.append('documents', insuranceFile);
formData.append('documents', profilePhotoFile);
formData.append('documentTypes', JSON.stringify([
  'drivers_license',
  'vehicle_registration',
  'vehicle_insurance',
  'profile_photo'
]));
```

**Option 2: Named fields**
```javascript
const formData = new FormData();
formData.append('drivers_license', driversLicenseFile);
formData.append('vehicle_registration', vehicleRegistrationFile);
formData.append('vehicle_insurance', insuranceFile);
formData.append('profile_photo', profilePhotoFile);
```

#### Document Types

| Type | Description | Required |
|------|-------------|----------|
| drivers_license | Driver's license | Yes |
| vehicle_registration | Vehicle registration certificate | Yes |
| vehicle_insurance | Insurance certificate | Yes |
| profile_photo | Driver's profile photo | Yes |
| vehicle_photo | Photo of vehicle | No |
| national_id | National ID card | No |
| passport | Passport | No |

#### File Requirements

- **Max file size:** 10MB per file
- **Max files:** 10 files per request
- **Accepted formats:** JPG, JPEG, PNG, PDF
- **Recommended:** Clear, high-resolution images

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "review",
    "progress_percentage": 90,
    "documents_uploaded": 4,
    "message": "All documents uploaded successfully",
    "documents": [
      {
        "id": "doc-uuid-1",
        "type": "drivers_license",
        "fileName": "license.jpg",
        "fileSize": 2048576,
        "mimeType": "image/jpeg",
        "url": "https://...signed-url...",
        "status": "pending",
        "uploadedAt": "2026-02-07T10:00:00Z",
        "expiresAt": "2026-02-08T10:00:00Z"
      },
      {
        "id": "doc-uuid-2",
        "type": "vehicle_registration",
        "fileName": "registration.pdf",
        "fileSize": 1024000,
        "mimeType": "application/pdf",
        "url": "https://...signed-url...",
        "status": "pending",
        "uploadedAt": "2026-02-07T10:00:00Z",
        "expiresAt": "2026-02-08T10:00:00Z"
      }
    ],
    "next_action": {
      "step": "review",
      "endpoint": "/api/driver-registration/register/{registration_id}/submit",
      "method": "POST"
    }
  }
}
```

#### Error Responses

**400 - No Files**
```json
{
  "success": false,
  "error": {
    "code": "REQUIRED_FIELD_MISSING",
    "message": "At least one document file is required",
    "field": "files"
  }
}
```

**400 - File Too Large**
```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_UPLOAD_FAILED",
    "message": "File size exceeds maximum allowed size of 10MB",
    "field": "documents"
  }
}
```

**400 - Invalid File Type**
```json
{
  "success": false,
  "error": {
    "code": "DOCUMENT_UPLOAD_FAILED",
    "message": "Invalid file type. Accepted formats: JPG, JPEG, PNG, PDF",
    "field": "documents"
  }
}
```

---

### 7. Submit Registration for Review

**Endpoint:** `POST /api/driver-registration/register/:id/submit`  
**Authentication:** Required  
**Description:** Submit completed registration for admin review

#### Request

```http
POST https://olakzride.duckdns.org/api/driver-registration/register/{registration_id}/submit
Authorization: Bearer <token>
Content-Type: application/json
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "driver_id": "driver-uuid",
    "status": "completed",
    "current_step": "review",
    "progress_percentage": 100,
    "submitted_at": "2026-02-07T10:00:00Z",
    "driver_status": "pending_review",
    "message": "Registration submitted successfully. Your driver application is now pending admin review."
  }
}
```

#### What Happens Next

1. **Admin Notification**: All admins receive an email notification
2. **Status**: Driver status set to `pending_review`
3. **Review**: Admin reviews application and documents
4. **Decision**: Admin approves or rejects application
5. **Driver Notification**: Driver receives email with decision

#### Error Responses

**400 - Incomplete Steps**
```json
{
  "success": false,
  "error": {
    "code": "PREVIOUS_STEP_INCOMPLETE",
    "message": "Complete all steps before submission: documents",
    "field": "steps",
    "details": {
      "missing_steps": ["documents"]
    }
  }
}
```

---

### 8. Get Registration Status

**Endpoint:** `GET /api/driver-registration/register/:id/status`  
**Authentication:** Required  
**Description:** Check registration progress and status

#### Request

```http
GET https://olakzride.duckdns.org/api/driver-registration/register/{registration_id}/status
Authorization: Bearer <token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "vehicle_type": "motorcycle",
    "service_types": ["ride_hailing", "delivery"],
    "created_at": "2026-02-07T09:00:00Z",
    "expires_at": "2026-02-08T09:00:00Z",
    "is_expired": false,
    "personal_info_completed_at": "2026-02-07T09:30:00Z",
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/{registration_id}/vehicle-details",
      "method": "POST"
    }
  }
}
```

#### Status Values

| Status | Description |
|--------|-------------|
| in_progress | Registration in progress |
| completed | Registration submitted for review |
| expired | Session expired (24 hours) |

---

### 9. Resume Registration

**Endpoint:** `POST /api/driver-registration/register/resume`  
**Authentication:** Required  
**Description:** Resume an incomplete registration session

#### Request

```http
POST https://olakzride.duckdns.org/api/driver-registration/register/resume
Authorization: Bearer <token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "documents",
    "progress_percentage": 75,
    "vehicle_type": "motorcycle",
    "service_types": ["ride_hailing"],
    "next_action": {
      "step": "documents",
      "endpoint": "/api/driver-registration/register/{registration_id}/documents",
      "method": "POST"
    }
  }
}
```

---

## Admin Driver Review APIs

### Overview

Admin endpoints for reviewing and managing driver applications. All endpoints require admin authentication.

### Admin Authentication

Admins must have the `admin` role in their JWT token:

```json
{
  "id": "admin-uuid",
  "email": "admin@olakzrides.com",
  "roles": ["admin"]
}
```

---

### 1. Get Pending Driver Applications

**Endpoint:** `GET /api/admin/drivers/pending`  
**Authentication:** Admin Required  
**Description:** Get all pending driver applications

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/drivers/pending?page=1&limit=20
Authorization: Bearer <admin-token>
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number |
| limit | number | No | 20 | Items per page |

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Pending driver applications retrieved successfully",
  "data": {
    "drivers": [
      {
        "id": "driver-uuid",
        "user_id": "user-uuid",
        "full_name": "John Doe",
        "email": "john@example.com",
        "phone_number": "+2348012345678",
        "vehicle_type": "motorcycle",
        "service_types": ["ride_hailing", "delivery"],
        "status": "pending_review",
        "created_at": "2026-02-07T10:00:00Z",
        "documents_count": 4,
        "registration_id": "session-uuid"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 2. Get Driver Application Details

**Endpoint:** `GET /api/admin/drivers/:driverId`  
**Authentication:** Admin Required  
**Description:** Get complete driver application details for review

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/drivers/{driver-id}
Authorization: Bearer <admin-token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Driver application details retrieved successfully",
  "data": {
    "driver": {
      "id": "driver-uuid",
      "user_id": "user-uuid",
      "full_name": "John Doe",
      "email": "john@example.com",
      "phone_number": "+2348012345678",
      "date_of_birth": "1990-01-15",
      "address": "123 Main Street",
      "city": "Lagos",
      "state": "Lagos",
      "country": "Nigeria",
      "emergency_contact_name": "Jane Doe",
      "emergency_contact_phone": "+2348087654321",
      "vehicle_type": "motorcycle",
      "service_types": ["ride_hailing", "delivery"],
      "status": "pending_review",
      "created_at": "2026-02-07T10:00:00Z",
      "vehicle_details": {
        "vehicle_make": "Honda",
        "vehicle_model": "CBR 150",
        "vehicle_year": 2022,
        "vehicle_color": "Red",
        "license_plate": "ABC123XY",
        "vehicle_registration_number": "REG123456789"
      },
      "documents": [
        {
          "id": "doc-uuid-1",
          "document_type": "drivers_license",
          "file_name": "license.jpg",
          "file_size": 2048576,
          "mime_type": "image/jpeg",
          "status": "pending",
          "uploaded_at": "2026-02-07T10:00:00Z",
          "signedUrl": "https://...signed-url-valid-24hrs...",
          "signedUrlError": null
        },
        {
          "id": "doc-uuid-2",
          "document_type": "vehicle_registration",
          "file_name": "registration.pdf",
          "file_size": 1024000,
          "mime_type": "application/pdf",
          "status": "pending",
          "uploaded_at": "2026-02-07T10:00:00Z",
          "signedUrl": "https://...signed-url-valid-24hrs...",
          "signedUrlError": null
        }
      ],
      "registration_session": {
        "id": "session-uuid",
        "status": "completed",
        "submitted_at": "2026-02-07T10:30:00Z"
      }
    },
    "document_summary": {
      "total": 4,
      "accessible": 4,
      "missing": 0
    }
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

#### Document Signed URLs

- **Valid for:** 24 hours
- **Purpose:** Secure document viewing
- **Error handling:** If file is missing, `signedUrlError` will contain error message

---

### 3. Review Driver Application

**Endpoint:** `POST /api/admin/drivers/:driverId/review`  
**Authentication:** Admin Required  
**Description:** Approve or reject a driver application

#### Request (Approve)

```http
POST https://olakzride.duckdns.org/api/admin/drivers/{driver-id}/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "approve",
  "notes": "All documents verified. Welcome to OlakzRide!"
}
```

#### Request (Reject)

```http
POST https://olakzride.duckdns.org/api/admin/drivers/{driver-id}/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "reject",
  "rejection_reason": "Invalid driver's license",
  "notes": "Please upload a clear photo of your valid driver's license and reapply."
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | "approve" or "reject" |
| notes | string | No | Additional notes for driver |
| rejection_reason | string | Yes (if reject) | Reason for rejection |

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Driver application approved successfully",
  "data": {
    "driverId": "driver-uuid",
    "action": "approve",
    "reviewedBy": "admin-uuid"
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

#### What Happens After Review

**On Approval:**
1. Driver status changed to `approved`
2. Driver notification created in database
3. Approval email sent to driver
4. Driver can now start accepting rides

**On Rejection:**
1. Driver status changed to `rejected`
2. Driver notification created in database
3. Rejection email sent to driver with reason
4. Driver can reapply after addressing issues

#### Error Responses

**400 - Invalid Action**
```json
{
  "success": false,
  "error": {
    "message": "Invalid review action. Must be 'approve' or 'reject'",
    "code": "INVALID_REVIEW_ACTION"
  }
}
```

**400 - Missing Rejection Reason**
```json
{
  "success": false,
  "error": {
    "message": "Rejection reason is required for reject action",
    "code": "REJECTION_REASON_REQUIRED"
  }
}
```

---

### 4. Get Driver Review Statistics

**Endpoint:** `GET /api/admin/drivers/statistics`  
**Authentication:** Admin Required  
**Description:** Get driver review statistics

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/drivers/statistics?reviewerId=admin-uuid
Authorization: Bearer <admin-token>
```

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| reviewerId | string | No | Filter by specific reviewer |

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Driver review statistics retrieved successfully",
  "data": {
    "statistics": {
      "total_pending": 45,
      "total_approved": 120,
      "total_rejected": 15,
      "pending_this_week": 12,
      "approved_this_week": 8,
      "rejected_this_week": 2,
      "average_review_time_hours": 4.5
    }
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 5. Bulk Approve Drivers

**Endpoint:** `POST /api/admin/drivers/bulk-approve`  
**Authentication:** Admin Required  
**Description:** Approve multiple driver applications at once

#### Request

```http
POST https://olakzride.duckdns.org/api/admin/drivers/bulk-approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "driverIds": [
    "driver-uuid-1",
    "driver-uuid-2",
    "driver-uuid-3"
  ],
  "notes": "Bulk approval - all documents verified"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| driverIds | array | Yes | Array of driver IDs to approve |
| notes | string | No | Notes for all drivers |

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Bulk approval completed",
  "data": {
    "result": {
      "successful": 3,
      "failed": 0,
      "errors": []
    },
    "totalProcessed": 3
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 6. Search Drivers

**Endpoint:** `GET /api/admin/drivers/search`  
**Authentication:** Admin Required  
**Description:** Search driver applications (placeholder for future implementation)

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/drivers/search?page=1&limit=20
Authorization: Bearer <admin-token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Driver search completed",
  "data": {
    "drivers": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "pages": 0
    },
    "message": "Advanced search feature will be implemented in next iteration"
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

## Admin Document Review APIs

### Overview

Admin endpoints for reviewing individual documents. Useful for granular document verification.

---

### 1. Get Pending Documents

**Endpoint:** `GET /api/admin/documents/pending`  
**Authentication:** Admin Required  
**Description:** Get all pending documents for review

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/documents/pending?page=1&limit=20&priority=high
Authorization: Bearer <admin-token>
```

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number |
| limit | number | No | 20 | Items per page |
| priority | string | No | all | Filter by priority (high, medium, low) |

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Pending documents retrieved successfully",
  "data": {
    "documents": [
      {
        "id": "doc-uuid",
        "document_type": "drivers_license",
        "file_name": "license.jpg",
        "driver_name": "John Doe",
        "driver_id": "driver-uuid",
        "status": "pending",
        "uploaded_at": "2026-02-07T10:00:00Z",
        "priority": "high"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 35,
      "pages": 2
    }
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 2. Get Document Details

**Endpoint:** `GET /api/admin/documents/:documentId`  
**Authentication:** Admin Required  
**Description:** Get document details with secure viewing URL

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/documents/{document-id}
Authorization: Bearer <admin-token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Document details retrieved successfully",
  "data": {
    "document": {
      "id": "doc-uuid",
      "document_type": "drivers_license",
      "file_name": "license.jpg",
      "file_size": 2048576,
      "mime_type": "image/jpeg",
      "status": "pending",
      "uploaded_at": "2026-02-07T10:00:00Z",
      "driver": {
        "id": "driver-uuid",
        "full_name": "John Doe",
        "email": "john@example.com"
      },
      "signedUrl": "https://...signed-url-valid-24hrs...",
      "signedUrlError": null
    }
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 3. Review Document

**Endpoint:** `POST /api/admin/documents/:documentId/review`  
**Authentication:** Admin Required  
**Description:** Approve, reject, or request replacement for a document

#### Request (Approve)

```http
POST https://olakzride.duckdns.org/api/admin/documents/{document-id}/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "approve",
  "notes": "Document verified successfully"
}
```

#### Request (Reject)

```http
POST https://olakzride.duckdns.org/api/admin/documents/{document-id}/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "reject",
  "rejection_reason": "Document is blurry and unreadable",
  "notes": "Please upload a clear, high-resolution photo"
}
```

#### Request (Request Replacement)

```http
POST https://olakzride.duckdns.org/api/admin/documents/{document-id}/review
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "action": "request_replacement",
  "rejection_reason": "Document has expired",
  "notes": "Please upload a valid, non-expired document",
  "priority": "high"
}
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | "approve", "reject", or "request_replacement" |
| notes | string | No | Additional notes |
| rejection_reason | string | Yes (if reject) | Reason for rejection |
| priority | string | No | Priority level (high, medium, low) |

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Document approved successfully",
  "data": {
    "documentId": "doc-uuid",
    "action": "approve",
    "reviewedBy": "admin-uuid"
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 4. Get Document Review Statistics

**Endpoint:** `GET /api/admin/documents/statistics`  
**Authentication:** Admin Required  
**Description:** Get document review statistics

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/documents/statistics?reviewerId=admin-uuid
Authorization: Bearer <admin-token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Review statistics retrieved successfully",
  "data": {
    "statistics": {
      "total_pending": 35,
      "total_approved": 450,
      "total_rejected": 25,
      "pending_high_priority": 10,
      "reviewed_today": 15,
      "average_review_time_minutes": 5.2
    }
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 5. Get Document Versions

**Endpoint:** `GET /api/admin/documents/:documentId/versions`  
**Authentication:** Admin Required  
**Description:** Get document version history

#### Request

```http
GET https://olakzride.duckdns.org/api/admin/documents/{document-id}/versions
Authorization: Bearer <admin-token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Document versions retrieved successfully",
  "data": {
    "versions": [
      {
        "id": "version-uuid-1",
        "version_number": 2,
        "file_name": "license_v2.jpg",
        "uploaded_at": "2026-02-07T12:00:00Z",
        "status": "pending"
      },
      {
        "id": "version-uuid-2",
        "version_number": 1,
        "file_name": "license_v1.jpg",
        "uploaded_at": "2026-02-07T10:00:00Z",
        "status": "rejected",
        "rejection_reason": "Document expired"
      }
    ]
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

### 6. Bulk Approve Documents

**Endpoint:** `POST /api/admin/documents/bulk-approve`  
**Authentication:** Admin Required  
**Description:** Approve multiple documents at once

#### Request

```http
POST https://olakzride.duckdns.org/api/admin/documents/bulk-approve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "documentIds": [
    "doc-uuid-1",
    "doc-uuid-2",
    "doc-uuid-3"
  ],
  "notes": "Bulk approval - all documents verified"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Bulk approval completed",
  "data": {
    "result": {
      "successful": 3,
      "failed": 0,
      "errors": []
    },
    "totalProcessed": 3
  },
  "timestamp": "2026-02-07T11:00:00Z"
}
```

---

## Error Handling

### Standard Error Response Format

All errors follow this consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "field": "field_name",
    "details": {
      "additional": "context"
    },
    "timestamp": "2026-02-07T11:00:00Z"
  }
}
```

### Common Error Codes

#### Authentication Errors

| Code | Status | Description |
|------|--------|-------------|
| AUTHENTICATION_REQUIRED | 401 | No authentication token provided |
| INVALID_TOKEN | 401 | Token is invalid or expired |
| ADMIN_AUTH_REQUIRED | 401 | Admin role required |
| ACCESS_DENIED | 403 | User doesn't have permission |

#### Validation Errors

| Code | Status | Description |
|------|--------|-------------|
| VALIDATION_ERROR | 400 | Request validation failed |
| REQUIRED_FIELD_MISSING | 400 | Required field not provided |
| INVALID_VEHICLE_SERVICE_COMBINATION | 400 | Invalid vehicle/service combo |
| AGE_REQUIREMENT_NOT_MET | 400 | Driver doesn't meet age requirement |

#### Session Errors

| Code | Status | Description |
|------|--------|-------------|
| SESSION_NOT_FOUND | 404 | Registration session not found |
| SESSION_EXPIRED | 410 | Registration session expired |
| SESSION_ALREADY_EXISTS | 409 | Active session already exists |
| PREVIOUS_STEP_INCOMPLETE | 400 | Previous step must be completed first |

#### Document Errors

| Code | Status | Description |
|------|--------|-------------|
| DOCUMENT_UPLOAD_FAILED | 400 | Document upload failed |
| DOCUMENT_NOT_FOUND | 404 | Document not found |
| INVALID_DOCUMENT_TYPE | 400 | Invalid document type |
| FILE_TOO_LARGE | 400 | File exceeds size limit |

#### Review Errors

| Code | Status | Description |
|------|--------|-------------|
| INVALID_REVIEW_ACTION | 400 | Invalid review action |
| REJECTION_REASON_REQUIRED | 400 | Rejection reason required |
| DRIVER_NOT_FOUND | 404 | Driver not found |

#### Server Errors

| Code | Status | Description |
|------|--------|-------------|
| INTERNAL_SERVER_ERROR | 500 | Internal server error |
| SERVICE_UNAVAILABLE | 503 | Service temporarily unavailable |

---

## HTTP Status Codes

### Success Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |

### Client Error Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | Access denied |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 410 | Gone | Resource expired |
| 429 | Too Many Requests | Rate limit exceeded |

### Server Error Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 500 | Internal Server Error | Server error |
| 502 | Bad Gateway | Gateway error |
| 503 | Service Unavailable | Service down |
| 504 | Gateway Timeout | Request timeout |

---

## Testing Guide

### Prerequisites

1. **Base URL:** `https://olakzride.duckdns.org`
2. **Authentication Token:** Obtain from login endpoint
3. **Admin Token:** Login with admin credentials

### Testing Driver Registration Flow

#### Step 1: Get Vehicle Types

```bash
curl -X GET https://olakzride.duckdns.org/api/driver-registration/vehicle-types
```

#### Step 2: Login/Register

```bash
curl -X POST https://olakzride.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver@example.com",
    "password": "password123"
  }'
```

Save the `accessToken` from response.

#### Step 3: Initiate Registration

```bash
curl -X POST https://olakzride.duckdns.org/api/driver-registration/register/initiate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_type": "motorcycle",
    "service_types": ["ride_hailing", "delivery"]
  }'
```

Save the `registration_id` from response.

#### Step 4: Submit Personal Info

```bash
curl -X POST https://olakzride.duckdns.org/api/driver-registration/register/REGISTRATION_ID/personal-info \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "date_of_birth": "1990-01-15",
    "phone_number": "+2348012345678",
    "address": "123 Main Street",
    "city": "Lagos",
    "state": "Lagos",
    "postal_code": "100001",
    "country": "Nigeria",
    "emergency_contact_name": "Jane Doe",
    "emergency_contact_phone": "+2348087654321"
  }'
```

#### Step 5: Submit Vehicle Details

```bash
curl -X POST https://olakzride.duckdns.org/api/driver-registration/register/REGISTRATION_ID/vehicle-details \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_make": "Honda",
    "vehicle_model": "CBR 150",
    "vehicle_year": 2022,
    "vehicle_color": "Red",
    "license_plate": "ABC123XY",
    "vehicle_registration_number": "REG123456789"
  }'
```

#### Step 6: Upload Documents

```bash
curl -X POST https://olakzride.duckdns.org/api/driver-registration/register/REGISTRATION_ID/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "drivers_license=@/path/to/license.jpg" \
  -F "vehicle_registration=@/path/to/registration.pdf" \
  -F "vehicle_insurance=@/path/to/insurance.pdf" \
  -F "profile_photo=@/path/to/photo.jpg"
```

#### Step 7: Submit for Review

```bash
curl -X POST https://olakzride.duckdns.org/api/driver-registration/register/REGISTRATION_ID/submit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

### Testing Admin Review Flow

#### Step 1: Admin Login

```bash
curl -X POST https://olakzride.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@olakzrides.com",
    "password": "YOUR_ADMIN_PASSWORD"
  }'
```

Save the `accessToken` from response.

#### Step 2: Get Pending Drivers

```bash
curl -X GET https://olakzride.duckdns.org/api/admin/drivers/pending \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Step 3: Get Driver Details

```bash
curl -X GET https://olakzride.duckdns.org/api/admin/drivers/DRIVER_ID \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

#### Step 4: Approve Driver

```bash
curl -X POST https://olakzride.duckdns.org/api/admin/drivers/DRIVER_ID/review \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "notes": "All documents verified. Welcome to OlakzRide!"
  }'
```

#### Step 5: Or Reject Driver

```bash
curl -X POST https://olakzride.duckdns.org/api/admin/drivers/DRIVER_ID/review \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "reject",
    "rejection_reason": "Invalid driver license",
    "notes": "Please upload a valid driver license"
  }'
```

---

## Integration Notes

### HTTP Client Libraries

This API works with any HTTP client library. For React Native, popular choices include:

- **axios** - Full-featured HTTP client
- **fetch** - Native JavaScript API
- **react-native-axios** - React Native optimized version

### Key Integration Points

#### 1. Base URL Configuration

```
Production: https://olakzride.duckdns.org
```

Store this in your app configuration/environment variables.

#### 2. Authentication Headers

All authenticated requests must include:
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

#### 3. File Upload (Multipart Form Data)

For document uploads, use `multipart/form-data`:
```
Content-Type: multipart/form-data
```

React Native file upload libraries:
- `react-native-image-picker` - For selecting images
- `react-native-document-picker` - For selecting documents
- `FormData` - Native API for multipart requests

#### 4. State Management

Track these key states in your app:
- `registrationId` - Current registration session
- `currentStep` - Current registration step
- `progressPercentage` - Progress indicator
- `authToken` - User authentication token

#### 5. Error Handling

Always check the `success` field in responses:
```json
{
  "success": true/false,
  "data": {...},
  "error": {...}
}
```

---

## Best Practices

### 1. Token Management

- Store tokens securely (use httpOnly cookies or secure storage)
- Refresh tokens before expiry
- Clear tokens on logout
- Handle 401 errors by redirecting to login

### 2. File Upload

- Validate file size before upload (max 10MB)
- Validate file type (JPG, JPEG, PNG, PDF)
- Show upload progress to user
- Handle upload errors gracefully
- Compress images before upload if possible

### 3. Error Handling

- Always check `success` field in response
- Display user-friendly error messages
- Log errors for debugging
- Implement retry logic for network errors
- Show validation errors next to form fields

### 4. User Experience

- Show progress indicator during registration
- Save progress automatically
- Allow users to resume registration
- Provide clear instructions for each step
- Show document requirements before upload
- Display preview of uploaded documents

### 5. Admin Interface

- Implement pagination for large lists
- Show document previews in modal/lightbox
- Provide bulk actions for efficiency
- Show statistics and metrics
- Implement search and filters
- Log all admin actions for audit trail

---

## Support & Contact

**Production URL:** https://olakzride.duckdns.org  
**Admin Email:** superadmin@olakzrides.com  
**Support Email:** support@olakzride.com

**Documentation Version:** 1.0.0  
**Last Updated:** February 7, 2026

---

## Changelog

### Version 1.0.0 (February 7, 2026)
- Initial release
- Driver registration flow (multi-step)
- Document upload with OCR
- Admin driver review system
- Admin document review system
- Email notifications
- Comprehensive error handling

---

**End of Documentation**
