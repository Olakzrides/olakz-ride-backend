# Phase 2: Driver Registration API Endpoints

## Base URL
```
http://localhost:3000/api/driver-registration
```

**Note:** All requests go through the API Gateway (port 3000), not directly to the core-logistics service (port 3001).

## Authentication
Most endpoints require authentication. Use a valid JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## 1. Get Vehicle Types (PUBLIC)
**GET** `/vehicle-types`

**Description:** Get all available vehicle types with service capabilities

**Headers:** None required (public endpoint)

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
      }
    ]
  }
}
```

---

## 2. Initiate Registration
**POST** `/register/initiate`

**Description:** Start a new driver registration session

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-jwt-token>
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
    "registration_id": "uuid-here",
    "status": "initiated",
    "current_step": "personal_info",
    "progress_percentage": 25,
    "expires_at": "2026-02-05T14:00:00.000Z",
    "next_action": {
      "step": "personal_info",
      "endpoint": "/api/driver-registration/register/{id}/personal-info",
      "method": "POST"
    }
  }
}
```

---

## 3. Submit Personal Information
**POST** `/register/{registration_id}/personal-info`

**Description:** Submit personal information for the registration

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-jwt-token>
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
    "registration_id": "uuid-here",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/{id}/vehicle-details",
      "method": "POST"
    }
  }
}
```

---

## 4. Submit Vehicle Details
**POST** `/register/{registration_id}/vehicle-details`

**Description:** Submit vehicle information

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-jwt-token>
```

**Body:**
```json
{
  "plate_number": "ABC123",
  "manufacturer": "Toyota",
  "model": "Camry",
  "year": 2020,
  "color": "Blue"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-here",
    "status": "in_progress",
    "current_step": "documents",
    "progress_percentage": 75,
    "required_documents": [
      {
        "type": "driver_license",
        "name": "Driver's License",
        "description": "Valid driver's license",
        "required": true,
        "formats": ["jpg", "png", "pdf"],
        "maxSize": "5MB"
      }
    ],
    "next_action": {
      "step": "documents",
      "endpoint": "/api/driver-registration/register/{id}/documents",
      "method": "POST"
    }
  }
}
```

---

## 5. Upload Documents
**POST** `/register/{registration_id}/documents`

**Description:** Upload required documents

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-jwt-token>
```

**Body:**
```json
{
  "documents": [
    {
      "type": "driver_license",
      "url": "https://storage.example.com/license.jpg",
      "filename": "license.jpg"
    },
    {
      "type": "vehicle_registration",
      "url": "https://storage.example.com/registration.jpg",
      "filename": "registration.jpg"
    },
    {
      "type": "insurance_certificate",
      "url": "https://storage.example.com/insurance.jpg",
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
    "registration_id": "uuid-here",
    "status": "in_progress",
    "current_step": "review",
    "progress_percentage": 90,
    "next_action": {
      "step": "review",
      "endpoint": "/api/driver-registration/register/{id}/submit",
      "method": "POST"
    }
  }
}
```

---

## 6. Submit Registration
**POST** `/register/{registration_id}/submit`

**Description:** Submit the completed registration for review

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-jwt-token>
```

**Body:** `{}` (empty object)

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-here",
    "status": "completed",
    "current_step": "completed",
    "progress_percentage": 100,
    "submitted_at": "2026-01-29T14:30:00.000Z",
    "message": "Registration submitted successfully. You will be notified once your application is reviewed."
  }
}
```

---

## 7. Get Registration Status
**GET** `/register/{registration_id}/status`

**Description:** Get the current status of a registration session

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-here",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "vehicle_type": "car",
    "service_types": ["ride", "delivery"],
    "created_at": "2026-01-29T14:00:00.000Z",
    "expires_at": "2026-02-05T14:00:00.000Z",
    "is_expired": false,
    "personal_info_completed_at": "2026-01-29T14:15:00.000Z",
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/{id}/vehicle-details",
      "method": "POST"
    }
  }
}
```

---

## 8. Resume Registration
**POST** `/register/resume`

**Description:** Resume an existing active registration session

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-jwt-token>
```

**Body:** `{}` (empty object)

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-here",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "vehicle_type": "car",
    "service_types": ["ride", "delivery"],
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/{id}/vehicle-details",
      "method": "POST"
    }
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required fields: first_name, last_name"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Access denied to this registration session"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Registration session not found"
}
```

---

## Testing Flow

1. **Start with vehicle types** - GET `/vehicle-types` (no auth needed)
2. **Initiate registration** - POST `/register/initiate` with vehicle and service selection
3. **Submit personal info** - POST `/register/{id}/personal-info`
4. **Submit vehicle details** - POST `/register/{id}/vehicle-details`
5. **Upload documents** - POST `/register/{id}/documents`
6. **Submit for review** - POST `/register/{id}/submit`
7. **Check status anytime** - GET `/register/{id}/status`
8. **Resume if needed** - POST `/register/resume`

## Notes for Testing

- Replace `{registration_id}` with the actual UUID returned from the initiate endpoint
- Sessions expire after 7 days
- Each step validates that previous steps are completed
- Progress percentage: 25% → 50% → 75% → 90% → 100%
- You can check status at any point during the process
- Resume will find your active session if you have one