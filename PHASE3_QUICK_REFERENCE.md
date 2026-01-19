# Phase 3 Real-time Testing - Quick Reference Card

## 🚀 Quick Start (5 Steps)

### 1. Start Services (3 terminals)
```bash
# Terminal 1
cd services/auth-service && npm run dev

# Terminal 2
cd services/core-logistics && npm run dev

# Terminal 3
cd gateway && npm run dev
```

### 2. Get Driver Tokens
- Login 3 drivers in Postman
- Copy their access tokens

### 3. Update Test Script
Edit `test-socketio.js`:
```javascript
const DRIVER_TOKENS = [
  'your_driver1_token',
  'your_driver2_token',
  'your_driver3_token'
];
```

### 4. Run Socket.IO Test
```bash
node test-socketio.js
```

### 5. Create Ride in Postman
```http
POST http://localhost:3000/api/ride/request
Authorization: Bearer CUSTOMER_TOKEN

{
  "cartId": "YOUR_CART_ID",
  "pickupLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "address": "Victoria Island, Lagos"
  },
  "dropoffLocation": {
    "latitude": 6.4474,
    "longitude": 3.3903,
    "address": "Ikoyi, Lagos"
  },
  "vehicleVariantId": "YOUR_VARIANT_ID",
  "paymentMethod": { "type": "wallet" }
}
```

---

## 📊 What You Should See

### In Terminal 4 (Socket.IO):
```
✅ Driver 1 connected
✅ Driver 2 connected
✅ Driver 3 connected

🚗 Driver 1 RECEIVED RIDE REQUEST!
🚗 Driver 2 RECEIVED RIDE REQUEST!
🚗 Driver 3 RECEIVED RIDE REQUEST!
```

### After One Driver Accepts:
```
✅ Driver 1 - RIDE ASSIGNED! 🎉
❌ Driver 2 - Ride request cancelled
❌ Driver 3 - Ride request cancelled
```

---

## 🔧 Accept Ride Manually

### Get ride_request_id from Supabase:
```sql
SELECT id, ride_id, driver_id, status 
FROM ride_requests 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 5;
```

### Accept in Browser Console (F12):
```javascript
// 1. Load Socket.IO
const script = document.createElement('script');
script.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
document.head.appendChild(script);

// 2. Wait 2 seconds, then connect and accept
setTimeout(() => {
  const socket = io('http://localhost:3001', {
    auth: { token: 'DRIVER1_TOKEN' }
  });
  
  socket.on('connected', () => {
    socket.emit('ride:request:respond', {
      rideRequestId: 'RIDE_REQUEST_ID_FROM_DATABASE',
      response: 'accept'
    });
    console.log('✅ Acceptance sent!');
  });
}, 2000);
```

---

## 🐛 Troubleshooting

### Drivers not connecting?
- Check tokens are valid (test in Postman first)
- Verify logistics service is running on port 3001
- Check for error messages in terminal

### No ride requests received?
- Ensure drivers are approved in database
- Check driver locations are within 15km of pickup
- Verify drivers are set to available
- Check logistics service logs

### Connection errors?
```bash
# Check if services are running
netstat -ano | findstr :3001
netstat -ano | findstr :3003
netstat -ano | findstr :3000
```

---

## 📋 Useful Database Queries

### Check connected drivers:
```sql
SELECT * FROM socket_connections 
WHERE is_connected = true 
AND user_type = 'driver';
```

### Check ride requests:
```sql
SELECT r.id, r.ride_id, r.driver_id, r.status, r.created_at
FROM ride_requests r
ORDER BY r.created_at DESC
LIMIT 10;
```

### Check driver availability:
```sql
SELECT d.id, d.user_id, da.is_online, da.is_available, da.last_seen_at
FROM drivers d
JOIN driver_availability da ON d.id = da.driver_id
WHERE d.status = 'approved';
```

### Check ride status:
```sql
SELECT id, status, driver_id, created_at, updated_at
FROM rides
ORDER BY created_at DESC
LIMIT 5;
```

---

## ✅ Success Checklist

- [ ] All 3 services running
- [ ] 3 drivers approved and have tokens
- [ ] Socket.IO script shows all drivers connected
- [ ] Customer creates ride request
- [ ] All drivers receive notification
- [ ] One driver accepts
- [ ] Other drivers get cancellation
- [ ] Ride status = 'driver_assigned'
- [ ] Database shows correct records

---

## 📚 Full Documentation

For detailed explanations, see:
- `PHASE3_REALTIME_TESTING_STEP_BY_STEP.md` - Complete guide
- `PHASE3_TESTING_GUIDE.md` - Original testing guide
- `PHASE3_IMPLEMENTATION_SUMMARY.md` - Technical details

---

## 🎉 You're Ready!

Run through the 5 quick start steps and watch the real-time magic happen!
