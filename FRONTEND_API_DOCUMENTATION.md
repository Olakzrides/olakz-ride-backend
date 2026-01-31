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

## 📱 Platform Service APIs

### Get Service Channels
**GET** `/api/store/channels`

**Description:** Get all available service channels (ride, delivery, etc.)

**Headers:** None required

**Response:**
```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "id": "ride-channel",
        "name": "Ride Service",
        "description": "Passenger transportation service",
        "is_active": true
      },
      {
        "id": "delivery-channel", 
        "name": "Delivery Service",
        "description": "Package and food delivery service",
        "is_active": true
      }
    ]
  },
  "timestamp": "2026-01-30T20:03:32.201Z"
}
```

### Get Products
**GET** `/api/store/products`

**Description:** Get all available products/services

**Headers:** None required

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "standard-ride",
        "title": "Standard Ride",
        "description": "Affordable rides for everyday travel",
        "channel_id": "ride-channel",
        "is_active": true
      },
      {
        "id": "premium-ride",
        "title": "Premium Ride", 
        "description": "Comfortable rides with premium vehicles",
        "channel_id": "ride-channel",
        "is_active": true
      }
    ]
  }
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

**Body:**
```json
{
  "documents": [
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

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "in_progress",
    "current_step": "review",
    "progress_percentage": 90,
    "documents_validated": 3,
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

## 🔐 Authentication APIs

### Register User
**POST** `/api/auth/register`

**Description:** Register a new user account

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400
  }
}
```

### Login User
**POST** `/api/auth/login`

**Description:** Authenticate user and get JWT token

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 86400
  }
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

### Driver Registration Flow
```javascript
// 1. Get vehicle types (no auth needed)
const vehicleTypes = await fetch('https://olakzride.duckdns.org/api/driver-registration/vehicle-types');

// 2. User selects vehicle and services, then initiate registration
const initResponse = await fetch('https://olakzride.duckdns.org/api/driver-registration/register/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    vehicle_type: 'car',
    service_types: ['ride', 'delivery']
  })
});

const { registration_id } = initResponse.data;

// 3. Submit personal info
await fetch(`https://olakzride.duckdns.org/api/driver-registration/register/${registration_id}/personal-info`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    first_name: 'John',
    last_name: 'Doe',
    phone: '+1234567890',
    date_of_birth: '1990-01-01',
    address: '123 Main St',
    city: 'New York',
    state: 'NY',
    postal_code: '10001'
  })
});

// 4. Submit vehicle details
await fetch(`https://olakzride.duckdns.org/api/driver-registration/register/${registration_id}/vehicle-details`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    plate_number: 'ABC123',
    manufacturer: 'Toyota',
    model: 'Camry',
    year: 2020,
    color: 'Blue',
    vin: '1HGBH41JXMN109186'
  })
});

// 5. Upload documents
await fetch(`https://olakzride.duckdns.org/api/driver-registration/register/${registration_id}/documents`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    documents: [
      {
        type: 'driver_license',
        url: 'https://your-storage.com/license.jpg',
        filename: 'license.jpg'
      }
    ]
  })
});

// 6. Submit for review
await fetch(`https://olakzride.duckdns.org/api/driver-registration/register/${registration_id}/submit`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});
```

### Resume Registration Flow
```javascript
// Check if user has an active registration
const resumeResponse = await fetch('https://olakzride.duckdns.org/api/driver-registration/register/resume', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});

if (resumeResponse.success) {
  const { registration_id, current_step, progress_percentage } = resumeResponse.data;
  // Continue from current step
}
```

---

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
- **Test User**: Create via `/api/auth/register`

### Postman Collection
Import the provided Postman collection for easy testing:
- `Phase4_Driver_Registration_Complete.postman_collection.json`

---

## 📞 Support

For API issues or questions:
1. Check the error response for specific error codes
2. Verify authentication tokens are valid
3. Ensure request format matches the documentation
4. Check rate limits if getting 429 errors

**API Status**: ✅ Live and Ready for Integration  
**Last Tested**: January 30, 2026