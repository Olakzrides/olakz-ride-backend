# Quick Start - Testing with Gateway

## ✅ Gateway Configuration Complete!

The API Gateway is now configured to route all Phase 1 endpoints. Follow these steps to test the complete system.

## 🚀 Start All Services

**Important:** Make sure no services are already running on ports 3000, 3001, or 3003.

### Check for Running Processes (Windows)
```powershell
# Check if ports are in use
netstat -ano | Select-String ":3000|:3001|:3003"

# If any ports are in use, stop them:
# Option 1: Press Ctrl+C in the terminal where they're running
# Option 2: Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Start Services in Order

**Terminal 1 - Gateway:**
```bash
cd gateway
npm run dev
```
Expected output: `🚀 API Gateway running on port 3000`

**Terminal 2 - Auth Service:**
```bash
cd services/auth-service
npm run dev
```
Expected output: `🚀 Auth Service started successfully`

**Terminal 3 - Core Logistics Service:**
```bash
cd services/core-logistics
npm run dev
```
Expected output: `🚀 Core Logistics Service running on port 3001`

## 🧪 Test the Gateway

### 1. Test Gateway Health
```bash
curl http://localhost:3000/health
```

### 2. View Available Routes
```bash
curl http://localhost:3000/
```

You should see all configured endpoints:
- `/api/auth/*`
- `/api/ride/*`
- `/api/carts/*`
- `/api/variants`

### 3. Test Complete Flow with Postman

1. **Import the updated collection:**
   - Open Postman
   - Import `Olakz_Ride_Logistics.postman_collection.json`

2. **Run the requests in order:**
   - ✅ 1. Auth - Login (saves JWT token automatically)
   - ✅ 2. Create Ride Cart (saves cart ID)
   - ✅ 3. Add Dropoff Location
   - ✅ 4. Select Variant (Standard)
   - ✅ 5. Request Ride (saves ride ID)
   - ✅ 6. Get Ride Status
   - ✅ 7. Cancel Ride (optional)
   - ✅ 8. Get Ride History

All requests now go through `http://localhost:3000` (the gateway).

## 📝 What Changed

### Before (Phase 1 Direct Testing)
```
Client → Auth Service (port 3003)
Client → Logistics Service (port 3001)
```

### After (Gateway Configured)
```
Client → Gateway (port 3000) → Auth Service (port 3003)
Client → Gateway (port 3000) → Logistics Service (port 3001)
```

## 🔍 Debugging

### If Gateway Won't Start
- **Error: `EADDRINUSE: address already in use :::3000`**
  - Another process is using port 3000
  - Find and stop it: `netstat -ano | Select-String ":3000"`
  - Kill the process: `taskkill /PID <PID> /F`

### If Requests Fail
1. **Check all services are running:**
   ```bash
   curl http://localhost:3000/health  # Gateway
   curl http://localhost:3003/health  # Auth
   curl http://localhost:3001/health  # Logistics
   ```

2. **Check gateway logs** for proxy errors

3. **Test direct to service** (bypass gateway for debugging):
   - Auth: `http://localhost:3003/api/auth/login`
   - Logistics: `http://localhost:3001/api/ride/cart`

## 📚 Documentation

- **Complete Testing Guide:** `POSTMAN_TESTING_GUIDE.md`
- **Gateway Configuration Details:** `GATEWAY_CONFIGURATION.md`
- **Phase 1 Summary:** `PHASE1_TESTING_SUMMARY.md`

## ✨ Next Steps

Now that the gateway is working:

1. ✅ **Test all endpoints** through the gateway
2. **Write integration tests** for Phase 1
3. **Move to Phase 2** (Driver Management)
4. **Add Phase 3** (Real-time features)

## 🎯 Success Criteria

You'll know everything is working when:
- ✅ All three services start without errors
- ✅ Gateway health check returns 200
- ✅ Login through gateway returns JWT token
- ✅ Complete ride booking flow works end-to-end
- ✅ All Postman requests return successful responses

Happy testing! 🚀
