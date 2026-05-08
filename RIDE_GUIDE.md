# RIDE_GUIDE — Olakz Ride Booking Integration Guide
**For React Native Frontend Team**

Base URL (all REST): `https://olakzride.duckdns.org`
WebSocket URL: `wss://olakzride.duckdns.org`

All authenticated endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

## Overview

The ride booking system has two sides: **Passenger** and **Driver**. Both sides use a combination of REST API calls and WebSocket events. This guide covers both.

```
PASSENGER                          SERVER                          DRIVER
   |                                  |                               |
   |-- 1. Create Cart (REST) -------->|                               |
   |-- 2. Set Dropoff (REST) -------->|                               |
   |-- 3. Select Variant (REST) ----->|                               |
   |-- 4. Book Ride (REST) ---------->|                               |
   |                                  |-- ride:request:new (WS) ----->|
   |<-- ride:driver:assigned (WS) ----|<-- ride:request:respond (WS) -|
   |<-- driver:location:updated (WS) -|<-- driver:location:update (WS)|
   |                                  |<-- ride:status:update (WS) ---|
   |<-- ride:status:updated (WS) -----|                               |
   |-- 5. Rate Driver (REST) -------->|                               |
```

---

## Part 1 — WebSocket Connection (Both Passenger and Driver)

Connect once when the user opens the app. Keep the connection alive throughout the session.

### Connecting

```javascript
import { io } from 'socket.io-client';

const socket = io('wss://olakzride.duckdns.org', {
  auth: {
    token: jwtToken,  // your Bearer token WITHOUT the "Bearer " prefix
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});
```

### Connection Events

```javascript
// Fires when connected successfully
socket.on('connected', (data) => {
  console.log('Connected:', data.userId, data.userType, data.socketId);
});

// Fires on disconnect
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Heartbeat — CRITICAL for Drivers

The server only considers a driver available for ride matching if their `last_seen_at` is within the last **5 minutes**. Drivers MUST send `ping` regularly.

```javascript
// Send ping every 30 seconds
const heartbeat = setInterval(() => {
  socket.emit('ping');
}, 30000);

socket.on('pong', () => {
  // Connection confirmed alive
});

// Clear on disconnect
socket.on('disconnect', () => clearInterval(heartbeat));
```

---

## Part 2 — Passenger Flow

### Step 1 — Create a Ride Cart

Before booking, create a cart with the pickup location.

```
POST /api/ride/cart
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "serviceChannelId": "your-service-channel-id",
  "pickupPoint": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "passengers": 1,
  "searchRadius": 10
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "cart-uuid",
      "currency_code": "NGN"
    },
    "variants": [
      {
        "id": "variant-uuid",
        "title": "Standard",
        "vehicle_type": "car",
        "base_price": 500,
        "minimum_fare": 800
      }
    ],
    "recentRides": []
  }
}
```

Save `cart.id` — you need it for all subsequent steps.

---

### Step 2 — Set Dropoff Location

```
PUT /api/carts/:cartId/dropoff
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "dropoffPoint": {
    "latitude": 6.6018,
    "longitude": 3.3515,
    "address": "Lekki Phase 1, Lagos"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cart": { "id": "cart-uuid", "..." },
    "variants": [
      {
        "id": "variant-uuid",
        "title": "Standard",
        "estimated_fare": 1500,
        "estimated_distance": 8.2,
        "estimated_duration": 22
      }
    ],
    "route": {
      "distance": 8.2,
      "duration": 22,
      "distanceText": "8.2 km",
      "durationText": "22 mins"
    }
  }
}
```

Show the variants with prices to the user so they can pick a ride type.

---

### Step 3 — Select a Variant (Ride Type)

```
POST /api/carts/:cartId/line-items
Authorization: Bearer <token>
Content-Type: application/json
```

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
    "lineItem": { "id": "...", "unit_price": 1500 },
    "fareDetails": {
      "totalFare": 1500,
      "baseFare": 500,
      "distanceFare": 1000,
      "distance": 8.2,
      "duration": 22
    },
    "cart": { "id": "cart-uuid" }
  }
}
```

---

### Step 4 — Book the Ride

```
POST /api/ride/request
Authorization: Bearer <token>
Content-Type: application/json
```

**Standard booking (for yourself):**
```json
{
  "cartId": "cart-uuid",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.6018,
    "longitude": 3.3515,
    "address": "Lekki Phase 1, Lagos"
  },
  "vehicleVariantId": "variant-uuid",
  "paymentMethod": {
    "type": "wallet"
  }
}
```

**Payment method options:**
- `{ "type": "wallet" }` — deduct from wallet balance
- `{ "type": "cash" }` — pay driver in cash
- `{ "type": "card", "cardId": "saved-card-uuid" }` — charge saved card
- `{ "type": "card", "cardDetails": { ... } }` — charge new card

**Book for someone else:**
```json
{
  "cartId": "cart-uuid",
  "pickupLocation": { ... },
  "dropoffLocation": { ... },
  "vehicleVariantId": "variant-uuid",
  "paymentMethod": { "type": "wallet" },
  "recipient": {
    "name": "Jane Doe",
    "phone": "+2348012345678"
  }
}
```

**Schedule a ride:**
```json
{
  "cartId": "cart-uuid",
  "pickupLocation": { ... },
  "dropoffLocation": { ... },
  "vehicleVariantId": "variant-uuid",
  "paymentMethod": { "type": "wallet" },
  "scheduledAt": "2026-05-10T08:00:00Z"
}
```

**Response (immediate ride):**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "searching",
      "estimated_fare": 1500,
      "fare_breakdown": { ... },
      "pickup_location": { ... },
      "dropoff_location": { ... },
      "payment_method": "wallet",
      "booking_type": "for_me",
      "variant": { "id": "...", "title": "Standard" },
      "created_at": "2026-05-07T..."
    },
    "message": "Ride requested successfully. Searching for drivers..."
  }
}
```

**Response (card requires OTP):**
```json
{
  "success": true,
  "data": {
    "status": "pending_authorization",
    "message": "Card charge requires OTP validation",
    "ride_id": "ride-uuid",
    "authorization": { ... },
    "flw_ref": "FLW-...",
    "amount": 1500
  }
}
```

---

### Step 5 — Listen for Driver Assignment (WebSocket)

After booking, listen for these events:

```javascript
// A driver accepted the ride
socket.on('ride:driver:assigned', (data) => {
  console.log('Driver assigned!', data);
  // data = { rideId, driverId, status: "driver_assigned" }
  // Navigate to "Driver on the way" screen
});

// Ride status changed (driver arriving, arrived, trip started, completed)
socket.on('ride:status:updated', (data) => {
  console.log('Status update:', data.status);
  // data = { rideId, status, message, updatedBy, updatedAt }
  // Update UI based on status
});

// Driver's live location during active ride
socket.on('driver:location:updated', (data) => {
  // data = { rideId, driverId, latitude, longitude, heading, speed, updatedAt }
  // Update driver pin on map
});
```

**Ride status progression:**
```
searching → driver_assigned → driver_arriving → driver_arrived → in_progress → completed
```

---

### Step 6 — Poll Ride Status (Fallback)

If WebSocket is unavailable, poll this endpoint every 5 seconds:

```
GET /api/ride/:rideId/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ride": {
      "id": "ride-uuid",
      "status": "driver_assigned",
      "pickupLocation": { "latitude": 6.5244, "longitude": 3.3792, "address": "..." },
      "dropoffLocation": { "latitude": 6.6018, "longitude": 3.3515, "address": "..." },
      "estimatedFare": 1500,
      "finalFare": null,
      "estimatedDistance": "8.2 km",
      "estimatedDuration": "22 min",
      "variant": { "title": "Standard" },
      "createdAt": "2026-05-07T...",
      "completedAt": null
    }
  }
}
```

---

### Step 7 — Cancel Ride

```
POST /api/ride/:rideId/cancel
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "reason": "Changed my mind"
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

### Step 8 — Rate Driver (After Completion)

```
POST /api/ride/:rideId/rate
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "stars": 5,
  "feedback": "Great driver, very professional"
}
```

`stars` must be 1–5.

---

### Other Passenger Endpoints

**Get ride history:**
```
GET /api/ride/history?limit=10
Authorization: Bearer <token>
```

**Get scheduled rides:**
```
GET /api/ride/scheduled
Authorization: Bearer <token>
```

**Cancel scheduled ride:**
```
POST /api/ride/:rideId/cancel-scheduled
Authorization: Bearer <token>
Body: { "reason": "..." }
```

**Add tip to completed ride:**
```
POST /api/ride/:rideId/tip
Authorization: Bearer <token>
Body: { "tipAmount": 200 }
```

**Share ride link:**
```
POST /api/rides/:rideId/share
Authorization: Bearer <token>
```
Returns `shareUrl` and `whatsappLink`.

**Track ride by share token (public, no auth):**
```
GET /api/rides/track/:shareToken
```

**Get recent locations:**
```
GET /api/locations/recent?limit=5&type=pickup
Authorization: Bearer <token>
```
`type` is optional: `pickup` or `dropoff`.

---

## Part 3 — Driver Flow

### Step 1 — Go Online

Before the driver can receive ride requests, they must go online via REST and connect via WebSocket.

```
POST /api/drivers/availability/online
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "You are now online and available for ride requests",
    "availability": {
      "isOnline": true,
      "isAvailable": true,
      "lastSeenAt": "2026-05-07T..."
    }
  }
}
```

**Go offline:**
```
POST /api/drivers/availability/offline
Authorization: Bearer <token>
```

**Check status:**
```
GET /api/drivers/availability/status
Authorization: Bearer <token>
```

---

### Step 2 — Send Location Updates (WebSocket)

Drivers must send location updates regularly so the matching system can find them.

```javascript
// Send every 5–10 seconds while online
socket.emit('driver:location:update', {
  latitude: 6.5244,
  longitude: 3.3792,
  heading: 90,        // degrees, optional
  speed: 40,          // km/h, optional
  accuracy: 5,        // meters, optional
  isAvailable: true,
  batteryLevel: 85,   // optional
});
```

Also send availability updates when toggling:
```javascript
socket.emit('driver:availability:update', {
  isAvailable: true,  // or false
});
```

---

### Step 3 — Receive Ride Requests (WebSocket)

```javascript
socket.on('ride:request:new', (data) => {
  console.log('New ride request!', data);
  /*
  data = {
    rideId: "uuid",
    batchNumber: 123456,
    customer: { name: "John Doe", phone: "+234..." },
    pickup: { latitude: 6.5244, longitude: 3.3792, address: "Victoria Island" },
    dropoff: { latitude: 6.6018, longitude: 3.3515, address: "Lekki Phase 1" },
    fare: { estimated: 1500, currency: "NGN" },
    trip: { estimatedDistance: 8.2, estimatedDuration: 22 },
    vehicleType: "Standard",
    expiresAt: "2026-05-07T10:30:30Z",
    timeout: 600
  }
  */
  // Show ride request popup to driver
  // Driver has `timeout` seconds to respond
});

// Ride was taken by another driver
socket.on('ride:request:cancelled', (data) => {
  // data = { rideId, reason: "accepted_by_another_driver" }
  // Dismiss the ride request popup
});
```

---

### Step 4 — Accept or Decline via WebSocket

```javascript
// Accept
socket.emit('ride:request:respond', {
  rideRequestId: 'ride-request-uuid',  // NOT the rideId — the request ID
  response: 'accept',
});

// Decline
socket.emit('ride:request:respond', {
  rideRequestId: 'ride-request-uuid',
  response: 'decline',
});
```

Alternatively, use the REST endpoints:

```
POST /api/drivers/rides/requests/:id/accept
POST /api/drivers/rides/requests/:id/decline
Authorization: Bearer <token>
```

---

### Step 5 — Ride Lifecycle (REST)

Once a ride is accepted, the driver progresses through these states via REST:

**Mark arrived at pickup:**
```
POST /api/drivers/rides/:rideId/arrived
Authorization: Bearer <token>
```
No body needed.

**Start trip (passenger is in the car):**
```
POST /api/drivers/rides/:rideId/start
Authorization: Bearer <token>
Content-Type: application/json
```
```json
{
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Complete trip:**
```
POST /api/drivers/rides/:rideId/complete
Authorization: Bearer <token>
Content-Type: application/json
```
```json
{
  "actualDistance": 8.5,
  "actualDuration": 25,
  "endLocation": {
    "latitude": 6.6018,
    "longitude": 3.3515
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Trip completed successfully",
    "finalFare": 1550
  }
}
```

---

### Step 6 — Send Status Updates via WebSocket (Optional)

The driver can also push status updates via WebSocket (the REST endpoints above do this automatically, but WebSocket is faster):

```javascript
socket.emit('ride:status:update', {
  rideId: 'ride-uuid',
  status: 'driver_arriving',
  location: { latitude: 6.5244, longitude: 3.3792 },
  message: 'On my way to pickup',
});
```

---

### Step 7 — Rate Passenger

```
POST /api/drivers/rides/:rideId/rate-passenger
Authorization: Bearer <token>
Content-Type: application/json
```
```json
{
  "stars": 5,
  "feedback": "Great passenger"
}
```

---

### Other Driver Endpoints

**Get pending ride requests (REST fallback):**
```
GET /api/drivers/rides/pending
Authorization: Bearer <token>
```

**Get active ride:**
```
GET /api/drivers/rides/active
Authorization: Bearer <token>
```

**Get ride history:**
```
GET /api/drivers/rides/history?page=1&limit=20
Authorization: Bearer <token>
```

**Update location via REST (fallback if WebSocket unavailable):**
```
POST /api/drivers/location
Authorization: Bearer <token>
Body: { "latitude": 6.5244, "longitude": 3.3792, "heading": 90, "speed": 40 }
```

---

## Part 4 — Complete WebSocket Event Reference

### Events the app LISTENS for (server → client)

| Event | Who | Payload |
|---|---|---|
| `connected` | everyone | `{ userId, userType, socketId }` |
| `pong` | everyone | _(empty)_ |
| `ride:request:new` | driver | Full ride request details |
| `ride:request:cancelled` | driver | `{ rideId, reason }` |
| `ride:driver:assigned` | passenger | `{ rideId, driverId, status }` |
| `ride:status:updated` | passenger + driver | `{ rideId, status, message, updatedBy, updatedAt }` |
| `driver:location:updated` | passenger | `{ rideId, driverId, latitude, longitude, heading, speed, updatedAt }` |

### Events the app SENDS (client → server)

| Event | Who | Payload |
|---|---|---|
| `ping` | everyone | _(empty)_ |
| `driver:location:update` | driver | `{ latitude, longitude, heading, speed, accuracy, isAvailable, batteryLevel }` |
| `driver:availability:update` | driver | `{ isAvailable: true/false }` |
| `ride:request:respond` | driver | `{ rideRequestId, response: "accept"/"decline" }` |
| `ride:status:update` | driver/passenger | `{ rideId, status, location, message }` |

---

## Part 5 — Ride Status Reference

| Status | Meaning | Who triggers it |
|---|---|---|
| `searching` | Looking for drivers | System (on booking) |
| `no_drivers_available` | No drivers found after timeout | System |
| `driver_assigned` | Driver accepted | Driver |
| `driver_arriving` | Driver heading to pickup | Driver |
| `driver_arrived` | Driver at pickup location | Driver (markArrived) |
| `in_progress` | Trip started | Driver (startTrip) |
| `completed` | Trip finished | Driver (completeTrip) |
| `cancelled` | Cancelled by passenger or driver | Passenger/Driver |

---

## Part 6 — React Native Implementation Tips

### Socket connection lifecycle

```javascript
// Connect when user logs in
useEffect(() => {
  if (token) {
    socket.connect();
  }
  return () => socket.disconnect();
}, [token]);
```

### Driver: keep location and heartbeat running in background

```javascript
// Use react-native-background-fetch or similar
// Send location every 5 seconds while online
// Send ping every 30 seconds always
```

### Handle reconnection

Socket.IO handles reconnection automatically with the config above. On reconnect, re-register any active ride listeners:

```javascript
socket.on('connect', () => {
  if (activeRideId) {
    // Re-subscribe to ride events
    // The server uses rooms, so reconnecting automatically re-joins
  }
});
```

### Passenger: show driver on map

```javascript
const [driverLocation, setDriverLocation] = useState(null);

socket.on('driver:location:updated', (data) => {
  if (data.rideId === currentRideId) {
    setDriverLocation({ lat: data.latitude, lng: data.longitude });
  }
});
```

### Driver: handle ride request with countdown

```javascript
const [rideRequest, setRideRequest] = useState(null);
const [countdown, setCountdown] = useState(0);

socket.on('ride:request:new', (data) => {
  setRideRequest(data);
  const expiresAt = new Date(data.expiresAt).getTime();
  const interval = setInterval(() => {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    setCountdown(remaining);
    if (remaining === 0) {
      clearInterval(interval);
      setRideRequest(null);
    }
  }, 1000);
});

socket.on('ride:request:cancelled', () => {
  setRideRequest(null);
});
```
