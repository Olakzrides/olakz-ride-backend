# Passenger Ride Booking Flow

Complete guide for booking a ride as a passenger and testing the driver acceptance flow.

## Prerequisites

- Passenger must be logged in with a valid JWT token
- Passenger must have `role: "customer"` in their JWT
- Auth token format: `Bearer <token>`

## Step-by-Step Booking Flow

### Step 1: Get Available Variants

First, check what ride types are available in your region.

**Endpoint:** `GET /api/variants`

```bash
curl -X GET http://localhost:3001/api/variants \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "variants": [
      {
        "id": "variant-uuid",
        "title": "OlakzGo",
        "description": "Affordable rides",
        "vehicle_type_id": "vehicle-type-uuid",
        "base_fare": "500.00",
        "per_km_rate": "150.00",
        "per_minute_rate": "10.00"
      }
    ]
  }
}
```

**Note:** Save the `variant_id` for the next step.

---

### Step 2: Create a Cart (Get Fare Estimate)

Create a cart to get fare estimate before booking.

**Endpoint:** `POST /api/ride/cart`

```bash
curl -X POST http://localhost:3001/api/ride/cart \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceChannelId": "88eea5ae-b3ac-4a4d-ad22-84224f4c03a0",
    "passengers": 1,
    "searchRadius": 10,
    "pickupPoint": {
      "latitude": 6.5244,
      "longitude": 3.3792,
      "address": "Victoria Island, Lagos"
    }
  }'
```

**Request Body:**
- `serviceChannelId`: Service channel ID (get from platform service or use hardcoded value)
- `passengers`: Number of passengers (optional, default: 1)
- `searchRadius`: Search radius in km (optional, default: 10)
- `pickupPoint`: **Object** containing:
  - `latitude`: Pickup latitude
  - `longitude`: Pickup longitude
  - `address`: Pickup address string

**Response:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "cart-uuid",
      "user_id": "user-uuid",
      "variant_id": "variant-uuid",
      "pickup_latitude": "6.5244",
      "pickup_longitude": "3.3792",
      "pickup_address": "Victoria Island, Lagos",
      "dropoff_latitude": "6.4281",
      "dropoff_longitude": "3.4219",
      "dropoff_address": "Lekki Phase 1, Lagos",
      "estimated_fare": "2500.00",
      "estimated_distance": "12.5",
      "estimated_duration": 25,
      "expires_at": "2026-02-09T20:00:00.000Z"
    }
  }
}
```

**Note:** Save the `cart.id` for booking the ride.

---

### Step 3: Add Dropoff Location to Cart

Update the cart with your destination to get accurate fare estimates.

**Endpoint:** `PUT /api/carts/:cartId/dropoff`

```bash
curl -X PUT http://localhost:3001/api/carts/YOUR_CART_ID/dropoff \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dropoffPoint": {
      "latitude": 6.4281,
      "longitude": 3.4219,
      "address": "Lekki Phase 1, Lagos"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cart": { ... },
    "variants": [
      {
        "id": "00000000-0000-0000-0000-000000000031",
        "title": "Standard",
        "estimated_fare": 2500.00,
        "distance": 12.5,
        "duration": 25
      }
    ],
    "route": {
      "distance": 12.5,
      "duration": 25,
      "distanceText": "12.5 km",
      "durationText": "25 mins"
    }
  }
}
```

**Note:** Save the `variant.id` you want to book and the fare details.

---

### Step 4: Book the Ride

Create the actual ride request.

**Endpoint:** `POST /api/ride/request`

```bash
curl -X POST http://localhost:3001/api/ride/request \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "YOUR_CART_ID",
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
    "vehicleVariantId": "00000000-0000-0000-0000-000000000031",
    "paymentMethod": {
      "type": "wallet"
    }
  }'
```

**Required Fields:**
- `cartId`: Cart ID from Step 2
- `pickupLocation`: Object with latitude, longitude, address
- `dropoffLocation`: Object with latitude, longitude, address
- `vehicleVariantId`: Variant ID (Standard/Premium/VIP)
- `paymentMethod`: Object with `type: "wallet"`

**Optional Fields:**
- `scheduledAt`: ISO date string for scheduled rides
- `specialRequests`: String with special instructions

**Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "user_id": "user-uuid",
      "variant_id": "variant-uuid",
      "status": "searching",
      "pickup_latitude": "6.5244",
      "pickup_longitude": "3.3792",
      "pickup_address": "Victoria Island, Lagos",
      "dropoff_latitude": "6.4281",
      "dropoff_longitude": "3.4219",
      "dropoff_address": "Lekki Phase 1, Lagos",
      "estimated_fare": "2500.00",
      "estimated_distance": "12.5",
      "estimated_duration": 25,
      "payment_method": "cash",
      "created_at": "2026-02-09T19:00:00.000Z"
    },
    "message": "Ride request created successfully. Searching for drivers..."
  }
}
```

**Important:** 
- Save the `ride.id` - this is what you'll use to track the ride
- The ride status is `"searching"` - the system is now looking for drivers
- Drivers have **10 minutes** to accept the ride request

---

### Step 5: Check Ride Status

Monitor the ride status to see when a driver accepts.

**Endpoint:** `GET /api/ride/:rideId`

```bash
curl -X GET http://localhost:3001/api/ride/YOUR_RIDE_ID \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN"
```

**Response (Searching):**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "searching",
      "driver_id": null,
      "created_at": "2026-02-09T19:00:00.000Z"
    }
  }
}
```

**Response (Driver Accepted):**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "accepted",
      "driver_id": "driver-uuid",
      "driver": {
        "id": "driver-uuid",
        "user": {
          "first_name": "John",
          "last_name": "Doe",
          "phone": "+2348012345678"
        },
        "rating": "4.8",
        "total_rides": 150,
        "vehicle": {
          "plate_number": "ABC-123-XY",
          "manufacturer": "Toyota",
          "model": "Camry",
          "color": "Black"
        }
      },
      "accepted_at": "2026-02-09T19:02:00.000Z"
    }
  }
}
```

---

### Step 5: Track Ride Progress

The ride goes through these statuses:
1. `searching` - Looking for drivers
2. `accepted` - Driver accepted the ride
3. `driver_arrived` - Driver arrived at pickup location
4. `in_progress` - Trip has started
5. `completed` - Trip completed
6. `cancelled` - Ride was cancelled

**Check current status:**
```bash
curl -X GET http://localhost:3001/api/ride/YOUR_RIDE_ID \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN"
```

---

### Step 6: Rate the Driver (After Completion)

After the ride is completed, rate your driver.

**Endpoint:** `POST /api/ride/:rideId/rate`

```bash
curl -X POST http://localhost:3001/api/ride/YOUR_RIDE_ID/rate \
  -H "Authorization: Bearer YOUR_PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stars": 5,
    "feedback": "Great driver, smooth ride!"
  }'
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

## Testing with Driver Flow

### For Testing: Driver Accepts the Ride

Once you've created a ride, you can test the driver acceptance flow:

**1. Driver Goes Online:**
```bash
curl -X POST http://localhost:3001/api/drivers/availability/online \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN"
```

**2. Driver Checks Pending Requests:**
```bash
curl -X GET http://localhost:3001/api/drivers/rides/pending \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": "request-uuid",
        "ride_id": "ride-uuid",
        "status": "pending",
        "pickup_address": "Victoria Island, Lagos",
        "dropoff_address": "Lekki Phase 1, Lagos",
        "estimated_fare": "2500.00",
        "distance_from_pickup": 2.5,
        "estimated_arrival": 5,
        "expires_at": "2026-02-09T19:10:00.000Z"
      }
    ]
  }
}
```

**3. Driver Accepts the Ride:**
```bash
curl -X POST http://localhost:3001/api/drivers/rides/requests/REQUEST_ID/accept \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN"
```

**4. Driver Marks Arrived:**
```bash
curl -X POST http://localhost:3001/api/drivers/rides/RIDE_ID/arrived \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN"
```

**5. Driver Starts Trip:**
```bash
curl -X POST http://localhost:3001/api/drivers/rides/RIDE_ID/start \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "latitude": 6.5244,
      "longitude": 3.3792
    }
  }'
```

**6. Driver Completes Trip:**
```bash
curl -X POST http://localhost:3001/api/drivers/rides/RIDE_ID/complete \
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actualDistance": 13.2,
    "actualDuration": 28,
    "endLocation": {
      "latitude": 6.4281,
      "longitude": 3.4219
    }
  }'
```

---

## Important Notes

### Ride Request Timeout
- Drivers have **10 minutes (600 seconds)** to accept a ride request
- If no driver accepts within 10 minutes, the system will try the next batch of drivers
- If no drivers are available at all, the ride status becomes `no_drivers_available`

### Payment Methods
Currently supported:
- `cash` - Pay driver in cash
- `card` - Pay via card (requires payment integration)
- `wallet` - Pay from wallet balance

### Ride Statuses
- `searching` - Looking for available drivers
- `accepted` - Driver accepted the ride
- `driver_arrived` - Driver arrived at pickup
- `in_progress` - Trip is ongoing
- `completed` - Trip completed successfully
- `cancelled` - Ride was cancelled
- `no_drivers_available` - No drivers available in the area

### Getting Ride and Request IDs

**To get ride ID:**
- It's returned in the response when you create a ride (Step 3)
- Save the `ride.id` from the POST `/api/rides` response

**To get request ID (for driver testing):**
- Driver calls GET `/api/drivers/rides/pending`
- The response contains `requests[].id` - this is the request ID
- Use this ID to accept: POST `/api/drivers/rides/requests/:id/accept`

---

## Quick Test Script

Here's a complete test flow:

```bash
# 1. Login as passenger
PASSENGER_TOKEN="your-passenger-jwt-token"

# 2. Get variants
curl -X GET http://localhost:3001/api/variants \
  -H "Authorization: Bearer $PASSENGER_TOKEN"

# 3. Create cart
CART_RESPONSE=$(curl -X POST http://localhost:3001/api/ride/cart \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceChannelId": "88eea5ae-b3ac-4a4d-ad22-84224f4c03a0",
    "passengers": 1,
    "pickupPoint": {
      "latitude": 6.5244,
      "longitude": 3.3792,
      "address": "Victoria Island, Lagos"
    }
  }')

# Extract cart_id from response
CART_ID=$(echo $CART_RESPONSE | jq -r '.data.cart.id')

# 4. Add dropoff to cart
curl -X PUT http://localhost:3001/api/carts/$CART_ID/dropoff \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dropoffPoint": {
      "latitude": 6.4281,
      "longitude": 3.4219,
      "address": "Lekki Phase 1, Lagos"
    }
  }'

# 5. Book ride
RIDE_RESPONSE=$(curl -X POST http://localhost:3001/api/ride/request \
  -H "Authorization: Bearer $PASSENGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"cartId\": \"$CART_ID\",
    \"pickupLocation\": {
      \"latitude\": 6.5244,
      \"longitude\": 3.3792,
      \"address\": \"Victoria Island, Lagos\"
    },
    \"dropoffLocation\": {
      \"latitude\": 6.4281,
      \"longitude\": 3.4219,
      \"address\": \"Lekki Phase 1, Lagos\"
    },
    \"vehicleVariantId\": \"00000000-0000-0000-0000-000000000031\",
    \"paymentMethod\": {
      \"type\": \"wallet\"
    }
  }")

# Extract ride_id
RIDE_ID=$(echo $RIDE_RESPONSE | jq -r '.data.ride.id')

echo "Ride created with ID: $RIDE_ID"

# 6. Check ride status
curl -X GET http://localhost:3001/api/ride/$RIDE_ID \
  -H "Authorization: Bearer $PASSENGER_TOKEN"
```

---

## Troubleshooting

### "No variants available"
- Make sure variants are seeded in the database
- Run: `cd services/core-logistics && npx prisma db seed`

### "No drivers available"
- Ensure at least one driver is online
- Driver must have status `approved` in database
- Driver must call POST `/api/drivers/availability/online`

### "Driver access required" error
- Check that JWT token contains `"role": "driver"` (not "customer")
- Verify token at https://jwt.io/
- Make sure driver registration is approved

### Ride stuck in "searching"
- Check if any drivers are online: Look at server logs
- Verify driver location is within 15km of pickup
- Check ride_requests table for pending requests

---

## Database Queries for Debugging

```sql
-- Check ride status
SELECT id, status, driver_id, created_at 
FROM rides 
WHERE id = 'YOUR_RIDE_ID';

-- Check ride requests sent to drivers
SELECT * FROM ride_requests 
WHERE ride_id = 'YOUR_RIDE_ID' 
ORDER BY created_at DESC;

-- Check online drivers
SELECT d.id, d.user_id, da.is_online, da.is_available 
FROM drivers d
JOIN driver_availability da ON d.id = da.driver_id
WHERE da.is_online = true;

-- Check driver locations
SELECT driver_id, latitude, longitude, created_at 
FROM driver_location_tracking 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Summary

1. **Get variants** → Choose ride type
2. **Create cart** → Get initial fare estimates
3. **Add dropoff** → Get accurate fare with distance/duration
4. **Book ride** → Create ride request (status: searching)
5. **Wait for driver** → System notifies drivers (10 min timeout)
6. **Track progress** → Monitor ride status changes
7. **Rate driver** → After completion

The ride ID from Step 4 is what you need for all subsequent operations!
