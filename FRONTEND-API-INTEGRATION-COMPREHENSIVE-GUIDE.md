# Olakz Ride - Frontend API Integration Guide
## Comprehensive API Documentation for React Native Mobile App

**Base URL:** `https://olakzride.duckdns.org`

**Authentication:** All endpoints (except public tracking) require JWT token in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## Table of Contents
1. [Ride Booking Flow](#1-ride-booking-flow)
2. [Payment Cards Management](#2-payment-cards-management)
3. [Wallet Management](#3-wallet-management)
4. [Saved Places](#4-saved-places)
5. [Recent Locations](#5-recent-locations)
6. [Notifications](#6-notifications)
7. [Support](#7-support)
8. [Ride Sharing](#8-ride-sharing)
9. [Vehicle Variants](#9-vehicle-variants)

---

## 1. Ride Booking Flow

**Complete Booking Flow:**
1. Create cart with pickup location → Get available variants
2. Add dropoff location → Get accurate fare estimates for all variants
3. Select vehicle variant → Finalize fare
4. (Optional) Add stops/waypoints
5. Request ride with payment method → Start driver search

---

### 1.1 Create Ride Cart (Step 1)
**Endpoint:** `POST /api/ride/cart`

**Description:** Initialize a ride cart with pickup location. Returns available vehicle variants with minimum fares.

**Request Body:**
```json
{
  "serviceChannelId": "ride-service-channel-uuid",
  "pickupPoint": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "passengers": 1,
  "searchRadius": 10
}
```

**Field Details:**
- `serviceChannelId` (required): The service channel ID for ride service
- `pickupPoint` (required): Object containing pickup location
  - `latitude` (required): Pickup latitude coordinate
  - `longitude` (required): Pickup longitude coordinate
  - `address` (required): Human-readable pickup address
- `passengers` (optional): Number of passengers, defaults to 1
- `searchRadius` (optional): Search radius in km for finding drivers, defaults to 10

**Response:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "cart-uuid",
      "region_id": "region-uuid",
      "customer_id": "user-uuid",
      "service_channel_id": "ride-service-channel-uuid",
      "currency_code": "NGN",
      "metadata": {
        "regionId": "region-uuid",
        "customerId": "user-uuid",
        "passengers": 1,
        "pickupPoint": {...},
        "searchRadius": 10,
        "serviceChannelId": "ride-service-channel-uuid"
      }
    },
    "variants": [
      {
        "id": "variant-uuid",
        "title": "Standard",
        "sku": "RIDE-STANDARD",
        "calculated_price": {
          "calculated_amount": 50000,
          "currency_code": "NGN"
        },
        "metadata": {
          "description": "Affordable rides",
          "estimatedWaitTime": "3-5 min"
        }
      }
    ],
    "recentRides": []
  }
}
```

---

### 1.2 Update Cart Dropoff (Step 2)
**Endpoint:** `PUT /api/carts/:cartId/dropoff`

**Description:** Add dropoff location to get accurate fare estimates for all variants.

**Request Body:**
```json
{
  "dropoffPoint": {
    "latitude": 6.4281,
    "longitude": 3.4219,
    "address": "Lekki Phase 1, Lagos"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "cart-uuid",
      "pickup_latitude": "6.5244",
      "pickup_longitude": "3.3792",
      "pickup_address": "Victoria Island, Lagos",
      "dropoff_latitude": "6.4281",
      "dropoff_longitude": "3.4219",
      "dropoff_address": "Lekki Phase 1, Lagos",
      "currency_code": "NGN"
    },
    "variants": [
      {
        "id": "variant-uuid",
        "title": "Standard",
        "calculated_price": {
          "calculated_amount": 170000,
          "currency_code": "NGN"
        },
        "metadata": {
          "distance_km": 12.5,
          "duration_minutes": 25,
          "fare_breakdown": {
            "base_fare": 500,
            "distance_fare": 1200,
            "time_fare": 0,
            "minimum_fare": 500
          }
        }
      }
    ],
    "route": {
      "distance": 12.5,
      "duration": 25,
      "distanceText": "12.5 km",
      "durationText": "25 min"
    }
  }
}
```

---

### 1.3 Select Vehicle Variant (Step 3)
**Endpoint:** `POST /api/carts/:cartId/line-items`

**Description:** Select a vehicle variant (Standard, Premium, VIP) to finalize the fare before requesting the ride.

**Request Body:**
```json
{
  "variantId": "variant-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lineItem": {
      "id": "line-item-uuid",
      "cart_id": "cart-uuid",
      "variant_id": "variant-uuid",
      "quantity": 1,
      "unit_price": 170000,
      "total_price": 170000
    },
    "fareDetails": {
      "totalFare": 1700,
      "distance": 12.5,
      "duration": 25,
      "distanceText": "12.5 km",
      "durationText": "25 min",
      "fareBreakdown": {
        "baseFare": 500,
        "distanceFare": 1200,
        "timeFare": 0,
        "totalBeforeSurge": 1700
      }
    },
    "cart": {
      "id": "cart-uuid",
      "status": "active"
    }
  }
}
```

---

### 1.4 Add Stops/Waypoints (Optional)
**Endpoint:** `POST /api/carts/:id/stops`

**Description:** Add intermediate stops to your ride (max 5 stops).

**Request Body:**
```json
{
  "location": {
    "latitude": 6.4550,
    "longitude": 3.3841,
    "address": "Ikeja, Lagos"
  },
  "order": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stop": {
      "id": "stop-uuid",
      "cart_id": "cart-uuid",
      "location": {...},
      "order": 1,
      "additional_fee": 700
    },
    "updated_fare": {
      "totalFare": 2400,
      "stops_fee": 700
    }
  }
}
```

**Get Stops:** `GET /api/carts/:id/stops`

**Remove Stop:** `DELETE /api/carts/:id/stops/:stopId`

**Reorder Stops:** `PUT /api/carts/:id/stops/reorder`
```json
{
  "stops": [
    {"id": "stop-1-uuid", "order": 1},
    {"id": "stop-2-uuid", "order": 2}
  ]
}
```

---

### 1.5 Request Ride (Step 4)
**Endpoint:** `POST /api/ride/request`

**Description:** Create and request a ride with payment method.

**Request Body:**
```json
{
  "cartId": "cart-uuid",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.4281,
    "longitude": 3.4219,
    "address": "Lekki Phase 1, Lagos"
  },
  "vehicleVariantId": "variant-uuid",
  "paymentMethod": {
    "type": "wallet",  // "wallet", "cash", or "card"
    "cardId": "card-uuid"  // Required if type is "card"
  },
  "scheduledAt": "2026-02-17T14:00:00Z",  // Optional: for scheduled rides
  "specialRequests": "Please call when you arrive",  // Optional
  "recipient": {  // Optional: for "Book for Someone Else"
    "name": "John Doe",
    "phone": "+2348012345678"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "searching",
      "estimated_fare": 1700,
      "fare_breakdown": {...},
      "pickup_location": {...},
      "dropoff_location": {...},
      "payment_method": "wallet",
      "booking_type": "for_me",  // or "for_friend"
      "variant": {
        "id": "variant-uuid",
        "title": "Standard",
        "vehicle_type": "car"
      },
      "scheduled_at": null,
      "created_at": "2026-02-16T10:00:00Z",
      "expected_user_action": "wait_for_driver"
    },
    "message": "Ride requested successfully. Searching for drivers..."
  }
}
```

**Response (Card Payment - OTP Required):**
```json
{
  "success": true,
  "data": {
    "status": "pending_authorization",
    "message": "Card charge requires OTP validation",
    "ride_id": "ride-uuid",
    "authorization": {
      "mode": "pin",
      "fields": ["pin"]
    },
    "flw_ref": "flw-ref-123",
    "amount": 1700
  }
}
```

**Error Responses:**
- `400` - Insufficient wallet balance
- `400` - Concurrent ride exists
- `400` - Invalid payment method

---

### 1.6 Get Ride Status
**Endpoint:** `GET /api/ride/:rideId/status` or `GET /api/ride/:rideId`

**Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "in_progress",  // searching, accepted, arrived, in_progress, completed, cancelled
      "pickupLocation": {...},
      "dropoffLocation": {...},
      "estimatedFare": 1700,
      "finalFare": 1650,
      "estimatedDistance": "12 km",
      "estimatedDuration": "25 min",
      "variant": {...},
      "createdAt": "2026-02-16T10:00:00Z",
      "completedAt": null,
      "cancelledAt": null,
      "expected_user_action": "wait_for_completion"
    }
  }
}
```

---

### 1.7 Cancel Ride
**Endpoint:** `POST /api/ride/:rideId/cancel`

**Request Body:**
```json
{
  "reason": "Changed my mind"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Ride cancelled successfully",
    "cancellation_fee": 0
  }
}
```

---

### 1.8 Get Ride History
**Endpoint:** `GET /api/ride/history?limit=10`

**Query Parameters:**
- `limit` (optional): Number of rides to return (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "rides": [
      {
        "id": "ride-uuid",
        "status": "completed",
        "pickup_address": "Victoria Island, Lagos",
        "dropoff_address": "Lekki Phase 1, Lagos",
        "estimated_fare": "1700",
        "created_at": "2026-02-16T10:00:00Z",
        "variant": {...}
      }
    ],
    "total": 10
  }
}
```

---

### 1.9 Rate Driver
**Endpoint:** `POST /api/ride/:rideId/rate`

**Description:** Rate driver after ride completion (1-5 stars).

**Request Body:**
```json
{
  "stars": 5,
  "feedback": "Great driver, very professional"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Driver rated successfully"
  }
}
```

---

### 1.10 Add Tip
**Endpoint:** `POST /api/ride/:rideId/tip`

**Description:** Add tip to completed ride (deducted from wallet).

**Request Body:**
```json
{
  "tipAmount": 200
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Tip added successfully",
    "tipAmount": 200
  }
}
```

---

### 1.11 Scheduled Rides

**Get Scheduled Rides:** `GET /api/ride/scheduled`

**Response:**
```json
{
  "success": true,
  "data": {
    "rides": [
      {
        "id": "ride-uuid",
        "status": "scheduled",
        "pickup_location": {...},
        "dropoff_location": {...},
        "estimated_fare": 1700,
        "scheduled_at": "2026-02-17T14:00:00Z",
        "booking_type": "for_me",
        "variant": {...},
        "created_at": "2026-02-16T10:00:00Z"
      }
    ],
    "total": 2
  }
}
```

**Cancel Scheduled Ride:** `POST /api/ride/:rideId/cancel-scheduled`

---

## 2. Payment Cards Management

### 2.1 Add Payment Card (Step 1)
**Endpoint:** `POST /api/payment/cards`

**Description:** Initiate card addition (charges ₦50 for verification).

**Request Body:**
```json
{
  "cardNumber": "5531886652142950",
  "expiryMonth": "09",
  "expiryYear": "32",
  "cvv": "564",
  "pin": "3310"  // Optional: some cards require PIN
}
```

**Response (OTP Required):**
```json
{
  "success": true,
  "data": {
    "status": "pending_validation",
    "message": "OTP sent to your phone",
    "flw_ref": "flw-ref-123",
    "authorization": {
      "mode": "otp",
      "fields": ["otp"]
    }
  }
}
```

---

### 2.2 Validate Card Addition (Step 2)
**Endpoint:** `POST /api/payment/cards/validate`

**Description:** Complete card addition with OTP.

**Request Body:**
```json
{
  "otp": "123456",
  "flw_ref": "flw-ref-123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "card": {
      "id": "card-uuid",
      "last4": "2950",
      "brand": "mastercard",
      "exp_month": 9,
      "exp_year": 2032,
      "is_default": true
    },
    "message": "Card added successfully"
  }
}
```

---

### 2.3 Get User Cards
**Endpoint:** `GET /api/payment/cards`

**Response:**
```json
{
  "success": true,
  "data": {
    "cards": [
      {
        "id": "card-uuid",
        "last4": "2950",
        "brand": "mastercard",
        "exp_month": 9,
        "exp_year": 2032,
        "is_default": true,
        "created_at": "2026-02-16T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

---

### 2.4 Get Default Card
**Endpoint:** `GET /api/payment/cards/default`

**Response:**
```json
{
  "success": true,
  "data": {
    "card": {
      "id": "card-uuid",
      "last4": "2950",
      "brand": "mastercard",
      "exp_month": 9,
      "exp_year": 2032,
      "is_default": true
    }
  }
}
```

---

### 2.5 Set Default Card
**Endpoint:** `POST /api/payment/cards/:cardId/set-default`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Default card updated successfully"
  }
}
```

---

### 2.6 Delete Card
**Endpoint:** `DELETE /api/payment/cards/:cardId`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Card deleted successfully"
  }
}
```

---

## 3. Wallet Management

### 3.1 Get Wallet Balance
**Endpoint:** `GET /api/wallet/balance`

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 5000,
    "currency": "NGN",
    "formatted": "₦5,000.00"
  }
}
```

---

### 3.2 Top Up Wallet (Step 1)
**Endpoint:** `POST /api/wallet/topup`

**Description:** Initiate wallet top-up using saved card or new card.

**Request Body (Using Saved Card):**
```json
{
  "amount": 5000,
  "cardId": "card-uuid"
}
```

**Request Body (Using New Card):**
```json
{
  "amount": 5000,
  "cardDetails": {
    "cardNumber": "5531886652142950",
    "expiryMonth": "09",
    "expiryYear": "32",
    "cvv": "564"
  }
}
```

**Response (OTP Required):**
```json
{
  "success": true,
  "data": {
    "status": "pending_validation",
    "message": "OTP sent to complete top-up",
    "flw_ref": "flw-ref-123",
    "amount": 5000,
    "authorization": {
      "mode": "otp",
      "fields": ["otp"]
    }
  }
}
```

---

### 3.3 Validate Top-Up (Step 2)
**Endpoint:** `POST /api/wallet/topup/validate`

**Description:** Complete wallet top-up with OTP.

**Request Body:**
```json
{
  "otp": "123456",
  "flw_ref": "flw-ref-123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Wallet topped up successfully",
    "amount": 5000,
    "new_balance": 10000,
    "transaction": {
      "id": "txn-uuid",
      "type": "credit",
      "amount": 5000,
      "created_at": "2026-02-16T10:00:00Z"
    }
  }
}
```

---

### 3.4 Get Transaction History
**Endpoint:** `GET /api/wallet/transactions?limit=20&offset=0`

**Query Parameters:**
- `limit` (optional): Number of transactions (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "txn-uuid",
        "type": "debit",  // credit, debit
        "amount": 1700,
        "description": "Ride payment",
        "balance_after": 8300,
        "created_at": "2026-02-16T10:00:00Z",
        "metadata": {
          "ride_id": "ride-uuid"
        }
      }
    ],
    "total": 50,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 3.5 Add Test Funds (Testing Only)
**Endpoint:** `POST /api/wallet/add-test-funds`

**Description:** Add test funds to wallet for development/testing.

**Request Body:**
```json
{
  "amount": 10000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Test funds added successfully",
    "amount": 10000,
    "new_balance": 15000
  }
}
```

---

## 4. Saved Places

### 4.1 Get Saved Places
**Endpoint:** `GET /api/saved-places`

**Response:**
```json
{
  "success": true,
  "data": {
    "places": [
      {
        "id": "place-uuid",
        "user_id": "user-uuid",
        "label": "Home",
        "address": "Victoria Island, Lagos",
        "latitude": "6.5244",
        "longitude": "3.3792",
        "is_default": true,
        "created_at": "2026-02-16T10:00:00Z"
      }
    ],
    "total": 3
  }
}
```

---

### 4.2 Create Saved Place
**Endpoint:** `POST /api/saved-places`

**Request Body:**
```json
{
  "label": "Home",
  "address": "Victoria Island, Lagos",
  "latitude": 6.5244,
  "longitude": 3.3792
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "place": {
      "id": "place-uuid",
      "label": "Home",
      "address": "Victoria Island, Lagos",
      "latitude": "6.5244",
      "longitude": "3.3792",
      "is_default": false,
      "created_at": "2026-02-16T10:00:00Z"
    },
    "message": "Saved place created successfully"
  }
}
```

---

### 4.3 Update Saved Place
**Endpoint:** `PUT /api/saved-places/:id`

**Request Body:**
```json
{
  "label": "Home (New Address)",
  "address": "Lekki Phase 1, Lagos",
  "latitude": 6.4281,
  "longitude": 3.4219
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "place": {...},
    "message": "Saved place updated successfully"
  }
}
```

---

### 4.4 Delete Saved Place
**Endpoint:** `DELETE /api/saved-places/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Saved place deleted successfully"
  }
}
```

---

### 4.5 Set Default Place
**Endpoint:** `POST /api/saved-places/:id/set-default`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Default place updated successfully"
  }
}
```

---

## 5. Recent Locations

### 5.1 Get Recent Locations
**Endpoint:** `GET /api/locations/recent?limit=5&type=pickup`

**Query Parameters:**
- `limit` (optional): Number of locations (default: 5)
- `type` (optional): Filter by type - "pickup" or "dropoff"

**Response:**
```json
{
  "success": true,
  "data": {
    "locations": [
      {
        "address": "Victoria Island, Lagos",
        "latitude": "6.5244",
        "longitude": "3.3792",
        "type": "pickup",
        "last_used": "2026-02-16T10:00:00Z",
        "usage_count": 5
      }
    ],
    "total": 5
  }
}
```

---

## 6. Notifications

### 6.1 Register Device Token
**Endpoint:** `POST /api/notifications/register-device`

**Description:** Register FCM device token for push notifications.

**Request Body:**
```json
{
  "deviceToken": "fcm-device-token-here",
  "platform": "android"  // or "ios"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Device registered successfully"
  }
}
```

---

### 6.2 Unregister Device
**Endpoint:** `DELETE /api/notifications/unregister-device`

**Request Body:**
```json
{
  "deviceToken": "fcm-device-token-here"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Device unregistered successfully"
  }
}
```

---

### 6.3 Get Notification History
**Endpoint:** `GET /api/notifications/history?limit=20`

**Query Parameters:**
- `limit` (optional): Number of notifications (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif-uuid",
        "title": "Driver Arrived",
        "body": "Your driver has arrived at pickup location",
        "type": "ride_update",
        "is_read": false,
        "created_at": "2026-02-16T10:00:00Z",
        "data": {
          "ride_id": "ride-uuid"
        }
      }
    ],
    "total": 15
  }
}
```

---

### 6.4 Mark Notification as Read
**Endpoint:** `PUT /api/notifications/:id/read`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Notification marked as read"
  }
}
```

---

### 6.5 Get Notification Preferences
**Endpoint:** `GET /api/notifications/preferences`

**Response:**
```json
{
  "success": true,
  "data": {
    "preferences": {
      "ride_updates": true,
      "promotions": true,
      "payment_alerts": true
    }
  }
}
```

---

### 6.6 Update Notification Preferences
**Endpoint:** `PUT /api/notifications/preferences`

**Request Body:**
```json
{
  "ride_updates": true,
  "promotions": false,
  "payment_alerts": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Preferences updated successfully"
  }
}
```

---

## 7. Support

### 7.1 Contact Support
**Endpoint:** `POST /api/support/contact`

**Description:** Generate WhatsApp support link with pre-filled message.

**Request Body:**
```json
{
  "rideId": "ride-uuid",
  "issueCategory": "driver",  // payment, driver, app, safety, other
  "message": "Driver was rude"  // Optional custom message
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "whatsappLink": "https://wa.me/2348063899074?text=...",
    "message": "Support link generated successfully. Click to open WhatsApp."
  }
}
```

---

### 7.2 Get Support Info
**Endpoint:** `GET /api/support/info`

**Response:**
```json
{
  "success": true,
  "data": {
    "support": {
      "whatsapp": "+2348063899074",
      "displayNumber": "+234 806 389 9074",
      "availableFor": "Active rides only",
      "issueCategories": [
        {"value": "payment", "label": "Payment Issue"},
        {"value": "driver", "label": "Driver Issue"},
        {"value": "app", "label": "App Problem"},
        {"value": "safety", "label": "Safety Concern"},
        {"value": "other", "label": "Other Issue"}
      ]
    }
  }
}
```

---

## 8. Ride Sharing

### 8.1 Generate Share Link
**Endpoint:** `POST /api/rides/:rideId/share`

**Description:** Generate shareable tracking link for active ride.

**Response:**
```json
{
  "success": true,
  "data": {
    "shareToken": "abc123xyz",
    "shareUrl": "https://olakzride.duckdns.org/api/rides/track/abc123xyz",
    "whatsappLink": "https://wa.me/?text=Track%20my%20ride...",
    "expiresAt": "2026-02-16T12:00:00Z",
    "message": "Share link generated successfully"
  }
}
```

---

### 8.2 Revoke Share Link
**Endpoint:** `POST /api/rides/:rideId/revoke-share`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Share link revoked successfully"
  }
}
```

---

### 8.3 Track Ride by Token (Public - No Auth)
**Endpoint:** `GET /api/rides/track/:shareToken`

**Description:** Public endpoint to track ride using share token.

**Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "in_progress",
      "pickup_location": {...},
      "dropoff_location": {...},
      "driver": {
        "name": "John Driver",
        "phone": "+234801234****",
        "vehicle": {
          "make": "Toyota",
          "model": "Camry",
          "plate_number": "ABC-123-XY",
          "color": "Black"
        }
      },
      "estimated_arrival": "2026-02-16T10:30:00Z"
    }
  }
}
```

---

## 9. Vehicle Variants

### 9.1 Get Available Variants
**Endpoint:** `GET /api/variants`

**Response:**
```json
{
  "success": true,
  "data": {
    "variants": [
      {
        "id": "variant-uuid",
        "title": "Standard",
        "description": "Affordable rides for everyday travel",
        "vehicle_type": "car",
        "base_fare": 500,
        "price_per_km": 100,
        "price_per_minute": 10,
        "minimum_fare": 300,
        "currency_code": "NGN",
        "capacity": 4,
        "is_active": true
      },
      {
        "id": "variant-uuid-2",
        "title": "Premium",
        "description": "Comfortable rides in premium vehicles",
        "vehicle_type": "car",
        "base_fare": 800,
        "price_per_km": 150,
        "price_per_minute": 15,
        "minimum_fare": 500,
        "currency_code": "NGN",
        "capacity": 4,
        "is_active": true
      }
    ],
    "total": 2
  }
}
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE",
  "timestamp": "2026-02-16T10:00:00Z"
}
```

**Common Error Codes:**
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `400` - Bad Request (validation errors)
- `500` - Internal Server Error

---

## Rate Limiting

- General endpoints: 100 requests per 15 minutes
- Auth endpoints: 10 requests per 15 minutes

Rate limit headers are included in responses:
```
RateLimit-Limit: 100
RateLimit-Remaining: 97
RateLimit-Reset: 900
```

---

## WebSocket Events (Real-time Updates)

Connect to: `wss://olakzride.duckdns.org`

**Events to Listen For:**
- `ride:status_changed` - Ride status updated
- `ride:driver_assigned` - Driver assigned to ride
- `ride:driver_location` - Driver location update
- `ride:arrived` - Driver arrived at pickup
- `ride:started` - Trip started
- `ride:completed` - Trip completed

**Event Payload Example:**
```json
{
  "event": "ride:status_changed",
  "data": {
    "ride_id": "ride-uuid",
    "status": "accepted",
    "driver": {...},
    "timestamp": "2026-02-16T10:00:00Z"
  }
}
```

---

## Testing

**Test Environment:** Same as production (`https://olakzride.duckdns.org`)

**Test Cards (Flutterwave):**
- Card: `5531886652142950`
- CVV: `564`
- Expiry: `09/32`
- PIN: `3310`
- OTP: Any value

**Test Wallet Top-up:**
Use the `/api/wallet/add-test-funds` endpoint to add funds without payment.

---

## Support

For API issues or questions, contact the backend team or use the support endpoints.

**Last Updated:** February 16, 2026
