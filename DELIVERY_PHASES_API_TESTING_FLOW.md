# Delivery Service - API Testing Flow

## Base URL
- **Development**: `http://localhost:3003`
- **Production**: `https://olakzride.duckdns.org`

## Authentication
All endpoints require authentication token in header:
```
Authorization: Bearer <your_jwt_token>
```

---
    
## Phase 1: Core Delivery Infrastructure

### 1. Get Available Vehicle Types

**Endpoint**: `GET /api/delivery/vehicle-types`

**Headers**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**Query Parameters**:
- `regionId` (optional): Filter by region (defaults to Lagos)

**Example**: `GET /api/delivery/vehicle-types?regionId=00000000-0000-0000-0000-000000000001`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "vehicleTypes": [
      {
        "id": "uuid",
        "name": "bike",
        "displayName": "Bike",
        "description": "Fast delivery for small packages",
        "iconUrl": "https://...",
        "isActive": true,
        "fareConfig": {
          "baseFare": 300,
          "pricePerKm": 80,
          "minimumFare": 200,
          "scheduledSurcharge": 200,
          "currencyCode": "NGN"
        }
      },
      {
        "id": "uuid",
        "name": "car",
        "displayName": "Car",
        "description": "Standard delivery for medium packages",
        "iconUrl": "https://...",
        "isActive": true,
        "fareConfig": {
          "baseFare": 500,
          "pricePerKm": 100,
          "minimumFare": 300,
          "scheduledSurcharge": 200,
          "currencyCode": "NGN"
        }
      },
      {
        "id": "uuid",
        "name": "truck",
        "displayName": "Truck",
        "description": "Large delivery for bulky items",
        "iconUrl": "https://...",
        "isActive": true,
        "fareConfig": {
          "baseFare": 1000,
          "pricePerKm": 150,
          "minimumFare": 800,
          "scheduledSurcharge": 200,
          "currencyCode": "NGN"
        }
      },
      {
        "id": "uuid",
        "name": "bicycle",
        "displayName": "Bicycle",
        "description": "Eco-friendly delivery for small packages",
        "iconUrl": "https://...",
        "isActive": true,
        "fareConfig": {
          "baseFare": 200,
          "pricePerKm": 50,
          "minimumFare": 150,
          "scheduledSurcharge": 200,
          "currencyCode": "NGN"
        }
      }
    ],
    "message": "Vehicle types retrieved successfully"
  },
  "timestamp": "2026-02-19T10:25:00Z"
}
```

---

### 2. Estimate Delivery Fare

**Endpoint**: `POST /api/delivery/estimate-fare`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "vehicleTypeId": "uuid-of-vehicle-type",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219
  },
  "deliveryType": "instant"
}
```

**Optional Fields**:
```json
{
  "regionId": "00000000-0000-0000-0000-000000000001"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "fareBreakdown": {
      "baseFare": 500,
      "distanceFare": 1000,
      "scheduledSurcharge": 0,
      "totalFare": 1500,
      "minimumFare": 300,
      "finalFare": 1500,
      "distance": 10.5,
      "distanceText": "10.5 km",
      "currencyCode": "NGN"
    },
    "message": "Fare estimated successfully"
  },
  "timestamp": "2026-02-19T10:28:00Z"
}
```

**For Scheduled Delivery**:
```json
{
  "vehicleTypeId": "uuid-of-vehicle-type",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219
  },
  "deliveryType": "scheduled"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "fareBreakdown": {
      "baseFare": 500,
      "distanceFare": 1000,
      "scheduledSurcharge": 200,
      "totalFare": 1700,
      "minimumFare": 300,
      "finalFare": 1700,
      "distance": 10.5,
      "distanceText": "10.5 km",
      "currencyCode": "NGN"
    },
    "message": "Fare estimated successfully"
  },
  "timestamp": "2026-02-19T10:28:00Z"
}
```

---

### 3. Generate Package Photo Upload URL

**Endpoint**: `POST /api/delivery/upload/package-photo`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "fileName": "package.jpg",
  "fileType": "image/jpeg",
  "fileSize": 2048576
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://storage.supabase.com/object/upload/sign/driver-documents/delivery-packages/user-id/package_1234567890.jpg?token=xyz",
    "photoUrl": "https://storage.supabase.com/object/public/driver-documents/delivery-packages/user-id/package_1234567890.jpg",
    "filePath": "delivery-packages/user-id/package_1234567890.jpg",
    "expiresIn": 3600,
    "maxFileSize": 5242880,
    "message": "Upload URL generated successfully"
  },
  "timestamp": "2026-02-19T10:28:00Z"
}
```

**Frontend Upload Flow**:
```javascript
// Step 1: Get signed upload URL
const response = await fetch('/api/delivery/upload/package-photo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  })
});

const { uploadUrl, photoUrl } = await response.json();

// Step 2: Upload file directly to storage
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': file.type
  }
});

// Step 3: Use photoUrl in delivery order creation
```

---

### 4. Create Delivery Order

**Endpoint**: `POST /api/delivery/order`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "recipientName": "John Doe",
  "recipientPhone": "+2348012345678",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "123 Victoria Island, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219,
    "address": "456 Lekki Phase 1, Lagos"
  },
  "packageDescription": "Electronics - Handle with care",
  "packagePhotoUrl": "https://storage.supabase.com/deliveries/user-id/package.jpg",
  "vehicleTypeId": "uuid-of-vehicle-type",
  "deliveryType": "instant",
  "paymentMethod": "wallet"
}
```

**Optional Fields**:
```json
{
  "scheduledPickupAt": "2026-02-20T14:00:00Z",
  "regionId": "00000000-0000-0000-0000-000000000001",
  "cardId": "uuid-of-saved-card",
  "cardDetails": {
    "cardNumber": "5531886652142950",
    "cvv": "564",
    "expiryMonth": "09",
    "expiryYear": "32",
    "cardholderName": "John Doe",
    "pin": "3310"
  }
}
```

**Expected Response** (200 OK - Wallet/Cash Payment):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "pending",
      "pickupCode": "ABC123",
      "deliveryCode": "XYZ789",
      "estimatedFare": 1500,
      "currencyCode": "NGN",
      "deliveryType": "instant",
      "scheduledPickupAt": null,
      "packagePhotoUrl": "https://storage.url/package.jpg",
      "createdAt": "2026-02-19T10:30:00Z"
    },
    "fareBreakdown": {
      "baseFare": 500,
      "distanceFare": 1000,
      "scheduledSurcharge": 0,
      "totalFare": 1500,
      "minimumFare": 300,
      "finalFare": 1500,
      "distance": 10.5,
      "distanceText": "10.5 km",
      "currencyCode": "NGN"
    },
    "message": "Delivery order created successfully. Searching for courier..."
  },
  "timestamp": "2026-02-19T10:30:00Z"
}
```

**Expected Response** (200 OK - Card Payment Requires OTP):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "pending"
    },
    "requiresAuthorization": true,
    "authorization": {
      "mode": "otp",
      "message": "Please enter the OTP sent to your phone"
    },
    "flw_ref": "FLW-MOCK-REF-123456",
    "tx_ref": "delivery_uuid_1234567890",
    "message": "Charge initiated. Please validate with OTP."
  },
  "timestamp": "2026-02-19T10:30:00Z"
}
```

**For Scheduled Delivery Response**:
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "pending",
      "pickupCode": "ABC123",
      "deliveryCode": "XYZ789",
      "estimatedFare": 1700,
      "currencyCode": "NGN",
      "deliveryType": "scheduled",
      "scheduledPickupAt": "2026-02-20T14:00:00Z",
      "packagePhotoUrl": "https://storage.url/package.jpg",
      "createdAt": "2026-02-19T10:30:00Z"
    },
    "fareBreakdown": {
      "baseFare": 500,
      "distanceFare": 1000,
      "scheduledSurcharge": 200,
      "totalFare": 1700,
      "minimumFare": 300,
      "finalFare": 1700,
      "distance": 10.5,
      "distanceText": "10.5 km",
      "currencyCode": "NGN"
    },
    "message": "Delivery scheduled successfully"
  },
  "timestamp": "2026-02-19T10:30:00Z"
}
```

---

### 5. Validate Card Payment (OTP)

**Endpoint**: `POST /api/delivery/:id/validate-payment`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "flw_ref": "FLW-MOCK-REF-123456",
  "otp": "123456"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "pending",
      "pickupCode": "ABC123",
      "deliveryCode": "XYZ789"
    },
    "message": "Payment validated and delivery confirmed"
  },
  "timestamp": "2026-02-19T10:31:00Z"
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid OTP",
  "timestamp": "2026-02-19T10:31:00Z"
}
```

---

### 6. Get Delivery Details

**Endpoint**: `GET /api/delivery/:id`

**Headers**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "assigned",
      "recipientName": "John Doe",
      "recipientPhone": "+2348012345678",
      "pickupLocation": {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "address": "123 Victoria Island, Lagos"
      },
      "dropoffLocation": {
        "latitude": 6.4281,
        "longitude": 3.4219,
        "address": "456 Lekki Phase 1, Lagos"
      },
      "packageDescription": "Electronics - Handle with care",
      "packagePhotoUrl": null,
      "pickupPhotoUrl": null,
      "deliveryPhotoUrl": null,
      "vehicleType": {
        "id": "uuid",
        "name": "bike",
        "display_name": "Bike",
        "icon_url": "https://..."
      },
      "deliveryType": "instant",
      "scheduledPickupAt": null,
      "estimatedFare": 1500,
      "finalFare": null,
      "currencyCode": "NGN",
      "distanceKm": 10.5,
      "paymentMethod": "cash",
      "paymentStatus": "pending",
      "courier": {
        "id": "uuid",
        "user_id": "uuid",
        "license_number": "ABC123",
        "rating": 4.8,
        "total_deliveries": 150,
        "delivery_rating": 4.9
      },
      "pickupCode": "ABC123",
      "deliveryCode": "XYZ789",
      "createdAt": "2026-02-19T10:30:00Z",
      "assignedAt": "2026-02-19T10:35:00Z",
      "pickedUpAt": null,
      "deliveredAt": null,
      "cancelledAt": null
    }
  },
  "timestamp": "2026-02-19T10:40:00Z"
}
```

---

### 7. Get Delivery History

**Endpoint**: `GET /api/delivery/history`

**Headers**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**Query Parameters**:
- `limit` (optional): Number of records (default: 20)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status

**Example**: `GET /api/delivery/history?limit=10&offset=0&status=delivered`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB0001",
        "status": "delivered",
        "recipientName": "John Doe",
        "pickupAddress": "123 Victoria Island, Lagos",
        "dropoffAddress": "456 Lekki Phase 1, Lagos",
        "estimatedFare": 1500,
        "finalFare": 1500,
        "currencyCode": "NGN",
        "vehicleType": {
          "id": "uuid",
          "name": "bike",
          "display_name": "Bike"
        },
        "deliveryType": "instant",
        "createdAt": "2026-02-19T10:30:00Z",
        "deliveredAt": "2026-02-19T11:15:00Z"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 10,
      "offset": 0
    }
  },
  "timestamp": "2026-02-19T12:00:00Z"
}
```

---

### 8. Get Delivery Status History

**Endpoint**: `GET /api/delivery/:id/history`

**Headers**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "status": "pending",
        "location": null,
        "notes": "Delivery order created",
        "createdAt": "2026-02-19T10:30:00Z"
      },
      {
        "status": "searching",
        "location": null,
        "notes": "Searching for courier",
        "createdAt": "2026-02-19T10:31:00Z"
      },
      {
        "status": "assigned",
        "location": null,
        "notes": "Courier uuid assigned",
        "createdAt": "2026-02-19T10:35:00Z"
      },
      {
        "status": "arrived_pickup",
        "location": {
          "latitude": 6.5244,
          "longitude": 3.3792
        },
        "notes": "Courier arrived at pickup location",
        "createdAt": "2026-02-19T10:45:00Z"
      },
      {
        "status": "picked_up",
        "location": null,
        "notes": "Package picked up - code verified",
        "createdAt": "2026-02-19T10:50:00Z"
      },
      {
        "status": "in_transit",
        "location": null,
        "notes": "Delivery in transit",
        "createdAt": "2026-02-19T10:51:00Z"
      },
      {
        "status": "arrived_delivery",
        "location": {
          "latitude": 6.4281,
          "longitude": 3.4219
        },
        "notes": "Courier arrived at delivery location",
        "createdAt": "2026-02-19T11:10:00Z"
      },
      {
        "status": "delivered",
        "location": null,
        "notes": "Package delivered - code verified",
        "createdAt": "2026-02-19T11:15:00Z"
      }
    ]
  },
  "timestamp": "2026-02-19T12:00:00Z"
}
```

---

### 9. Update Delivery Status

**Endpoint**: `PUT /api/delivery/:id/status`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "status": "in_transit",
  "location": {
    "latitude": 6.4500,
    "longitude": 3.4000
  },
  "notes": "On the way to delivery location"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "in_transit",
      "updatedAt": "2026-02-19T10:51:00Z"
    },
    "message": "Delivery status updated successfully"
  },
  "timestamp": "2026-02-19T10:51:00Z"
}
```

---

### 10. Cancel Delivery

**Endpoint**: `POST /api/delivery/:id/cancel`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "reason": "Customer changed mind"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "cancelled",
      "cancelledAt": "2026-02-19T10:40:00Z"
    },
    "message": "Delivery cancelled successfully"
  },
  "timestamp": "2026-02-19T10:40:00Z"
}
```

---

### 11. Verify Pickup Code

**Endpoint**: `POST /api/delivery/:id/verify-pickup`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "code": "ABC123"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Pickup code verified successfully",
    "verified": true
  },
  "timestamp": "2026-02-19T10:50:00Z"
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid or expired pickup code",
  "timestamp": "2026-02-19T10:50:00Z"
}
```

---

### 12. Verify Delivery Code

**Endpoint**: `POST /api/delivery/:id/verify-delivery`

**Headers**:
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "code": "XYZ789"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery code verified successfully",
    "verified": true
  },
  "timestamp": "2026-02-19T11:15:00Z"
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid or expired delivery code",
  "timestamp": "2026-02-19T11:15:00Z"
}
```

---


## Courier Endpoints

### 14. Get Available Deliveries

**Endpoint**: `GET /api/delivery/courier/available`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>"
}
```

**Query Parameters**:
- `vehicleTypeId` (optional): Filter by vehicle type
- `regionId` (optional): Filter by region
- `limit` (optional): Number of records (default: 10)

**Example**: `GET /api/delivery/courier/available?vehicleTypeId=uuid&limit=5`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB0001",
        "pickupLocation": {
          "latitude": 6.5244,
          "longitude": 3.3792,
          "address": "123 Victoria Island, Lagos"
        },
        "dropoffLocation": {
          "latitude": 6.4281,
          "longitude": 3.4219,
          "address": "456 Lekki Phase 1, Lagos"
        },
        "estimatedFare": 1500,
        "distanceKm": 10.5,
        "deliveryType": "instant",
        "scheduledPickupAt": null,
        "createdAt": "2026-02-19T10:30:00Z"
      }
    ],
    "total": 5
  },
  "timestamp": "2026-02-19T10:35:00Z"
}
```

---

### 15. Accept Delivery

**Endpoint**: `POST /api/delivery/:id/accept`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**: (empty)
```json
{}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "assigned",
      "assignedAt": "2026-02-19T10:35:00Z"
    },
    "message": "Delivery accepted successfully"
  },
  "timestamp": "2026-02-19T10:35:00Z"
}
```

---

### 16. Arrived at Pickup

**Endpoint**: `POST /api/delivery/:id/arrived-pickup`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Arrival at pickup confirmed"
  },
  "timestamp": "2026-02-19T10:45:00Z"
}
```

---

### 17. Start Delivery

**Endpoint**: `POST /api/delivery/:id/start-delivery`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**: (empty)
```json
{}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery started successfully"
  },
  "timestamp": "2026-02-19T10:51:00Z"
}
```

---

### 18. Arrived at Delivery Location

**Endpoint**: `POST /api/delivery/:id/arrived-delivery`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "location": {
    "latitude": 6.4281,
    "longitude": 3.4219
  }
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Arrival at delivery location confirmed"
  },
  "timestamp": "2026-02-19T11:10:00Z"
}
```

---

### 19. Upload Pickup Photo

**Endpoint**: `POST /api/delivery/:id/pickup-photo`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "photoUrl": "https://storage.url/pickup-photo.jpg"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Pickup photo uploaded successfully"
  },
  "timestamp": "2026-02-19T10:50:00Z"
}
```

---

### 20. Upload Delivery Photo

**Endpoint**: `POST /api/delivery/:id/delivery-photo`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "photoUrl": "https://storage.url/delivery-photo.jpg"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery photo uploaded successfully"
  },
  "timestamp": "2026-02-19T11:15:00Z"
}
```

---

### 21. Get Courier Delivery History

**Endpoint**: `GET /api/delivery/courier/history`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>"
}
```

**Query Parameters**:
- `limit` (optional): Number of records (default: 20)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status

**Example**: `GET /api/delivery/courier/history?limit=10&status=delivered`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB0001",
        "status": "delivered",
        "recipientName": "John Doe",
        "pickupAddress": "123 Victoria Island, Lagos",
        "dropoffAddress": "456 Lekki Phase 1, Lagos",
        "estimatedFare": 1500,
        "finalFare": 1500,
        "currencyCode": "NGN",
        "deliveryType": "instant",
        "createdAt": "2026-02-19T10:30:00Z",
        "deliveredAt": "2026-02-19T11:15:00Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 10,
      "offset": 0
    }
  },
  "timestamp": "2026-02-19T12:00:00Z"
}
```

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Unauthorized",
  "timestamp": "2026-02-19T10:30:00Z"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": "Unauthorized access to delivery",
  "timestamp": "2026-02-19T10:30:00Z"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Delivery not found",
  "timestamp": "2026-02-19T10:30:00Z"
}
```

### 400 Bad Request
```json
{
  "success": false,
  "error": "Recipient name and phone are required",
  "timestamp": "2026-02-19T10:30:00Z"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to create delivery order",
  "timestamp": "2026-02-19T10:30:00Z"
}
```

---

## Testing Flow Sequence

### Complete Customer Journey:
1. Get available vehicle types → Choose vehicle type
2. Estimate delivery fare → Get fare breakdown
3. Generate package photo upload URL → Get signed URL
4. Upload photo directly to storage → Complete upload
5. Create delivery order (with photoUrl) → Get `deliveryId`, `pickupCode`, `deliveryCode`
6. (If card payment requires OTP) Validate payment → Complete payment
7. Get delivery details → Verify order created
8. Wait for courier assignment (status: `assigned`)
9. Track delivery status → Monitor progress
10. Get status history → View all status changes
11. Delivery completed → Verify final status

### Complete Courier Journey:
1. Get available deliveries → Find orders to accept
2. Accept delivery → Get assigned
3. Arrived at pickup → Update location
4. Verify pickup code → Confirm package pickup
5. Upload pickup photo → Document pickup
6. Start delivery → Begin transit
7. Arrived at delivery → Update location
8. Verify delivery code → Confirm delivery
9. Upload delivery photo → Document delivery
10. Get courier history → View completed deliveries

---

## Phase 2: Customer Delivery Flow Features

### Payment Methods
- **Wallet**: Immediate charge from customer wallet
- **Card**: Immediate charge with OTP validation support
- **Cash**: Payment collected on delivery

### Delivery Types
- **Instant**: Immediate courier matching and delivery
- **Scheduled**: Book delivery 1 hour to 7 days in advance (includes 200 NGN surcharge)

### Package Photo Upload
- Signed URL approach for direct client-to-storage upload
- Max file size: 5MB
- Supported formats: JPG, PNG
- Upload directly to Supabase Storage (no server bottleneck)
- Get signed URL first, then upload file, then use photoUrl in order creation

### Vehicle Types
- **Bicycle**: Eco-friendly, small packages (Base: 200 NGN, Per km: 50 NGN)
- **Bike**: Fast delivery, small packages (Base: 300 NGN, Per km: 80 NGN)
- **Car**: Standard delivery, medium packages (Base: 500 NGN, Per km: 100 NGN)
- **Truck**: Large delivery, bulky items (Base: 1000 NGN, Per km: 150 NGN)

### Authentication Codes
- **Pickup Code**: 6-digit alphanumeric (e.g., ABC123)
- **Delivery Code**: 6-digit alphanumeric (e.g., XYZ789)
- Verified by courier at pickup and delivery

### Order Number Format
- Format: ORDB + 4 digits
- Example: ORDB0001, ORDB0002, ORDB0003
- Auto-generated and unique

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- All monetary values are in NGN (Nigerian Naira)
- Authentication tokens expire after 24 hours
- Rate limiting: 100 requests per minute per user
- Region ID defaults to Lagos (00000000-0000-0000-0000-000000000001) if not provided
- Scheduled delivery: Min 1 hour, Max 7 days advance booking
- Package photo: Max 5MB, JPG/PNG only
- Payment is charged immediately for wallet/card, collected on delivery for cash


---


## Phase 3: Courier Matching & Pickup

### Overview
Phase 3 implements automatic courier matching, acceptance/rejection flow, and pickup verification.

---

### 1. Get Available Deliveries (Courier)

**Endpoint**: `GET /api/delivery/courier/available`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>"
}
```

**Query Parameters**:
- `vehicleTypeId` (optional): Filter by vehicle type
- `regionId` (optional): Filter by region
- `limit` (optional): Number of results (default: 10)

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB0001",
        "pickupLocation": {
          "latitude": 6.5244,
          "longitude": 3.3792,
          "address": "123 Victoria Island, Lagos"
        },
        "dropoffLocation": {
          "latitude": 6.4281,
          "longitude": 3.4219,
          "address": "456 Lekki Phase 1, Lagos"
        },
        "estimatedFare": 1500.00,
        "distanceKm": 8.5,
        "deliveryType": "instant",
        "scheduledPickupAt": null,
        "createdAt": "2026-02-20T10:00:00Z"
      }
    ],
    "total": 5
  }
}
```

---

### 2. Accept Delivery (Courier)

**Endpoint**: `POST /api/delivery/:id/accept`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**: Empty `{}`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "assigned",
      "assignedAt": "2026-02-20T10:05:00Z"
    },
    "message": "Delivery accepted successfully"
  }
}
```

**Error Response** (400 Bad Request) - Already Assigned:
```json
{
  "success": false,
  "error": "This delivery has already been assigned to another courier",
  "timestamp": "2026-02-20T10:05:00Z"
}
```

**Error Response** (400 Bad Request) - Not Enabled:
```json
{
  "success": false,
  "error": "Your driver profile is not enabled for deliveries.",
  "timestamp": "2026-02-20T10:05:00Z"
}
```

---

### 3. Reject Delivery (Courier)

**Endpoint**: `POST /api/delivery/:id/reject`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "reason": "Too far from current location"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery rejected successfully"
  }
}
```

---

### 4. Arrived at Pickup Location

**Endpoint**: `POST /api/delivery/:id/arrived-pickup`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Arrival at pickup confirmed"
  }
}
```

---

### 5. Verify Pickup Code

**Endpoint**: `POST /api/delivery/:id/verify-pickup`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "code": "ABC123"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Pickup code verified successfully",
    "verified": true
  }
}
```

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "error": "Invalid or expired pickup code",
  "timestamp": "2026-02-20T10:15:00Z"
}
```

---

### 6. Upload Pickup Photo (Optional)

**Endpoint**: `POST /api/delivery/:id/pickup-photo`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "photoUrl": "https://storage.supabase.co/..."
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Pickup photo uploaded successfully"
  }
}
```

---

### 7. Start Delivery (After Pickup)

**Endpoint**: `POST /api/delivery/:id/start-delivery`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**: Empty `{}`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery started successfully"
  }
}
```

---

### 8. Arrived at Delivery Location

**Endpoint**: `POST /api/delivery/:id/arrived-delivery`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "location": {
    "latitude": 6.4281,
    "longitude": 3.4219
  }
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Arrival at delivery location confirmed"
  }
}
```

---

### 9. Verify Delivery Code

**Endpoint**: `POST /api/delivery/:id/verify-delivery`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "code": "XYZ789"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery code verified successfully",
    "verified": true
  }
}
```

---

### 10. Upload Delivery Photo (Optional)

**Endpoint**: `POST /api/delivery/:id/delivery-photo`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "photoUrl": "https://storage.supabase.co/..."
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Delivery photo uploaded successfully"
  }
}
```

---

### 11. Get Courier Delivery History

**Endpoint**: `GET /api/delivery/courier/history`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>"
}
```

**Query Parameters**:
- `limit` (optional): Number of results (default: 20)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "orderNumber": "ORDB0001",
        "status": "delivered",
        "recipientName": "John Doe",
        "pickupAddress": "123 Victoria Island, Lagos",
        "dropoffAddress": "456 Lekki Phase 1, Lagos",
        "estimatedFare": 1500.00,
        "finalFare": 1500.00,
        "currencyCode": "NGN",
        "deliveryType": "instant",
        "createdAt": "2026-02-20T10:00:00Z",
        "deliveredAt": "2026-02-20T11:30:00Z"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 20,
      "offset": 0
    }
  }
}
```

---

## Phase 3 Features

### Automatic Courier Matching
- System automatically finds nearby couriers when delivery is created
- Matches based on:
  - Distance from pickup (15km radius)
  - Service types (must have "delivery" in service_types)
  - Courier rating and experience
  - Vehicle availability
- Sends requests to top 5 couriers simultaneously
- 10-minute timeout per batch
- Re-matches with next batch if no acceptance

### Service Types
Drivers can provide multiple service types during registration:
- `["ride"]` - Only receives ride requests
- `["delivery"]` - Only receives delivery requests
- `["ride", "delivery"]` - Receives both ride and delivery requests

### Courier Eligibility
- Must have `"delivery"` in `service_types` array
- Status must be `approved` or `active`
- Must be online and available
- No vehicle type filtering - any vehicle can do deliveries

### Delivery Status Flow
```
pending → searching → assigned → arrived_pickup → picked_up → 
in_transit → arrived_delivery → delivered
```

### Socket.IO Events (Real-time)
- `delivery:request:new` - New delivery request to courier
- `delivery:status:updated` - Status update to customer/courier
- `delivery:no_couriers_available` - No couriers found

### Timeout & Re-matching
- Each batch has 10-minute timeout
- If no acceptance, system tries next batch of 5 couriers
- Continues until all available couriers exhausted
- If no couriers available, status becomes `no_couriers_available`

---

## Complete Delivery Flow (Phase 1-3)

### Customer Flow:
1. Get vehicle types → Choose vehicle
2. Estimate fare → See cost breakdown
3. Generate signed URL → Upload package photo (optional)
4. Create delivery order → Payment processed
5. System searches for courier → Status: `searching`
6. Courier accepts → Status: `assigned`
7. Courier arrives at pickup → Status: `arrived_pickup`
8. Courier verifies pickup code → Status: `picked_up`
9. Courier starts delivery → Status: `in_transit`
10. Courier arrives at delivery → Status: `arrived_delivery`
11. Recipient verifies delivery code → Status: `delivered`
12. View delivery history

### Courier Flow:
1. Receive delivery request (Socket.IO notification)
2. View available deliveries
3. Accept or reject delivery
4. Navigate to pickup location
5. Arrive at pickup → Update status
6. Verify pickup code with customer
7. Upload pickup photo (optional)
8. Start delivery
9. Navigate to delivery location
10. Arrive at delivery → Update status
11. Verify delivery code with recipient
12. Upload delivery photo (optional)
13. View delivery history and earnings

---


---

## Phase 4: Delivery Completion & Tracking

### 1. Track Delivery in Real-Time

**Endpoint**: `GET /api/delivery/:id/track`

**Headers**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**Example**: `GET /api/delivery/550e8400-e29b-41d4-a716-446655440000/track`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "orderNumber": "ORDB0001",
      "status": "in_transit",
      "pickupLocation": {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "address": "123 Pickup Street, Lagos"
      },
      "dropoffLocation": {
        "latitude": 6.4281,
        "longitude": 3.4219,
        "address": "456 Delivery Avenue, Lagos"
      }
    },
    "courier": {
      "id": "courier-uuid",
      "name": "John Doe",
      "phone": "+2348012345678",
      "rating": 4.8,
      "currentLocation": {
        "latitude": 6.5000,
        "longitude": 3.4000,
        "heading": 45,
        "speed": 30,
        "timestamp": "2026-02-23T10:30:00Z"
      },
      "vehicle": {
        "plateNumber": "ABC-123-XY",
        "make": "Toyota",
        "model": "Corolla",
        "color": "Blue"
      }
    },
    "eta": {
      "minutes": 15,
      "distance": 5.2,
      "lastUpdated": "2026-02-23T10:30:00Z"
    }
  }
}
```

**Notes**:
- ETA updates in real-time as courier moves
- Uses Google Maps Distance Matrix API for accurate ETA
- Falls back to Haversine calculation if API unavailable
- Both customer and courier can access this endpoint

---

### 2. Update Courier Location (Courier Only)

**Endpoint**: `POST /api/delivery/courier/location`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "latitude": 6.5000,
  "longitude": 3.4000,
  "heading": 45,
  "speed": 30
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Location updated successfully"
  }
}
```

**Notes**:
- Should be called every 10 seconds by courier app
- Broadcasts location update to customer via WebSocket
- Updates ETA automatically

---

### 3. Customer Rates Courier

**Endpoint**: `POST /api/delivery/:id/rate-courier`

**Headers**:
```json
{
  "Authorization": "Bearer <customer_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "stars": 5,
  "feedback": "Excellent service! Very professional and on time."
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Courier rated successfully"
  }
}
```

**Validation**:
- `stars`: Required, must be between 1 and 5
- `feedback`: Optional, string
- Delivery must be completed
- Customer can only rate once (cannot edit)

---

### 4. Courier Rates Customer

**Endpoint**: `POST /api/delivery/:id/rate-customer`

**Headers**:
```json
{
  "Authorization": "Bearer <courier_token>",
  "Content-Type": "application/json"
}
```

**Request Body**:
```json
{
  "stars": 5,
  "feedback": "Great customer, easy to communicate with."
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Customer rated successfully"
  }
}
```

**Validation**:
- `stars`: Required, must be between 1 and 5
- `feedback`: Optional, string
- Delivery must be completed
- Courier can only rate once (cannot edit)

---

### 5. Get Delivery Rating

**Endpoint**: `GET /api/delivery/:id/rating`

**Headers**:
```json
{
  "Authorization": "Bearer <token>"
}
```

**Example**: `GET /api/delivery/550e8400-e29b-41d4-a716-446655440000/rating`

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "rating": {
      "courierRating": 5,
      "courierFeedback": "Excellent service! Very professional and on time.",
      "courierRatedAt": "2026-02-23T11:00:00Z",
      "customerRating": 5,
      "customerFeedback": "Great customer, easy to communicate with.",
      "customerRatedAt": "2026-02-23T11:05:00Z"
    }
  }
}
```

**Notes**:
- Returns null values for ratings not yet submitted
- Both customer and courier can view ratings
- Rating is not mandatory

---

## Phase 4 Complete Flow

### Customer Journey:
1. Create delivery order (Phase 2)
2. Courier accepts and picks up package (Phase 3)
3. **Track delivery in real-time** → `GET /api/delivery/:id/track`
4. Receive notifications:
   - "En route to delivery" (when courier starts delivery)
   - "Arrived at delivery" (when courier arrives)
5. Verify delivery code (Phase 3)
6. **Rate courier** → `POST /api/delivery/:id/rate-courier`

### Courier Journey:
1. Accept delivery request (Phase 3)
2. Arrive at pickup and verify code (Phase 3)
3. **Update location every 10 seconds** → `POST /api/delivery/courier/location`
4. Start delivery → `POST /api/delivery/:id/start-delivery`
5. Arrive at delivery location → `POST /api/delivery/:id/arrived-delivery`
6. Customer verifies delivery code
7. **Receive earnings** (automatically calculated)
8. **Rate customer** → `POST /api/delivery/:id/rate-customer`

---

## Payment & Earnings (Phase 4)

### Automatic Payment Completion
When delivery code is verified:
- **Cash payments**: Transaction record created, payment status set to "completed"
- **Wallet/Card payments**: Already charged, status updated to "completed"

### Earnings Calculation
```
Total Fare = estimated_fare (from delivery)
Platform Earnings = service_fee + rounding_fee (from delivery_fare_config table)
Courier Earnings = Total Fare - Platform Earnings
```

**Service Fees by Vehicle Type** (configurable by admin):
- Bicycle: ₦200
- Bike: ₦300
- Car: ₦500
- Truck: ₦700

**Example**:
- Total Fare: ₦1,500
- Service Fee (Bike): ₦300
- Rounding Fee: ₦0
- Platform Earnings: ₦300
- Courier Earnings: ₦1,200

**Note**: Service fees and rounding fees are stored in the `delivery_fare_config` table and are configurable per vehicle type per region by admins.

### Courier Earnings Tracking
- `total_delivery_earnings`: Cumulative earnings from all deliveries
- `delivery_rating`: Average rating from customers
- `total_deliveries`: Total completed deliveries

---

## WebSocket Events (Phase 4)

### Real-Time Location Updates
**Event**: `delivery:location:updated`

**Payload**:
```json
{
  "deliveryId": "550e8400-e29b-41d4-a716-446655440000",
  "location": {
    "latitude": 6.5000,
    "longitude": 3.4000,
    "heading": 45,
    "speed": 30,
    "timestamp": "2026-02-23T10:30:00Z"
  }
}
```

**Frequency**: Every 10 seconds (when courier updates location)

**Recipients**: Customer only

---

## Error Codes (Phase 4)

| Code | Message | Description |
|------|---------|-------------|
| `DELIVERY_NOT_COMPLETED` | Delivery not completed | Cannot rate before delivery is completed |
| `UNAUTHORIZED` | Unauthorized | User not authorized to rate this delivery |
| `RATING_EXISTS` | Already rated | User has already submitted a rating |
| `INVALID_RATING` | Invalid rating | Rating must be between 1 and 5 stars |

---

## Testing Checklist - Phase 4

### Tracking
- [ ] Customer can track delivery in real-time
- [ ] Courier can track delivery
- [ ] ETA updates as courier moves
- [ ] Location updates broadcast via WebSocket
- [ ] Courier location updates every 10 seconds

### Ratings
- [ ] Customer can rate courier after delivery
- [ ] Courier can rate customer after delivery
- [ ] Cannot rate before delivery is completed
- [ ] Cannot rate twice (no editing)
- [ ] Rating is optional (not mandatory)
- [ ] Courier's average rating updates automatically

### Payment & Earnings
- [ ] Cash payment completed when delivery code verified
- [ ] Courier earnings calculated correctly
- [ ] Platform earnings calculated correctly
- [ ] Total delivery earnings updated
- [ ] Payment status set to "completed"

### Notifications
- [ ] "En route to delivery" sent when courier starts delivery
- [ ] "Arrived at delivery" sent when courier arrives
- [ ] "Delivery completed" sent when code verified

---

## Service Channel ID
**Delivery Service**: `91f84fab-1252-47e1-960a-e498daa91c35`

---

## Notes
- All timestamps are in ISO 8601 format (UTC)
- All monetary values are in the region's currency (NGN for Lagos)
- Rating is optional and not mandatory for completing delivery flow
- Ratings cannot be edited after submission
- Platform earnings come from service_fee and rounding_fee stored in `delivery_fare_config` table (configurable per vehicle type per region by admin)
- Service fees: Bicycle (₦200), Bike (₦300), Car (₦500), Truck (₦700)
- Courier location updates trigger real-time ETA recalculation
