# Complete Frontend Integration Guide for Delivery System

**Target Platform:** React Native  
**Base URL:** `http://localhost:3001/api/delivery`  
**Authentication:** All endpoints require JWT token in `Authorization: Bearer <token>` header

---

## Table of Contents

1. [Customer Endpoints](#customer-endpoints)
2. [Courier Endpoints](#courier-endpoints)
3. [Shared Endpoints](#shared-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Error Response Format](#error-response-format)
6. [Important Notes](#important-notes)

---

## Customer Endpoints

### 1. Get Available Vehicle Types

**Endpoint:** `GET /api/delivery/vehicle-types`

**Query Parameters:**
- `regionId` (optional, string) - Defaults to Lagos: `00000000-0000-0000-0000-000000000001`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "vehicleTypes": [
      {
        "id": "uuid",
        "name": "bicycle",
        "displayName": "Bicycle",
        "iconUrl": "https://...",
        "description": "Small packages",
        "maxWeight": 5,
        "maxDimensions": "30x30x30 cm",
        "baseFare": "500.00",
        "perKmRate": "50.00",
        "serviceFee": "200.00"
      }
    ],
    "message": "Vehicle types retrieved successfully"
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```


### 2. Estimate Delivery Fare

**Endpoint:** `POST /api/delivery/estimate-fare`

**Request Body:**
```json
{
  "vehicleTypeId": "uuid",
  "regionId": "uuid (optional, defaults to Lagos)",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219
  },
  "deliveryType": "instant | scheduled"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "fareBreakdown": {
      "baseFare": 500.00,
      "distanceFare": 450.00,
      "serviceFee": 200.00,
      "roundingFee": 50.00,
      "finalFare": 1200.00,
      "distance": 9.5,
      "currencyCode": "NGN"
    },
    "message": "Fare estimated successfully"
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Vehicle type, pickup and dropoff locations are required",
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```


### 3. Generate Package Photo Upload URL

**Endpoint:** `POST /api/delivery/upload/package-photo`

**Request Body:**
```json
{
  "fileName": "package-photo.jpg",
  "fileType": "image/jpeg",
  "fileSize": 1024000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://signed-url-to-upload",
    "photoUrl": "https://public-url-of-photo",
    "filePath": "deliveries/package-photos/customer-id/filename.jpg",
    "expiresIn": 3600,
    "maxFileSize": 5242880,
    "message": "Upload URL generated successfully"
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "fileName, fileType, and fileSize are required",
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Usage Flow:**
1. Call this endpoint to get signed upload URL
2. Upload image directly to the signed URL using PUT request
3. Use the `photoUrl` in the create delivery request


### 4. Create Delivery Order

**Endpoint:** `POST /api/delivery/order`

**Request Body:**
```json
{
  "recipientName": "John Doe",
  "recipientPhone": "+2348012345678",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "111 Ketu, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219,
    "address": "222 Yaba Phase 1, Lagos"
  },
  "packageDescription": "Electronics",
  "packagePhotoUrl": "https://...",
  "vehicleTypeId": "uuid",
  "deliveryType": "instant | scheduled",
  "scheduledPickupAt": "2026-02-28T14:00:00Z (required if scheduled)",
  "paymentMethod": "cash | wallet | card",
  "cardId": "uuid (optional, for saved cards)",
  "cardDetails": {
    "cardNumber": "5531886652142950",
    "cvv": "564",
    "expiryMonth": "09",
    "expiryYear": "32",
    "cardholderName": "John Doe (optional)",
    "pin": "3310 (optional)"
  },
  "regionId": "uuid (optional, defaults to Lagos)"
}
```

**Success Response - No OTP Required (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "searching",
      "pickupCode": "123456",
      "deliveryCode": "654321",
      "estimatedFare": "1200.00",
      "currencyCode": "NGN",
      "deliveryType": "instant",
      "scheduledPickupAt": null,
      "packagePhotoUrl": "https://...",
      "createdAt": "2026-02-27T10:00:00.000Z"
    },
    "fareBreakdown": {
      "baseFare": 500.00,
      "distanceFare": 450.00,
      "serviceFee": 200.00,
      "roundingFee": 50.00,
      "finalFare": 1200.00,
      "distance": 9.5,
      "currencyCode": "NGN"
    },
    "message": "Delivery order created successfully. Searching for courier..."
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```


**Success Response - OTP Required (200):**
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
      "mode": "pin | otp",
      "fields": ["pin"]
    },
    "flw_ref": "FLW-REF-123",
    "tx_ref": "TX-REF-123",
    "message": "Please enter your card PIN to complete payment"
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Recipient name and phone are required",
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Validation Rules:**
- `recipientName` and `recipientPhone` are required
- `pickupLocation` and `dropoffLocation` must have latitude, longitude
- `vehicleTypeId` is required
- `deliveryType` must be "instant" or "scheduled"
- If `deliveryType` is "scheduled", `scheduledPickupAt` is required
- `paymentMethod` must be "cash", "wallet", or "card"
- If `paymentMethod` is "card", either `cardId` or `cardDetails` is required


### 5. Validate Card Payment with OTP

**Endpoint:** `POST /api/delivery/:id/validate-payment`

**Request Body:**
```json
{
  "flw_ref": "FLW-REF-123",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "searching",
      "pickupCode": "123456",
      "deliveryCode": "654321"
    },
    "message": "Payment validated and delivery confirmed"
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Flutterwave reference and OTP are required",
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```


### 6. Get Delivery Details

**Endpoint:** `GET /api/delivery/:id`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "in_transit",
      "recipientName": "John Doe",
      "recipientPhone": "+2348012345678",
      "pickupLocation": {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "address": "111 Ketu, Lagos"
      },
      "dropoffLocation": {
        "latitude": 6.4281,
        "longitude": 3.4219,
        "address": "222 Yaba Phase 1, Lagos"
      },
      "packageDescription": "Electronics",
      "packagePhotoUrl": "https://...",
      "pickupPhotoUrl": "https://...",
      "deliveryPhotoUrl": "https://...",
      "vehicleType": {
        "id": "uuid",
        "name": "bicycle",
        "displayName": "Bicycle",
        "iconUrl": "https://..."
      },
      "deliveryType": "instant",
      "scheduledPickupAt": null,
      "estimatedFare": 1200.00,
      "finalFare": 1200.00,
      "currencyCode": "NGN",
      "distanceKm": "9.50",
      "paymentMethod": "cash",
      "paymentStatus": "pending",
      "courier": {
        "id": "uuid",
        "user_id": "uuid",
        "license_number": "ABC123",
        "rating": "4.80",
        "total_deliveries": 150,
        "delivery_rating": "4.75"
      },
      "pickupCode": "123456",
      "deliveryCode": "654321",
      "createdAt": "2026-02-27T10:00:00.000Z",
      "assignedAt": "2026-02-27T10:05:00.000Z",
      "pickedUpAt": "2026-02-27T10:15:00.000Z",
      "deliveredAt": null,
      "cancelledAt": null
    }
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": "Unauthorized access to delivery",
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Notes:**
- `pickupCode` and `deliveryCode` are only visible to the customer
- Courier can see delivery details but not the codes


### 7. Get Customer Delivery History

**Endpoint:** `GET /api/delivery/history`

**Query Parameters:**
- `limit` (optional, number) - Default: 20
- `offset` (optional, number) - Default: 0
- `status` (optional, string) - Filter by status

**Success Response (200):**
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
        "pickupAddress": "111 Ketu, Lagos",
        "dropoffAddress": "222 Yaba Phase 1, Lagos",
        "estimatedFare": 1200.00,
        "finalFare": 1200.00,
        "currencyCode": "NGN",
        "vehicleType": {
          "id": "uuid",
          "name": "bicycle",
          "displayName": "Bicycle"
        },
        "deliveryType": "instant",
        "createdAt": "2026-02-27T10:00:00.000Z",
        "deliveredAt": "2026-02-27T11:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 50,
      "limit": 20,
      "offset": 0
    }
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```


### 8. Cancel Delivery

**Endpoint:** `POST /api/delivery/:id/cancel`

**Request Body:**
```json
{
  "reason": "Changed my mind"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "cancelled",
      "cancelledAt": "2026-02-27T10:30:00.000Z"
    },
    "message": "Delivery cancelled successfully"
  },
  "timestamp": "2026-02-27T10:30:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Delivery cannot be cancelled",
  "timestamp": "2026-02-27T10:30:00.000Z"
}
```

**Notes:**
- Cannot cancel deliveries with status "delivered" or "cancelled"
- Payment will be refunded automatically


### 9. Track Delivery in Real-Time

**Endpoint:** `GET /api/delivery/:id/track`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "orderNumber": "ORDB0001",
      "status": "in_transit",
      "pickupLocation": {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "address": "111 Ketu, Lagos"
      },
      "dropoffLocation": {
        "latitude": 6.4281,
        "longitude": 3.4219,
        "address": "222 Yaba Phase 1, Lagos"
      }
    },
    "courier": {
      "id": "uuid",
      "name": "Holy Spirit",
      "phone": "+2348012345678",
      "rating": 4.8,
      "vehicle": {
        "plateNumber": "ABC123",
        "make": "Honda",
        "model": "CB125",
        "color": "Red"
      },
      "location": {
        "latitude": 6.5100,
        "longitude": 3.3800,
        "heading": 45.5,
        "speed": 30.0,
        "updatedAt": "2026-02-27T10:25:00.000Z"
      },
      "eta": {
        "minutes": 15,
        "distance": 5.2,
        "arrivalTime": "2026-02-27T10:40:00.000Z"
      }
    }
  },
  "timestamp": "2026-02-27T10:25:00.000Z"
}
```

**Notes:**
- `courier` object is only present when courier is assigned
- `vehicle` is only present if courier has registered vehicle
- `location` is only present if courier has updated location
- `eta` is only present if location data exists
- Poll this endpoint every 10 seconds for real-time updates


### 10. Rate Courier (Customer Rates Courier)

**Endpoint:** `POST /api/delivery/:id/rate-courier`

**Request Body:**
```json
{
  "stars": 5,
  "feedback": "Excellent service!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Courier rated successfully"
  },
  "timestamp": "2026-02-27T11:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Rating must be between 1 and 5 stars",
  "timestamp": "2026-02-27T11:00:00.000Z"
}
```

**Notes:**
- `stars` must be between 1 and 5
- `feedback` is optional
- Rating is optional (not mandatory)
- Cannot edit rating after submission


### 11. Get Delivery Rating

**Endpoint:** `GET /api/delivery/:id/rating`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "rating": {
      "courierRating": {
        "stars": 5,
        "feedback": "Excellent service!",
        "createdAt": "2026-02-27T11:00:00.000Z"
      },
      "customerRating": {
        "stars": 4,
        "feedback": "Good customer",
        "createdAt": "2026-02-27T11:05:00.000Z"
      }
    }
  },
  "timestamp": "2026-02-27T11:10:00.000Z"
}
```

**Notes:**
- `courierRating` is null if customer hasn't rated courier
- `customerRating` is null if courier hasn't rated customer
- Both ratings are optional

---

## Courier Endpoints

### 1. Get Available Deliveries

**Endpoint:** `GET /api/delivery/courier/available`

**Query Parameters:**
- `vehicleTypeId` (optional, string) - Filter by vehicle type
- `regionId` (optional, string) - Filter by region
- `limit` (optional, number) - Default: 10

**Success Response (200):**
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
          "address": "111 Ketu, Lagos"
        },
        "dropoffLocation": {
          "latitude": 6.4281,
          "longitude": 3.4219,
          "address": "222 Yaba Phase 1, Lagos"
        },
        "estimatedFare": 1200.00,
        "distanceKm": "9.50",
        "deliveryType": "instant",
        "scheduledPickupAt": null,
        "createdAt": "2026-02-27T10:00:00.000Z"
      }
    ],
    "total": 5
  },
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

**Notes:**
- Only shows deliveries with status "pending" or "searching"
- Driver must have "delivery" in service_types array
- Driver status must be "active" or "approved"


### 2. Accept Delivery

**Endpoint:** `POST /api/delivery/:id/accept`

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "assigned",
      "assignedAt": "2026-02-27T10:05:00.000Z"
    },
    "courier": {
      "name": "Holy Spirit",
      "phone": "+2348012345678",
      "rating": 4.8,
      "vehicle": {
        "plateNumber": "ABC123",
        "make": "Honda",
        "model": "CB125",
        "color": "Red"
      }
    },
    "message": "Delivery accepted successfully"
  },
  "timestamp": "2026-02-27T10:05:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "This delivery has already been assigned to another courier",
  "timestamp": "2026-02-27T10:05:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Your driver profile is not enabled for deliveries.",
  "timestamp": "2026-02-27T10:05:00.000Z"
}
```

**Notes:**
- Driver must have completed registration
- Driver status must be "active" or "approved"
- Driver must have "delivery" in service_types array
- Only one courier can accept a delivery


### 3. Reject Delivery

**Endpoint:** `POST /api/delivery/:id/reject`

**Request Body:**
```json
{
  "reason": "Too far from my location"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Delivery rejected successfully"
  },
  "timestamp": "2026-02-27T10:05:00.000Z"
}
```

**Notes:**
- `reason` is optional
- Delivery will remain available for other couriers


### 4. Arrived at Pickup Location

**Endpoint:** `POST /api/delivery/:id/arrived-pickup`

**Request Body:**
```json
{
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Arrival at pickup confirmed"
  },
  "timestamp": "2026-02-27T10:10:00.000Z"
}
```

**Notes:**
- Updates delivery status to "arrived_pickup"
- Sends notification to customer
- `location` is optional


### 5. Verify Pickup Code

**Endpoint:** `POST /api/delivery/:id/verify-pickup`

**Request Body:**
```json
{
  "code": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Pickup code verified successfully",
    "verified": true
  },
  "timestamp": "2026-02-27T10:15:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid or expired pickup code",
  "timestamp": "2026-02-27T10:15:00.000Z"
}
```

**Notes:**
- Updates delivery status to "picked_up"
- Sends notification to customer
- Customer provides this code to courier


### 6. Upload Pickup Photo

**Endpoint:** `POST /api/delivery/:id/pickup-photo`

**Request Body:**
```json
{
  "photoUrl": "https://storage-url/photo.jpg"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Pickup photo uploaded successfully"
  },
  "timestamp": "2026-02-27T10:16:00.000Z"
}
```

**Notes:**
- Upload photo to storage first, then provide URL
- Photo serves as proof of pickup


### 7. Start Delivery (After Pickup)

**Endpoint:** `POST /api/delivery/:id/start-delivery`

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Delivery started successfully"
  },
  "timestamp": "2026-02-27T10:17:00.000Z"
}
```

**Notes:**
- Updates delivery status to "in_transit"
- Sends notification to customer


### 8. Update Courier Location

**Endpoint:** `POST /api/delivery/courier/location`

**Request Body:**
```json
{
  "latitude": 6.5100,
  "longitude": 3.3800,
  "heading": 45.5,
  "speed": 30.0
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Location updated successfully"
  },
  "timestamp": "2026-02-27T10:20:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Latitude and longitude are required",
  "timestamp": "2026-02-27T10:20:00.000Z"
}
```

**Notes:**
- `latitude` and `longitude` are required
- `heading` and `speed` are optional
- Update location every 10 seconds during active delivery
- Creates new location record (location history)


### 9. Arrived at Delivery Location

**Endpoint:** `POST /api/delivery/:id/arrived-delivery`

**Request Body:**
```json
{
  "location": {
    "latitude": 6.4281,
    "longitude": 3.4219
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Arrival at delivery location confirmed"
  },
  "timestamp": "2026-02-27T10:35:00.000Z"
}
```

**Notes:**
- Updates delivery status to "arrived_delivery"
- Sends notification to customer
- `location` is optional


### 10. Verify Delivery Code

**Endpoint:** `POST /api/delivery/:id/verify-delivery`

**Request Body:**
```json
{
  "code": "654321"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Delivery completed successfully",
    "verified": true
  },
  "timestamp": "2026-02-27T10:40:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid or expired delivery code",
  "timestamp": "2026-02-27T10:40:00.000Z"
}
```

**Notes:**
- Updates delivery status to "delivered"
- Completes cash payment if payment method is cash
- Calculates and records courier earnings
- Platform earnings = service_fee + rounding_fee
- Courier earnings = total fare - platform earnings
- Updates courier's delivery rating via database trigger
- Sends completion notification to customer
- Recipient provides this code to courier


### 11. Upload Delivery Photo

**Endpoint:** `POST /api/delivery/:id/delivery-photo`

**Request Body:**
```json
{
  "photoUrl": "https://storage-url/photo.jpg"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Delivery photo uploaded successfully"
  },
  "timestamp": "2026-02-27T10:41:00.000Z"
}
```

**Notes:**
- Upload photo to storage first, then provide URL
- Photo serves as proof of delivery


### 12. Rate Customer (Courier Rates Customer)

**Endpoint:** `POST /api/delivery/:id/rate-customer`

**Request Body:**
```json
{
  "stars": 4,
  "feedback": "Good customer"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Customer rated successfully"
  },
  "timestamp": "2026-02-27T11:05:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Rating must be between 1 and 5 stars",
  "timestamp": "2026-02-27T11:05:00.000Z"
}
```

**Notes:**
- `stars` must be between 1 and 5
- `feedback` is optional
- Rating is optional (not mandatory)
- Cannot edit rating after submission


### 13. Get Courier Delivery History

**Endpoint:** `GET /api/delivery/courier/history`

**Query Parameters:**
- `limit` (optional, number) - Default: 20
- `offset` (optional, number) - Default: 0
- `status` (optional, string) - Filter by status

**Success Response (200):**
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
        "pickupAddress": "111 Ketu, Lagos",
        "dropoffAddress": "222 Yaba Phase 1, Lagos",
        "estimatedFare": 1200.00,
        "finalFare": 1200.00,
        "currencyCode": "NGN",
        "deliveryType": "instant",
        "createdAt": "2026-02-27T10:00:00.000Z",
        "deliveredAt": "2026-02-27T11:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 20,
      "offset": 0
    }
  },
  "timestamp": "2026-02-27T11:00:00.000Z"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Driver profile not found. Please complete driver registration first.",
  "timestamp": "2026-02-27T11:00:00.000Z"
}
```

---

## Shared Endpoints

### 1. Get Delivery Status History

**Endpoint:** `GET /api/delivery/:id/history`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "status": "pending",
        "location": null,
        "notes": "Delivery order created and payment processed",
        "createdAt": "2026-02-27T10:00:00.000Z"
      },
      {
        "status": "searching",
        "location": null,
        "notes": "Searching for courier",
        "createdAt": "2026-02-27T10:01:00.000Z"
      },
      {
        "status": "assigned",
        "location": null,
        "notes": "Courier assigned",
        "createdAt": "2026-02-27T10:05:00.000Z"
      }
    ]
  },
  "timestamp": "2026-02-27T10:30:00.000Z"
}
```

**Notes:**
- Available to both customer and courier
- Shows complete status timeline


### 2. Update Delivery Status (Generic)

**Endpoint:** `PUT /api/delivery/:id/status`

**Request Body:**
```json
{
  "status": "in_transit",
  "location": {
    "latitude": 6.5100,
    "longitude": 3.3800
  },
  "notes": "On the way"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "delivery": {
      "id": "uuid",
      "status": "in_transit",
      "updatedAt": "2026-02-27T10:20:00.000Z"
    },
    "message": "Delivery status updated successfully"
  },
  "timestamp": "2026-02-27T10:20:00.000Z"
}
```

**Notes:**
- Generic status update endpoint
- Use specific endpoints (arrived-pickup, start-delivery, etc.) when available
- `location` and `notes` are optional

---

## WebSocket Events

**Connection URL:** `ws://localhost:3001`

**Authentication:** Send JWT token after connection

### Events for Customer

**1. delivery:assigned**
```json
{
  "event": "delivery:assigned",
  "data": {
    "deliveryId": "uuid",
    "orderNumber": "ORDB0001",
    "courier": {
      "id": "uuid",
      "name": "Holy Spirit",
      "phone": "+2348012345678",
      "rating": 4.8,
      "vehicle": {
        "plateNumber": "ABC123",
        "make": "Honda",
        "model": "CB125",
        "color": "Red"
      }
    }
  }
}
```

**2. delivery:status_update**
```json
{
  "event": "delivery:status_update",
  "data": {
    "deliveryId": "uuid",
    "status": "in_transit",
    "message": "Your package is on the way"
  }
}
```

**3. delivery:location_update**
```json
{
  "event": "delivery:location_update",
  "data": {
    "deliveryId": "uuid",
    "location": {
      "latitude": 6.5100,
      "longitude": 3.3800,
      "heading": 45.5,
      "speed": 30.0
    },
    "eta": {
      "minutes": 15,
      "distance": 5.2
    }
  }
}
```


### Events for Courier

**1. delivery:new_request**
```json
{
  "event": "delivery:new_request",
  "data": {
    "deliveryId": "uuid",
    "orderNumber": "ORDB0001",
    "pickupLocation": {
      "latitude": 6.5244,
      "longitude": 3.3792,
      "address": "111 Ketu, Lagos"
    },
    "dropoffLocation": {
      "latitude": 6.4281,
      "longitude": 3.4219,
      "address": "222 Yaba Phase 1, Lagos"
    },
    "estimatedFare": 1200.00,
    "distanceKm": 9.5,
    "expiresAt": "2026-02-27T10:10:00.000Z"
  }
}
```

**2. delivery:request_expired**
```json
{
  "event": "delivery:request_expired",
  "data": {
    "deliveryId": "uuid",
    "message": "Delivery request has expired"
  }
}
```

**3. delivery:accepted_by_another**
```json
{
  "event": "delivery:accepted_by_another",
  "data": {
    "deliveryId": "uuid",
    "message": "This delivery was accepted by another courier"
  }
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong",
  "timestamp": "2026-02-27T10:00:00.000Z"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation error, invalid input)
- `401` - Unauthorized (missing or invalid JWT token)
- `403` - Forbidden (user doesn't have access to resource)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error


---

## Important Notes

### Delivery Status Flow

```
pending → searching → assigned → arrived_pickup → picked_up → 
in_transit → arrived_delivery → delivered
```

**Alternative flows:**
- `pending → cancelled` (customer cancels before assignment)
- `searching → no_couriers_available` (no couriers found)
- `searching → matching_failed` (matching system error)

### Service Types

Drivers can have one or both service types:
- `["ride"]` - Only ride-hailing
- `["delivery"]` - Only delivery
- `["ride", "delivery"]` - Both services

Only drivers with `"delivery"` in their `service_types` array can:
- See available deliveries
- Accept delivery requests
- Complete deliveries

### Payment Methods

**1. Cash**
- Payment status: `pending` during delivery
- Payment completed when delivery code is verified
- Transaction record created automatically
- Courier earnings calculated and recorded

**2. Wallet**
- Deducted immediately when order is created
- Payment status: `completed`

**3. Card**
- May require OTP/PIN authorization
- If authorization required, delivery status remains `pending`
- Must call `/validate-payment` endpoint with OTP
- After validation, delivery status changes to `searching`

### Earnings Calculation

**Platform Earnings:**
```
platform_earnings = service_fee + rounding_fee
```

**Service Fees by Vehicle Type:**
- Bicycle: ₦200
- Bike: ₦300
- Car: ₦500
- Truck: ₦700

**Courier Earnings:**
```
courier_earnings = total_fare - platform_earnings
```

**Example:**
- Total Fare: ₦1,200
- Service Fee: ₦300 (Bike)
- Rounding Fee: ₦0
- Platform Earnings: ₦300
- Courier Earnings: ₦900


### Authentication Codes

**Pickup Code:**
- 6-digit code generated when delivery is created
- Customer shows this code to courier at pickup
- Courier verifies via `/verify-pickup` endpoint
- Updates status to `picked_up`

**Delivery Code:**
- 6-digit code generated when delivery is created
- Customer shares this code with recipient
- Recipient shows code to courier at delivery
- Courier verifies via `/verify-delivery` endpoint
- Updates status to `delivered` and completes payment

### Real-Time Tracking

**For Customers:**
1. Poll `GET /api/delivery/:id/track` every 10 seconds
2. Or subscribe to WebSocket `delivery:location_update` events
3. Display courier location on map
4. Show ETA to customer

**For Couriers:**
1. Update location via `POST /api/delivery/courier/location` every 10 seconds
2. Include `latitude`, `longitude`, `heading`, `speed`
3. Location updates are stored in `driver_locations` table
4. Each update creates a new record (location history)

### Rating System

**Customer Rating Courier:**
- Optional (not mandatory)
- 1-5 stars with optional feedback
- Cannot edit after submission
- Updates courier's `delivery_rating` via database trigger

**Courier Rating Customer:**
- Optional (not mandatory)
- 1-5 stars with optional feedback
- Cannot edit after submission
- Updates customer's rating (if tracked)

**Both ratings are independent and optional**

### Default Values

**Region ID (Lagos, Nigeria):**
```
00000000-0000-0000-0000-000000000001
```

**Service Channel ID (Delivery):**
```
91f84fab-1252-47e1-960a-e498daa91c35
```

**Order Number Format:**
```
ORDB + 4 digits (e.g., ORDB0001, ORDB0002)
```

### Photo Upload Flow

**Package Photo (Customer):**
1. Call `POST /api/delivery/upload/package-photo` to get signed URL
2. Upload image to signed URL using PUT request
3. Use returned `photoUrl` in create delivery request

**Pickup Photo (Courier):**
1. Upload photo to your storage service
2. Call `POST /api/delivery/:id/pickup-photo` with photo URL
3. Serves as proof of pickup

**Delivery Photo (Courier):**
1. Upload photo to your storage service
2. Call `POST /api/delivery/:id/delivery-photo` with photo URL
3. Serves as proof of delivery


### Courier Matching Process

**Instant Deliveries:**
1. Customer creates delivery order
2. Payment is processed
3. Status changes to `searching`
4. System finds nearby couriers (within 15km radius)
5. Sends delivery request to up to 5 couriers via WebSocket
6. First courier to accept gets the delivery
7. Other pending requests are marked as `expired`
8. Status changes to `assigned`

**Scheduled Deliveries:**
1. Customer creates delivery order with future pickup time
2. Payment is processed
3. Status remains `pending`
4. Matching is triggered closer to scheduled time
5. Same matching process as instant deliveries

**No Couriers Available:**
- If no couriers found, status changes to `no_couriers_available`
- Customer is notified
- Can retry or cancel delivery

### Delivery Cancellation

**Who Can Cancel:**
- Customer can cancel before delivery is completed
- Cannot cancel if status is `delivered` or `cancelled`

**Cancellation Effects:**
- Status changes to `cancelled`
- Payment status changes to `refunded`
- Refund is processed automatically
- Courier is notified (if assigned)

### Error Handling

**Common Validation Errors:**
- Missing required fields
- Invalid coordinates (latitude/longitude)
- Invalid vehicle type ID
- Invalid payment method
- Invalid delivery type
- Missing card details for card payment

**Authorization Errors:**
- Missing JWT token
- Invalid/expired JWT token
- User doesn't have access to resource

**Business Logic Errors:**
- Delivery already assigned to another courier
- Driver not enabled for deliveries
- Driver status not active/approved
- Invalid pickup/delivery code
- Delivery cannot be cancelled (already completed)

### Testing Considerations

**Test Scenarios:**
1. Create instant delivery with cash payment
2. Create instant delivery with card payment (with OTP)
3. Create scheduled delivery
4. Courier accepts delivery
5. Courier rejects delivery
6. Courier updates location during delivery
7. Verify pickup code (valid and invalid)
8. Verify delivery code (valid and invalid)
9. Customer cancels delivery
10. Customer rates courier
11. Courier rates customer
12. Track delivery in real-time

**Edge Cases:**
- Multiple couriers trying to accept same delivery
- Network interruption during location updates
- Invalid authentication codes
- Payment failures
- No couriers available in area

---

## API Integration Checklist

### Customer App

- [ ] Get available vehicle types
- [ ] Estimate delivery fare
- [ ] Generate package photo upload URL
- [ ] Upload package photo to signed URL
- [ ] Create delivery order (cash, wallet, card)
- [ ] Validate card payment with OTP (if required)
- [ ] Get delivery details
- [ ] Track delivery in real-time
- [ ] Get delivery status history
- [ ] Cancel delivery
- [ ] Rate courier after delivery
- [ ] Get delivery rating
- [ ] View delivery history
- [ ] Subscribe to WebSocket events

### Courier App

- [ ] Get available deliveries
- [ ] Accept delivery request
- [ ] Reject delivery request
- [ ] Arrived at pickup location
- [ ] Verify pickup code
- [ ] Upload pickup photo
- [ ] Start delivery (after pickup)
- [ ] Update location every 10 seconds
- [ ] Arrived at delivery location
- [ ] Verify delivery code
- [ ] Upload delivery photo
- [ ] Rate customer after delivery
- [ ] View delivery history
- [ ] Subscribe to WebSocket events

---

**Document Version:** 1.0  
**Last Updated:** February 27, 2026  
**Service Channel ID:** 91f84fab-1252-47e1-960a-e498daa91c35  
**Default Region:** Lagos, Nigeria (00000000-0000-0000-0000-000000000001)
