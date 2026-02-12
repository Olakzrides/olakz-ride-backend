# Firebase Cloud Messaging (FCM) Setup Guide

## Overview
This guide will help you set up Firebase Cloud Messaging for push notifications in your Olakz ride-hailing platform.

---

## Step 1: Firebase Console Setup

### 1.1 Create/Access Your Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your existing project or create a new one
3. Click on your project to open it

### 1.2 Get Service Account Credentials

**Option A: Service Account JSON (Recommended for Production)**

1. Click the **gear icon** ⚙️ next to "Project Overview"
2. Select **"Project settings"**
3. Go to the **"Service accounts"** tab
4. Click **"Generate new private key"**
5. Click **"Generate key"** in the confirmation dialog
6. A JSON file will download - **KEEP THIS SAFE!**

**Option B: Server Key (Quick Setup for Testing)**

1. Go to **"Project settings"** → **"Cloud Messaging"** tab
2. Find **"Server key"** under "Project credentials"
3. Copy this key (starts with `AAAA...`)

---

## Step 2: Backend Configuration

### 2.1 Add Firebase Credentials to Environment

**For Service Account JSON (Recommended):**

1. Save the downloaded JSON file as `firebase-service-account.json` in a secure location
2. Add to your `.env` file:

```env
# Firebase Cloud Messaging
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"firebase-adminsdk-...@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'
```

**Important:** The JSON must be on a single line with escaped quotes and newlines.

**For Server Key (Testing Only):**

```env
# Firebase Server Key (Legacy - for testing only)
FIREBASE_SERVER_KEY=AAAA...your-server-key
```

### 2.2 Install Firebase Admin SDK

```bash
cd services/core-logistics
npm install firebase-admin
```

### 2.3 Update .env.template

Add to `services/core-logistics/.env.template`:

```env
# Firebase Cloud Messaging (FCM) for Push Notifications
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
# OR for testing:
# FIREBASE_SERVER_KEY=your-server-key
```

---

## Step 3: Database Migration

Run the Phase 2B migration to create notification tables:

```bash
# In Supabase SQL Editor, run:
# services/core-logistics/prisma/migrations/20260211_phase2b_notifications/migration.sql

# Then update Prisma client:
cd services/core-logistics
npx prisma generate
```

---

## Step 4: Mobile App Setup

### 4.1 Android Setup

1. **Add Firebase to Android App:**
   - In Firebase Console → Project Settings → Your apps
   - Click "Add app" → Select Android
   - Register app with package name (e.g., `com.olakz.rider`)
   - Download `google-services.json`
   - Place in `android/app/` directory

2. **Add FCM Dependencies** (build.gradle):
   ```gradle
   implementation 'com.google.firebase:firebase-messaging:23.1.0'
   ```

3. **Request Notification Permission:**
   ```kotlin
   // Request permission (Android 13+)
   if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
       requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
   }
   ```

### 4.2 iOS Setup

1. **Add Firebase to iOS App:**
   - In Firebase Console → Project Settings → Your apps
   - Click "Add app" → Select iOS
   - Register app with Bundle ID (e.g., `com.olakz.rider`)
   - Download `GoogleService-Info.plist`
   - Add to Xcode project

2. **Enable Push Notifications:**
   - Xcode → Project → Signing & Capabilities
   - Click "+ Capability" → Push Notifications
   - Enable "Background Modes" → Check "Remote notifications"

3. **Upload APNs Certificate:**
   - Firebase Console → Project Settings → Cloud Messaging
   - Upload your APNs Authentication Key or Certificate

---

## Step 5: Register Device Tokens

### 5.1 API Endpoint

**POST** `/api/notifications/register-device`

**Request Body:**
```json
{
  "deviceId": "unique-device-identifier",
  "fcmToken": "fcm-token-from-firebase-sdk",
  "platform": "android",
  "appVersion": "1.0.0",
  "deviceInfo": {
    "model": "Samsung Galaxy S21",
    "osVersion": "Android 13"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device registered successfully"
}
```

### 5.2 Mobile App Implementation

**React Native Example:**
```javascript
import messaging from '@react-native-firebase/messaging';

// Request permission
async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
    return true;
  }
  return false;
}

// Get FCM token
async function getFCMToken() {
  const fcmToken = await messaging().getToken();
  console.log('FCM Token:', fcmToken);
  
  // Register with backend
  await fetch('https://api.olakz.com/api/notifications/register-device', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      deviceId: DeviceInfo.getUniqueId(),
      fcmToken: fcmToken,
      platform: Platform.OS,
      appVersion: DeviceInfo.getVersion(),
      deviceInfo: {
        model: DeviceInfo.getModel(),
        osVersion: DeviceInfo.getSystemVersion(),
      },
    }),
  });
}

// Listen for token refresh
messaging().onTokenRefresh(token => {
  // Update token on backend
  updateDeviceToken(token);
});

// Handle foreground notifications
messaging().onMessage(async remoteMessage => {
  console.log('Notification received:', remoteMessage);
  // Show local notification or update UI
});

// Handle background notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background notification:', remoteMessage);
});
```

---

## Step 6: Testing Push Notifications

### 6.1 Test from Firebase Console

1. Go to Firebase Console → **Cloud Messaging**
2. Click **"Send your first message"**
3. Enter notification title and text
4. Click **"Send test message"**
5. Enter your FCM token
6. Click **"Test"**

### 6.2 Test from Backend

```bash
# Use Postman or curl to trigger a ride event
POST http://localhost:3000/api/ride/request

# This will automatically send push notifications to:
# - Driver when ride request is sent
# - Passenger when driver accepts
# - Both parties for status updates
```

---

## Step 7: Notification Types

### Passenger Notifications
- `driver_assigned` - Driver accepted ride
- `driver_arrived` - Driver at pickup location
- `ride_started` - Trip has begun
- `ride_completed` - Trip finished
- `ride_cancelled` - Ride was cancelled
- `no_drivers_available` - No drivers found

### Driver Notifications
- `ride_new_request` - New ride request available
- `ride_request_cancelled` - Passenger cancelled
- `ride_reminder` - Reminder for upcoming scheduled ride

---

## Step 8: Notification Preferences

Users can manage notification preferences via API:

**GET** `/api/notifications/preferences`
**PUT** `/api/notifications/preferences`

```json
{
  "pushEnabled": true,
  "emailEnabled": true,
  "smsEnabled": false,
  "rideUpdates": true,
  "promotional": false,
  "driverMessages": true,
  "rideReminders": true
}
```

---

## Troubleshooting

### Issue: "Firebase not initialized"
**Solution:** Ensure `FIREBASE_SERVICE_ACCOUNT` is properly set in `.env` file

### Issue: "Invalid registration token"
**Solution:** Token may have expired. Mobile app should refresh token and re-register

### Issue: Notifications not received on iOS
**Solution:** 
- Verify APNs certificate is uploaded to Firebase
- Check iOS app has push notification capability enabled
- Ensure device has granted notification permission

### Issue: "messaging/invalid-argument"
**Solution:** Check that FCM token format is correct and not empty

---

## Security Best Practices

1. **Never commit** `firebase-service-account.json` to version control
2. **Add to .gitignore:**
   ```
   firebase-service-account.json
   google-services.json
   GoogleService-Info.plist
   ```

3. **Use environment variables** for all Firebase credentials
4. **Rotate service account keys** periodically
5. **Implement rate limiting** on device registration endpoint
6. **Validate FCM tokens** before storing in database

---

## Cost & Limits

- **FCM is FREE** with no message limits
- No cost for sending notifications
- Firebase Spark (free) plan is sufficient
- Only pay if using other Firebase services (Firestore, Storage, etc.)

---

## Next Steps

1. ✅ Complete Firebase Console setup
2. ✅ Add credentials to `.env`
3. ✅ Run database migration
4. ✅ Install `firebase-admin` package
5. ✅ Implement device registration in mobile app
6. ✅ Test notifications
7. ✅ Deploy to production

---

## Support

For issues or questions:
- Firebase Documentation: https://firebase.google.com/docs/cloud-messaging
- FCM Admin SDK: https://firebase.google.com/docs/admin/setup

---

**Ready to send push notifications!** 🚀
