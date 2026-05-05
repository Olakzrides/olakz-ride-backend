# Driver Registration API Integration Guide
**For React Native Frontend Team**

Base URL: `http://your-gateway/api/driver-registration`

All authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

## Overview

Registration is a **5-step session-based flow**. The backend creates a session when you start, and each step saves progress to that session. Sessions expire after **7 days**. Progress is tracked as a percentage:

| Step | Progress |
|------|----------|
| Initiate (vehicle selection) | 25% |
| Personal info submitted | 50% |
| Vehicle details submitted | 75% |
| Documents uploaded | 90% |
| Final submission | 100% |

---

## Step 0 — Get Vehicle Types (Public, no auth)

Before starting, fetch the available vehicle types so the user can pick one.

```
GET /api/driver-registration/vehicle-types
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicle_types": [
      {
        "id": "car",
        "name": "Car",
        "description": "...",
        "available_services": ["ride", "delivery"],
        "icon_url": "...",
        "requirements": {
          "license_required": true,
          "insurance_required": true,
          "registration_required": true
        }
      },
      {
        "id": "motorcycle",
        "name": "Motorcycle",
        "available_services": ["delivery"],
        "requirements": { "license_required": true, "insurance_required": true, "registration_required": true }
      },
      {
        "id": "bicycle",
        "name": "Bicycle",
        "available_services": ["delivery"],
        "requirements": { "license_required": false, "insurance_required": false, "registration_required": false }
      },
      {
        "id": "truck",
        "name": "Truck",
        "available_services": ["delivery"]
      },
      {
        "id": "bus",
        "name": "Bus",
        "available_services": ["ride"]
      },
      {
        "id": "minibus",
        "name": "Minibus",
        "available_services": ["ride"]
      }
    ]
  }
}
```

**Important:** `id` is the vehicle type name (e.g. `"car"`, `"motorcycle"`). Use this value in subsequent steps.

---

## Step 0b — Get Form Config for a Vehicle Type (Optional but recommended)

This tells you exactly which fields to show for personal info and vehicle details for the selected vehicle type.

```
GET /api/driver-registration/vehicle-types/:vehicleType/form-config
```

Example: `GET /api/driver-registration/vehicle-types/car/form-config`

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicle_type": "car",
    "personal_info_fields": [
      { "name": "first_name", "label": "First Name", "type": "text", "required": true },
      { "name": "last_name", "label": "Last Name", "type": "text", "required": true },
      { "name": "phone", "label": "Phone Number", "type": "tel", "required": true },
      { "name": "date_of_birth", "label": "Date of Birth", "type": "date", "required": true },
      { "name": "gender", "label": "Gender", "type": "select", "required": false },
      { "name": "address.street", "label": "Street Address", "type": "text", "required": true },
      { "name": "address.city", "label": "City", "type": "text", "required": true },
      { "name": "address.state", "label": "State/Province", "type": "text", "required": true },
      { "name": "address.postal_code", "label": "Postal Code", "type": "text", "required": true },
      { "name": "address.country", "label": "Country", "type": "text", "required": true },
      { "name": "emergency_contact.name", "label": "Emergency Contact Name", "type": "text", "required": true },
      { "name": "emergency_contact.relationship", "label": "Relationship", "type": "select", "required": true },
      { "name": "emergency_contact.phone", "label": "Emergency Contact Phone", "type": "tel", "required": true },
      { "name": "has_driving_experience", "label": "Do you have driving experience?", "type": "boolean", "required": true },
      { "name": "years_of_experience", "label": "Years of Experience", "type": "number", "required": false }
    ],
    "vehicle_details_fields": [
      { "name": "plate_number", "label": "License Plate Number", "type": "text", "required": true },
      { "name": "manufacturer", "label": "Manufacturer", "type": "select", "required": true },
      { "name": "model", "label": "Model", "type": "text", "required": true },
      { "name": "year", "label": "Year", "type": "number", "required": true },
      { "name": "color", "label": "Color", "type": "select", "required": true },
      { "name": "vin", "label": "VIN", "type": "text", "required": true },
      { "name": "seating_capacity", "label": "Seating Capacity", "type": "number", "required": true },
      { "name": "doors", "label": "Number of Doors", "type": "select", "required": true },
      { "name": "air_conditioning", "label": "Air Conditioning", "type": "boolean", "required": true }
    ]
  }
}
```

---

## Step 1 — Initiate Registration (Authenticated)

```
POST /api/driver-registration/register/initiate
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**
```json
{
  "vehicle_type": "car",
  "service_types": ["ride"]
}
```

`service_types` must be valid for the chosen vehicle type. Examples:
- `car` → `["ride"]`, `["delivery"]`, or `["ride", "delivery"]`
- `motorcycle` → `["delivery"]` only
- `bicycle` → `["delivery"]` only
- `truck` → `["delivery"]` only
- `bus` / `minibus` → `["ride"]` only

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "initiated",
    "current_step": "personal_info",
    "progress_percentage": 25,
    "expires_at": "2026-05-12T10:00:00Z",
    "next_action": {
      "step": "personal_info",
      "endpoint": "/api/driver-registration/register/{registration_id}/personal-info",
      "method": "POST"
    }
  }
}
```

**Save `registration_id`** — you need it for all subsequent steps.

**Error: session already exists**
```json
{
  "success": false,
  "error": { "code": "SESSION_ALREADY_EXISTS", "message": "..." }
}
```
If this happens, call the resume endpoint (see below) to get the existing session.

---

## Step 2 — Submit Personal Info (Authenticated)

```
POST /api/driver-registration/register/:registration_id/personal-info
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body (all vehicle types use the same personal info fields):**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "middle_name": "Paul",
  "phone": "+2348012345678",
  "email": "john@example.com",
  "date_of_birth": "1995-06-15",
  "gender": "male",
  "identification_type": "drivers_license",
  "identification_number": "DL123456789",
  "license_number": "DL123456789",
  "address": {
    "street": "12 Lagos Street",
    "city": "Lagos",
    "state": "Lagos",
    "postal_code": "100001",
    "country": "Nigeria"
  },
  "emergency_contact": {
    "name": "Jane Doe",
    "relationship": "spouse",
    "phone": "+2348098765432"
  },
  "has_driving_experience": true,
  "years_of_experience": 5
}
```

**Validation rules:**
- `first_name`, `last_name`: min 2 characters, required
- `phone`: valid international format e.g. `+2348012345678`, required
- `date_of_birth`: must be 18+ years old, required
- `address.street`, `address.city`, `address.state`, `address.postal_code`: all required
- `emergency_contact.name`, `emergency_contact.phone`, `emergency_contact.relationship`: all required
- `relationship` options: `spouse`, `parent`, `sibling`, `child`, `friend`, `other`

**Response:**
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

---

## Step 3 — Submit Vehicle Details (Authenticated)

```
POST /api/driver-registration/register/:registration_id/vehicle-details
Authorization: Bearer <token>
Content-Type: application/json
```

Fields vary by vehicle type. Use the form config from Step 0b to know exactly what to send.

**Car example:**
```json
{
  "plate_number": "ABC-123-XY",
  "manufacturer": "toyota",
  "model": "Camry",
  "year": 2020,
  "color": "white",
  "vin": "1HGBH41JXMN109186",
  "seating_capacity": 5,
  "doors": "4",
  "air_conditioning": true
}
```

**Motorcycle example:**
```json
{
  "plate_number": "MK-456-AB",
  "manufacturer": "honda",
  "model": "CB500",
  "year": 2021,
  "color": "black",
  "engine_capacity": 500,
  "engine_number": "ENG12345",
  "bike_type": "standard",
  "has_storage_box": true
}
```

**Bicycle example:**
```json
{
  "manufacturer": "Trek",
  "model": "FX3",
  "year": 2022,
  "color": "blue",
  "frame_number": "FRM98765",
  "gear_system": "multi_speed",
  "bike_type": "hybrid",
  "is_electric": false,
  "has_basket": true,
  "has_cargo_rack": true
}
```

**Truck example:**
```json
{
  "plate_number": "TRK-789-CD",
  "manufacturer": "isuzu",
  "model": "NPR",
  "year": 2019,
  "color": "white",
  "vin": "JALE5W16477000001",
  "load_capacity": 3000,
  "truck_type": "box_truck",
  "has_lift_gate": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "documents",
    "progress_percentage": 75,
    "document_requirements": {
      "vehicle_type": "car",
      "required_documents": [...],
      "optional_documents": [...]
    },
    "next_action": {
      "step": "documents",
      "endpoint": "/api/driver-registration/register/{registration_id}/documents",
      "method": "POST"
    }
  }
}
```

The `document_requirements` in the response tells you exactly which documents to upload next.

---

## Step 4 — Upload Documents (Authenticated, multipart/form-data)

```
POST /api/driver-registration/register/:registration_id/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**This is a file upload endpoint.** Use `multipart/form-data`. You can upload multiple files in one request.

**How to specify document type — 3 options (pick one):**

**Option A — Use the field name as the document type (recommended):**
```
Form field name: "drivers_license"  → file
Form field name: "vehicle_registration" → file
Form field name: "vehicle_insurance" → file
Form field name: "profile_photo" → file
```

**Option B — Use a single `documentType` field:**
```
documentType: "drivers_license"
documents: <file>
```

**Option C — Use `documentTypes` array for multiple files:**
```
documentTypes[0]: "drivers_license"
documentTypes[1]: "vehicle_registration"
documents: <file1>
documents: <file2>
```

**Valid document type values:**
- `drivers_license`
- `vehicle_registration`
- `vehicle_insurance`
- `profile_photo`
- `vehicle_photo`
- `national_id`
- `passport`

**React Native example using FormData:**
```javascript
const formData = new FormData();

// Option A — field name = document type
formData.append('drivers_license', {
  uri: licenseFile.uri,
  type: licenseFile.type || 'image/jpeg',
  name: licenseFile.fileName || 'drivers_license.jpg',
});

formData.append('vehicle_registration', {
  uri: regFile.uri,
  type: regFile.type || 'image/jpeg',
  name: regFile.fileName || 'vehicle_registration.jpg',
});

const response = await fetch(
  `${BASE_URL}/api/driver-registration/register/${registrationId}/documents`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type manually — let fetch set it with the boundary
    },
    body: formData,
  }
);
```

**Accepted file formats:** `jpg`, `jpeg`, `png`, `webp`, `pdf`
**Max file size:** 5MB per file (2MB for profile/passport photos)

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "status": "in_progress",
    "current_step": "review",
    "progress_percentage": 90,
    "documents_uploaded": 3,
    "documents": [
      {
        "id": "doc-uuid",
        "type": "drivers_license",
        "fileName": "license.jpg",
        "status": "pending",
        "url": "https://signed-url...",
        "uploadedAt": "2026-05-05T10:00:00Z"
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

If some files fail but others succeed, the response includes `upload_errors` alongside the successful ones. The step still advances if at least one document uploaded successfully.

---

## Step 5 — Submit Registration (Authenticated)

This is the final step. It creates the driver record and sends it for admin review.

```
POST /api/driver-registration/register/:registration_id/submit
Authorization: Bearer <token>
Content-Type: application/json
```

No request body needed.

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid-session-id",
    "driver_id": "driver-uuid",
    "status": "completed",
    "current_step": "completed",
    "progress_percentage": 100,
    "submitted_at": "2026-05-05T10:30:00Z",
    "driver_status": "pending",
    "message": "Registration submitted successfully. Your driver application is now pending admin review."
  }
}
```

`driver_status: "pending"` means the application is waiting for admin approval. The driver will receive an email notification when approved or rejected.

---

## Utility Endpoints

### Check Registration Status

```
GET /api/driver-registration/register/:registration_id/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid",
    "status": "in_progress",
    "current_step": "documents",
    "progress_percentage": 75,
    "vehicle_type": "car",
    "service_types": ["ride"],
    "is_expired": false,
    "expires_at": "2026-05-12T10:00:00Z",
    "personal_info_completed_at": "2026-05-05T09:00:00Z",
    "vehicle_details_completed_at": "2026-05-05T09:15:00Z",
    "next_action": {
      "step": "documents",
      "endpoint": "/api/driver-registration/register/{id}/documents",
      "method": "POST"
    }
  }
}
```

### Resume an Existing Session

If the user already started registration and comes back to the app, use this to find their active session.

```
POST /api/driver-registration/register/resume
Authorization: Bearer <token>
```

No body needed.

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid",
    "status": "in_progress",
    "current_step": "vehicle_details",
    "progress_percentage": 50,
    "vehicle_type": "car",
    "service_types": ["ride"],
    "next_action": {
      "step": "vehicle_details",
      "endpoint": "/api/driver-registration/register/{id}/vehicle-details",
      "method": "POST"
    }
  }
}
```

If no active session exists, returns 404.

### Get Document Requirements for a Vehicle Type

```
GET /api/driver-registration/register/:registration_id/documents/requirements
```

Returns the required and optional documents for the vehicle type in the session.

### Get Secure Document URL

```
GET /api/driver-registration/documents/:documentId/url
Authorization: Bearer <token>
```

Returns a signed URL valid for 24 hours to view an uploaded document.

---

## Error Codes Reference

| Code | Meaning |
|------|---------|
| `SESSION_ALREADY_EXISTS` | User already has an active session — call resume instead |
| `SESSION_NOT_FOUND` | Invalid or expired registration_id |
| `SESSION_EXPIRED` | Session older than 7 days — user must start over |
| `ACCESS_DENIED` | Session belongs to a different user |
| `PREVIOUS_STEP_INCOMPLETE` | Tried to skip a step |
| `REQUIRED_FIELD_MISSING` | A required field was not provided |
| `VALIDATION_FAILED` | Field value failed validation |
| `AGE_REQUIREMENT_NOT_MET` | Driver must be 18+ |
| `INVALID_PHONE_FORMAT` | Phone number format invalid |
| `INVALID_DATE_FORMAT` | Date format invalid |
| `INVALID_VIN_FORMAT` | VIN must be exactly 17 characters |
| `INVALID_VEHICLE_SERVICE_COMBINATION` | Service type not supported by vehicle |
| `DOCUMENT_UPLOAD_FAILED` | File upload to storage failed |

---

## Recommended App Flow

```
App Start
  ↓
Check if user has active session → POST /register/resume
  ↓ (no session)
Show vehicle type picker → GET /vehicle-types
  ↓
User picks vehicle + services
  ↓
Fetch form config → GET /vehicle-types/:type/form-config
  ↓
POST /register/initiate  →  save registration_id
  ↓
Show personal info form
  ↓
POST /register/:id/personal-info
  ↓
Show vehicle details form (fields from form config)
  ↓
POST /register/:id/vehicle-details  →  response includes document_requirements
  ↓
Show document upload screen (based on document_requirements)
  ↓
POST /register/:id/documents  (multipart/form-data)
  ↓
Show review screen
  ↓
POST /register/:id/submit
  ↓
Show "Application submitted, pending review" screen
```

---

## Notes for React Native

- Always use `multipart/form-data` for the documents step. Do **not** manually set `Content-Type` — let the fetch/axios library set it automatically with the correct boundary.
- Store `registration_id` in AsyncStorage so the user can resume if they close the app mid-flow.
- Call `POST /register/resume` on app launch to check for an existing session before showing the "Start Registration" button.
- The `next_action` object in each response tells you exactly which endpoint to call next — you can use this to drive navigation.
- Document signed URLs expire in 24 hours. Don't cache them long-term.
