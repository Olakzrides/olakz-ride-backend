# Postman Testing Guide - Core Logistics Service

Complete guide to test all Phase 1 endpoints using Postman.

## 🚀 Setup

### Prerequisites
- **Gateway** running on `http://localhost:3000`
- **Auth Service** running on `http://localhost:3003`
- **Logistics Service** running on `http://localhost:3001`
- Postman installed

**All requests go through the API Gateway** (`http://localhost:3000`). The gateway routes requests to the appropriate backend services.

### Test Flow Overview
```
1. Login (Auth Service) → Get JWT Token
2. Create Ride Cart (Logistics)
3. Add Dropoff Location
4. Select Ride Variant
5. Request Ride
6. Check Ride Status
7. Cancel Ride (optional)
8. View Ride History
```

---

## 📋 Step-by-Step Testing

### Step 1: Login to Get JWT Token

**Endpoint:** `POST http://localhost:3000/api/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "customer@test.com",
  "password": "Test@1234"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "customer@test.com",
      "firstName": "Test",
      "lastName": "Customer",
      "role": "customer"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "..."
    }
  }
}
```

**⚠️ IMPORTANT:** Copy the `accessToken` - you'll need it for all logistics endpoints!

---

### Step 2: Create Ride Cart

**Endpoint:** `POST http://localhost:3000/api/ride/cart`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body (raw JSON):**
```json
{
  "productId": "00000000-0000-0000-0000-000000000021",
  "salesChannelId": "mobile_ride_sc",
  "passengers": 1,
  "searchRadius": 10,
  "pickupPoint": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "cart-uuid-here",
      "region_id": "00000000-0000-0000-0000-000000000001",
      "customer_id": "user-id",
      "currency_code": "NGN"
    },
    "variants": [
      {
        "id": "variant-id-standard",
        "title": "Standard",
        "sku": "RIDE-STANDARD",
        "calculated_price": {
          "calculated_amount": 50000,
          "currency_code": "NGN"
        }
      },
      {
        "id": "variant-id-premium",
        "title": "Premium",
        "sku": "RIDE-PREMIUM",
        "calculated_price": {
          "calculated_amount": 80000,
          "currency_code": "NGN"
        }
      },
      {
        "id": "variant-id-vip",
        "title": "VIP",
        "sku": "RIDE-VIP",
        "calculated_price": {
          "calculated_amount": 120000,
          "currency_code": "NGN"
        }
      }
    ],
    "recentRides": []
  }
}
```

**⚠️ SAVE:** Copy the `cart.id` for next steps!

---

### Step 3: Add Dropoff Location

**Endpoint:** `PUT http://localhost:3000/api/carts/{CART_ID}/dropoff`

Replace `{CART_ID}` with the cart ID from Step 2.

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body (raw JSON):**
```json
{
  "dropoffPoint": {
    "latitude": 6.4474,
    "longitude": 3.3903,
    "address": "Ikeja, Lagos"
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "cart-id",
      "dropoff_latitude": "6.4474",
      "dropoff_longitude": "3.3903",
      "dropoff_address": "Ikeja, Lagos"
    },
    "variants": [
      {
        "id": "variant-id",
        "title": "Standard",
        "calculated_price": {
          "calculated_amount": 160000,
          "currency_code": "NGN"
        },
        "metadata": {
          "distance_km": 10,
          "duration_minutes": 15,
          "fare_breakdown": {
            "base_fare": 500,
            "distance_fare": 1000,
            "time_fare": 150
          }
        }
      }
    ],
    "route": {
      "distance": 10,
      "duration": 15,
      "distanceText": "10.0 km",
      "durationText": "15 min"
    }
  }
}
```

---

### Step 4: Select Ride Variant

**Endpoint:** `POST http://localhost:3000/api/carts/{CART_ID}/line-items`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body (raw JSON):**
```json
{
  "variantId": "00000000-0000-0000-0000-000000000031",
  "quantity": 1
}
```

**Note:** Use one of these variant IDs:
- Standard: `00000000-0000-0000-0000-000000000031`
- Premium: `00000000-0000-0000-0000-000000000032`
- VIP: `00000000-0000-0000-0000-000000000033`

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "lineItem": {
      "id": "line-item-id",
      "cart_id": "cart-id",
      "variant_id": "variant-id",
      "unit_price": "1600",
      "total_price": "1600"
    },
    "fareDetails": {
      "totalFare": 1600,
      "distance": 10,
      "duration": 15,
      "distanceText": "10.0 km",
      "durationText": "15 min",
      "fareBreakdown": {
        "baseFare": 500,
        "distanceFare": 1000,
        "timeFare": 150,
        "totalBeforeSurge": 1650
      }
    }
  }
}
```

---

### Step 5: Request Ride

**Endpoint:** `POST http://localhost:3000/api/ride/request`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body (raw JSON):**
```json
{
  "cartId": "YOUR_CART_ID_HERE",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.4474,
    "longitude": 3.3903,
    "address": "Ikeja, Lagos"
  },
  "vehicleVariantId": "00000000-0000-0000-0000-000000000031",
  "paymentMethod": {
    "type": "wallet"
  }
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid-here",
      "status": "searching",
      "estimatedFare": 1600,
      "currency": "NGN",
      "estimatedDistance": "10.0 km",
      "estimatedDuration": "15 min"
    },
    "paymentStatus": "hold_created",
    "message": "Ride request created successfully. Driver matching will be implemented in Phase 3."
  }
}
```

**⚠️ SAVE:** Copy the `ride.id` for next steps!

---

### Step 6: Get Ride Status

**Endpoint:** `GET http://localhost:3000/api/ride/{RIDE_ID}/status`

Replace `{RIDE_ID}` with the ride ID from Step 5.

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-id",
      "status": "searching",
      "pickupLocation": {
        "latitude": 6.5244,
        "longitude": 3.3792,
        "address": "Victoria Island, Lagos"
      },
      "dropoffLocation": {
        "latitude": 6.4474,
        "longitude": 3.3903,
        "address": "Ikeja, Lagos"
      },
      "estimatedFare": 1600,
      "estimatedDistance": "10 km",
      "estimatedDuration": "15 min",
      "variant": {
        "id": "variant-id",
        "title": "Standard",
        "sku": "RIDE-STANDARD"
      },
      "createdAt": "2026-01-15T00:00:00.000Z"
    }
  }
}
```

---

### Step 7: Cancel Ride (Optional)

**Endpoint:** `POST http://localhost:3000/api/ride/{RIDE_ID}/cancel`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body (raw JSON):**
```json
{
  "reason": "Changed my mind"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-id",
      "status": "cancelled",
      "cancelled_at": "2026-01-15T00:00:00.000Z",
      "cancellation_reason": "Changed my mind"
    },
    "message": "Ride cancelled successfully"
  }
}
```

---

### Step 8: Get Ride History

**Endpoint:** `GET http://localhost:3000/api/ride/history?page=1&limit=10`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "rides": [
      {
        "id": "ride-id",
        "status": "cancelled",
        "pickup_address": "Victoria Island, Lagos",
        "dropoff_address": "Ikeja, Lagos",
        "estimated_fare": "1600",
        "created_at": "2026-01-15T00:00:00.000Z",
        "variant": {
          "title": "Standard"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## 🔍 Additional Endpoints

### Get All Variants (Public - No Auth Required)

**Endpoint:** `GET http://localhost:3000/api/variants`

**Headers:** None required

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "variants": [
      {
        "id": "variant-id",
        "title": "Standard",
        "sku": "RIDE-STANDARD",
        "base_price": "500",
        "price_per_km": "100",
        "minimum_fare": "500",
        "vehicle_type": {
          "name": "Standard",
          "capacity": 4
        }
      }
    ]
  }
}
```

---

### Get Ride Product by Handle (Public)

**Endpoint:** `GET http://localhost:3000/api/products/olakz-ride`

**Headers:** None required

---

### Health Check

**Endpoint:** `GET http://localhost:3000/health`

**Expected Response:**
```json
{
  "success": true,
  "service": "core-logistics",
  "status": "healthy",
  "timestamp": "2026-01-15T00:00:00.000Z"
}
```

---

## 🔧 Troubleshooting

### Error: "Unauthorized" or "No token provided"
- Make sure you're including the `Authorization: Bearer YOUR_TOKEN` header
- Token might be expired (15 minutes) - login again to get a new one

### Error: "Invalid coordinates"
- Check latitude/longitude values are numbers, not strings
- Latitude: -90 to 90
- Longitude: -180 to 180

### Error: "Variant not found"
- Use the correct variant IDs from the seed data:
  - Standard: `00000000-0000-0000-0000-000000000031`
  - Premium: `00000000-0000-0000-0000-000000000032`
  - VIP: `00000000-0000-0000-0000-000000000033`

### Error: "Cart not found"
- Make sure you're using the correct cart ID from Step 2
- Cart might have been marked as "completed" after requesting a ride

---

## 📦 Postman Collection (Import This)

Create a new collection in Postman and add these requests, or save this as a JSON file:

```json
{
  "info": {
    "name": "Olakz Ride - Core Logistics",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "gateway_url",
      "value": "http://localhost:3000"
    },
    {
      "key": "auth_base_url",
      "value": "http://localhost:3003"
    },
    {
      "key": "logistics_base_url",
      "value": "http://localhost:3001"
    },
    {
      "key": "access_token",
      "value": ""
    },
    {
      "key": "cart_id",
      "value": ""
    },
    {
      "key": "ride_id",
      "value": ""
    }
  ]
}
```

---

## 🎯 Quick Test Sequence

1. **Login** → Save `access_token`
2. **Create Cart** → Save `cart_id`
3. **Add Dropoff** → Use `cart_id`
4. **Select Variant** → Use `cart_id`
5. **Request Ride** → Use `cart_id`, Save `ride_id`
6. **Check Status** → Use `ride_id`
7. **View History** → See all rides

---

## 📝 Notes

- **Phase 1 Limitation**: No driver matching yet, rides stay in "searching" status
- **Mock Maps**: Distance and duration are fixed (10km, 15min) for Phase 1
- **Payment**: Payment holds are created but not actually deducted (Phase 4)
- **Token Expiry**: Access tokens expire in 15 minutes, refresh tokens in 7 days

---

## 🚀 Next: API Gateway Integration

After Phase 1 testing is complete, we'll configure the API Gateway to route:
- `/api/auth/*` → Auth Service (3003)
- `/api/ride/*` → Logistics Service (3001)
- `/api/carts/*` → Logistics Service (3001)
- `/api/variants/*` → Logistics Service (3001)

Then all requests will go through `http://localhost:3000` (Gateway).
