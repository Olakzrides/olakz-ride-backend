# Olakz Ride Backend API Documentation
## Complete Frontend Integration Guide

**Base URL:** `https://olakzride.duckdns.org`  
**API Version:** v1  
**Last Updated:** January 30, 2026

---

## 🔐 Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```javascript
headers: {
  'Authorization': 'Bearer <your-jwt-token>',
  'Content-Type': 'application/json'
}
```



---

## 🚗 Driver Registration APIs

### 1. Get Vehicle Types (PUBLIC)
**GET** `/api/driver-registration/vehicle-types`

**Description:** Get all available vehicle types with service capabilities

**Headers:** None required

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicle_types": [
      {
        "id": "car",
        "name": "Car",
        "description": "4-wheel passenger vehicle",
        "available_services": ["ride", "delivery"],
        "icon_url": null,
        "requirements": {
          "license_required": true,
          "insurance_required": true,
          "registration_required": true
        }
      },
      {
        "id": "motorcycle",
        "name": "Motorcycle",
        "description": "2-wheel motorized vehicle",
        "available_services": ["delivery"],
        "icon_url": null,
        "requirements": {
          "license_required": true,
          "insurance_required": true,
          "registration_required": true
        }
      },
      {
        "id": "bicycle",
        "name": "Bicycle",
        "description": "2-wheel pedal-powered vehicle",
        "available_services": ["delivery"],
        "icon_url": null,
        "requirements": {
          "license_required": false,
          "insurance_required": false,
          "registration_required": false
        }
      }
    ]
  },
  "timestamp": "2026-01-30T20:03:32.201Z"
}
```

### 2. Get Vehicle Form Configuration
**GET** `/api/driver-registration/vehicle-types/{vehicleType}/form-config`

**Description:** Get dynamic form configuration for specific vehicle type

**Headers:** None required

**Parameters:**
- `vehicleType` (path): Vehicle type ID (car, motorcycle, bicycle, etc.)

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicle_type": "car",
    "required_fields": [
      {
        "field": "plate_number",
        "label": "License Plate Number",
        "type": "text",
        "required": true,
        "validation": {
          "pattern": "^[A-Z0-9]{3,8}$",
          "message": "Enter valid license plate number"
        }
      },
      {
        "field": "vin",
        "label": "Vehicle Identification Number (VIN)",
        "type": "text",
        "required": true,
        "validation": {
          "minLength": 17,
          "maxLength": 17,
          "message": "VIN must be exactly 17 characters"
        }
      }
    ],
    "optional_fields": [
      {
        "field": "engine_capacity",
        "label": "Engine Capacity (L)",
        "type": "number",
        "required": false
      }
    ]
  }
}
```

### 3. Initiate Registration
**POST** `/api/driver-registration/register/initiate`

**Description:** Start a new driver registration session

**Headers:** 
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "vehicle_type": "car",
  "service_types": ["ride", "delivery"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "initiated",
    "current_step": "personal_info",
    "progress_percentage": 25,
    "expires_at": "2026-02-06T14:00:00.000Z",
    "next_action": {
      "step": "personal_info",
      "endpoint": "/api/driver-registration/register/550e8400-e29b-41d4-a716-446655440000/personal-info",
      "method": "POST"
    }
  },
  "timestamp": "2026-01-30T14:00:00.000Z"
}
```

### 4. Submit Personal Information
**POST** `/api/driver-registration/register/{registration_id}/personal-info`

**Description:** Submit personal information for the registration

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "date_of_birth": "1990-01-01",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "postal_code": "10001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/550e8400-e29b-41d4-a716-446655440000/vehicle-details",
      "method": "POST"
    }
  }
}
```

### 5. Submit Vehicle Details
**POST** `/api/driver-registration/register/{registration_id}/vehicle-details`

**Description:** Submit vehicle information

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body (for Car):**
```json
{
  "plate_number": "ABC123",
  "manufacturer": "Toyota",
  "model": "Camry",
  "year": 2020,
  "color": "Blue",
  "vin": "1HGBH41JXMN109186"
}
```

**Body (for Motorcycle):**
```json
{
  "plate_number": "MC123",
  "manufacturer": "Honda",
  "model": "CBR600RR",
  "year": 2021,
  "color": "Red",
  "engine_capacity": 0.6
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress",
    "current_step": "documents",
    "progress_percentage": 75,
    "document_requirements": [
      {
        "type": "driver_license",
        "name": "Driver's License",
        "description": "Valid driver's license",
        "required": true,
        "formats": ["jpg", "png", "pdf"],
        "max_size": "5MB"
      },
      {
        "type": "vehicle_registration",
        "name": "Vehicle Registration",
        "description": "Vehicle registration certificate",
        "required": true,
        "formats": ["jpg", "png", "pdf"],
        "max_size": "5MB"
      }
    ],
    "next_action": {
      "step": "documents",
      "endpoint": "/api/driver-registration/register/550e8400-e29b-41d4-a716-446655440000/documents",
      "method": "POST"
    }
  }
}
```

### 6. Upload Documents
**POST** `/api/driver-registration/register/{registration_id}/documents`

**Description:** Upload required documents

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body (Complete Example for Car):**
```json
{
  "documents": [
    {
      "type": "national_id",
      "url": "https://your-storage.com/documents/national_id.jpg",
      "filename": "national_id.jpg"
    },
    {
      "type": "passport_photo",
      "url": "https://your-storage.com/documents/passport_photo.jpg",
      "filename": "passport_photo.jpg"
    },
    {
      "type": "vehicle_photos",
      "url": "https://your-storage.com/documents/vehicle_photos.jpg",
      "filename": "vehicle_photos.jpg"
    },
    {
      "type": "driver_license",
      "url": "https://your-storage.com/documents/license.jpg",
      "filename": "license.jpg"
    },
    {
      "type": "vehicle_registration",
      "url": "https://your-storage.com/documents/registration.pdf",
      "filename": "registration.pdf"
    },
    {
      "type": "insurance_certificate",
      "url": "https://your-storage.com/documents/insurance.jpg",
      "filename": "insurance.jpg"
    }
  ]
}
```

**Body (For Bicycle - Minimal Requirements):**
```json
{
  "documents": [
    {
      "type": "national_id",
      "url": "https://your-storage.com/documents/national_id.jpg",
      "filename": "national_id.jpg"
    },
    {
      "type": "passport_photo",
      "url": "https://your-storage.com/documents/passport_photo.jpg",
      "filename": "passport_photo.jpg"
    },
    {
      "type": "vehicle_photos",
      "url": "https://your-storage.com/documents/vehicle_photos.jpg",
      "filename": "vehicle_photos.jpg"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress",
    "current_step": "review",
    "progress_percentage": 90,
    "documents_validated": 6,
    "next_action": {
      "step": "review",
      "endpoint": "/api/driver-registration/register/550e8400-e29b-41d4-a716-446655440000/submit",
      "method": "POST"
    }
  }
}
```

### 7. Submit Registration
**POST** `/api/driver-registration/register/{registration_id}/submit`

**Description:** Submit the completed registration for review

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:** `{}` (empty object)

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "current_step": "completed",
    "progress_percentage": 100,
    "submitted_at": "2026-01-30T15:30:00.000Z",
    "message": "Registration submitted successfully. You will be notified once your application is reviewed."
  }
}
```

### 8. Get Registration Status
**GET** `/api/driver-registration/register/{registration_id}/status`

**Description:** Get the current status of a registration session

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "vehicle_type": "car",
    "service_types": ["ride", "delivery"],
    "created_at": "2026-01-30T14:00:00.000Z",
    "expires_at": "2026-02-06T14:00:00.000Z",
    "is_expired": false,
    "personal_info_completed_at": "2026-01-30T14:15:00.000Z",
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/550e8400-e29b-41d4-a716-446655440000/vehicle-details",
      "method": "POST"
    }
  }
}
```

### 9. Resume Registration
**POST** `/api/driver-registration/register/resume`

**Description:** Resume an existing active registration session

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:** `{}` (empty object)

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "vehicle_type": "car",
    "service_types": ["ride", "delivery"],
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/550e8400-e29b-41d4-a716-446655440000/vehicle-details",
      "method": "POST"
    }
  }
}
```

---

## 📄 Document Requirements by Vehicle Type

### All Vehicle Types (Base Requirements)
These documents are required for **ALL** vehicle types:

```json
[
  {
    "type": "national_id",
    "name": "National ID",
    "description": "Government issued ID",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  },
  {
    "type": "passport_photo",
    "name": "Passport Photo", 
    "description": "Recent passport-style photo",
    "required": true,
    "formats": ["jpg", "png"],
    "max_size": "2MB"
  },
  {
    "type": "vehicle_photos",
    "name": "Vehicle Photos",
    "description": "4 photos: front, back, left side, right side",
    "required": true,
    "formats": ["jpg", "png"],
    "max_size": "5MB",
    "count": 4
  }
]
```

### Car (Additional Requirements)
```json
[
  {
    "type": "driver_license",
    "name": "Driver's License",
    "description": "Valid driver's license for cars",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  },
  {
    "type": "vehicle_registration",
    "name": "Vehicle Registration",
    "description": "Vehicle registration certificate",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  },
  {
    "type": "insurance_certificate",
    "name": "Insurance Certificate",
    "description": "Valid vehicle insurance",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  }
]
```

### Motorcycle (Additional Requirements)
```json
[
  {
    "type": "motorcycle_license",
    "name": "Motorcycle License",
    "description": "Valid motorcycle license",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  },
  {
    "type": "vehicle_registration",
    "name": "Vehicle Registration",
    "description": "Motorcycle registration certificate",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  },
  {
    "type": "insurance_certificate",
    "name": "Insurance Certificate",
    "description": "Valid motorcycle insurance",
    "required": true,
    "formats": ["jpg", "png", "pdf"],
    "max_size": "5MB"
  }
]
```

### Bicycle (No Additional Requirements)
Only the base requirements (National ID, Passport Photo, Vehicle Photos) are needed for bicycles.

### Complete Document Upload Example for Car
```json
{
  "documents": [
    {
      "type": "national_id",
      "url": "https://your-storage.com/documents/national_id.jpg",
      "filename": "national_id.jpg"
    },
    {
      "type": "passport_photo",
      "url": "https://your-storage.com/documents/passport_photo.jpg", 
      "filename": "passport_photo.jpg"
    },
    {
      "type": "vehicle_photos",
      "url": "https://your-storage.com/documents/vehicle_photos.jpg",
      "filename": "vehicle_photos.jpg"
    },
    {
      "type": "driver_license",
      "url": "https://your-storage.com/documents/license.jpg",
      "filename": "license.jpg"
    },
    {
      "type": "vehicle_registration",
      "url": "https://your-storage.com/documents/registration.pdf",
      "filename": "registration.pdf"
    },
    {
      "type": "insurance_certificate",
      "url": "https://your-storage.com/documents/insurance.jpg",
      "filename": "insurance.jpg"
    }
  ]
}
```

---



## ❌ Error Responses

### Standard Error Format
All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "field": "field_name",
    "details": {
      "additional": "context"
    },
    "timestamp": "2026-01-30T14:00:00.000Z"
  },
  "timestamp": "2026-01-30T14:00:00.000Z"
}
```

### Common Error Codes

#### Authentication Errors (401)
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide a valid token."
  }
}
```

#### Validation Errors (400)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed. Please check your input and try again."
  },
  "validation_errors": [
    {
      "field": "first_name",
      "code": "REQUIRED_FIELD_MISSING",
      "message": "First name is required",
      "value": null
    }
  ]
}
```

#### Session Errors (404/400)
```json
{
  "success": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Registration session not found. Please start a new registration."
  }
}
```

#### Rate Limiting (429)
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retry_after_seconds": 900
    }
  }
}
```

---

## 🔄 Frontend Integration Flow


## 📊 Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Registration Initiation | 3 requests | 1 hour |
| General Registration | 10 requests | 15 minutes |
| Document Upload | 20 requests | 10 minutes |
| Vehicle Types (Public) | No limit | - |

---

## 🔧 Testing

### Test Credentials
- **Base URL**: `https://olakzride.duckdns.org`




## 📞 Support

For API issues or questions:
1. Check the error response for specific error codes
2. Verify authentication tokens are valid
3. Ensure request format matches the documentation
4. Check rate limits if getting 429 errors

**API Status**: ✅ Live and Ready for Integration  
**Last Tested**: January 30, 2026