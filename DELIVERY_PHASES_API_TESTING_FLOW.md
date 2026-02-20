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

### 13. Upload Package Photo (Deprecated - Use Signed URL Instead)

**Endpoint**: `POST /api/delivery/upload-photo`

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
  "photoUrl": "https://storage.url/package-photo.jpg"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Photo upload endpoint - integrate with storage service",
    "photoUrl": "https://placeholder.com/photo.jpg"
  },
  "timestamp": "2026-02-19T10:30:00Z"
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

