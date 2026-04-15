# Profile Setup API Testing Flow

All endpoints require: `Authorization: Bearer <JWT_TOKEN>`
Base URL: `http://localhost:3000` (via gateway)

---

## 1. GET /api/users/profile

Fetch the current user's full profile.

**Request**
No body required.

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "uuid",
    "email": "richarddaniel324@gmail.com",
    "firstName": "Richard",
    "lastName": "Daniel",
    "username": "richard123",
    "phone": "+2348149995923",
    "avatarUrl": "https://your-supabase-url.supabase.co/storage/v1/object/public/avatars/uuid.jpg",
    "emailVerified": true,
    "roles": ["customer"],
    "activeRole": "customer",
    "notificationsEnabled": true,
    "language": "en",
    "createdAt": "2026-04-14T00:00:00.000Z"
  },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error (401)**
```json
{
  "success": false,
  "message": "No token provided",
  "error": { "code": "UNAUTHORIZED" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

---

## 2. PATCH /api/users/profile

Update name and/or phone number. All fields are optional — send only what you want to change.

**Request Body**
```json
{
  "firstName": "Richard",
  "lastName": "Daniel",
  "phone": "+2348149995923"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "uuid",
    "email": "richarddaniel324@gmail.com",
    "firstName": "Richard",
    "lastName": "Daniel",
    "phone": "+2348149995923",
    "avatarUrl": null,
    "notificationsEnabled": true,
    "language": "en"
  },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — no valid fields sent (400)**
```json
{
  "success": false,
  "message": "No valid fields provided for update",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

---

## 3. PATCH /api/users/profile/avatar

Upload a profile photo. Send the image as a base64-encoded string.

**Request Body**
```json
{
  "image": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "mimeType": "image/jpeg"
}
```

Supported mimeType values: `image/jpeg`, `image/png`, `image/webp`
Max size: 5MB

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Avatar updated successfully",
  "data": {
    "avatarUrl": "https://your-supabase-url.supabase.co/storage/v1/object/public/avatars/uuid.jpeg"
  },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — missing fields (400)**
```json
{
  "success": false,
  "message": "image (base64) and mimeType are required",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — unsupported file type (400)**
```json
{
  "success": false,
  "message": "Only JPEG, PNG and WebP images are allowed",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — file too large (400)**
```json
{
  "success": false,
  "message": "Image must be smaller than 5MB",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

---

## 4. PATCH /api/users/profile/notifications

Toggle push notifications on or off.

**Request Body — turn ON**
```json
{
  "enabled": true
}
```

**Request Body — turn OFF**
```json
{
  "enabled": false
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Notifications enabled",
  "data": {
    "notificationsEnabled": true
  },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — wrong type (400)**
```json
{
  "success": false,
  "message": "enabled must be a boolean",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

---

## 5. PATCH /api/users/profile/language

Set the user's preferred language.

**Request Body**
```json
{
  "language": "en"
}
```

Supported values: `en` (English), `fr` (French), `ha` (Hausa), `yo` (Yoruba), `ig` (Igbo)

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Language preference updated",
  "data": {
    "language": "en"
  },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — unsupported language (400)**
```json
{
  "success": false,
  "message": "Language must be one of: en, fr, ha, yo, ig",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```

**Error — missing language field (400)**
```json
{
  "success": false,
  "message": "language is required",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-14T07:00:00.000Z"
}
```


---

## Phase 2 — Security

---

## 6. GET /api/users/security

Get current security settings overview.

**Request**
No body required.

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Security settings retrieved",
  "data": {
    "biometricEnabled": false,
    "walletPinEnabled": true,
    "canChangePassword": true
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 7. PATCH /api/users/security/password

Change account password. Requires current password. Forces logout on all other devices.

**Request Body**
```json
{
  "currentPassword": "OldPass@123",
  "newPassword": "NewPass@456",
  "confirmPassword": "NewPass@456"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Password updated successfully",
  "data": null,
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — passwords don't match (400)**
```json
{
  "success": false,
  "message": "Passwords do not match",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — wrong current password (401)**
```json
{
  "success": false,
  "message": "Current password is incorrect",
  "error": { "code": "UNAUTHORIZED" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — password too short (400)**
```json
{
  "success": false,
  "message": "New password must be at least 8 characters",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — OAuth account (400)**
```json
{
  "success": false,
  "message": "Password change is not available for OAuth accounts",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 8. PATCH /api/users/security/biometric

Toggle biometric login and confirmation on or off.

**Request Body — enable**
```json
{
  "enabled": true
}
```

**Request Body — disable**
```json
{
  "enabled": false
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Biometric enabled",
  "data": {
    "biometricEnabled": true
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — wrong type (400)**
```json
{
  "success": false,
  "message": "enabled must be a boolean",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 9. POST /api/users/security/wallet-pin

Set wallet PIN for the first time. Requires account password to confirm identity.

**Request Body**
```json
{
  "pin": "1234",
  "accountPassword": "YourPass@123"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Wallet PIN set successfully",
  "data": {
    "walletPinEnabled": true
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — PIN already set (400)**
```json
{
  "success": false,
  "message": "Wallet PIN is already set. Use the update endpoint to change it.",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — invalid PIN format (400)**
```json
{
  "success": false,
  "message": "PIN must be exactly 4 digits",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — wrong account password (401)**
```json
{
  "success": false,
  "message": "Account password is incorrect",
  "error": { "code": "UNAUTHORIZED" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 10. PATCH /api/users/security/wallet-pin

Update existing wallet PIN. Requires current PIN and account password.

**Request Body**
```json
{
  "currentPin": "1234",
  "newPin": "5678",
  "accountPassword": "YourPass@123"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Wallet PIN updated successfully",
  "data": {
    "walletPinEnabled": true
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — no PIN set (400)**
```json
{
  "success": false,
  "message": "No wallet PIN set. Use the set endpoint first.",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — wrong current PIN (401)**
```json
{
  "success": false,
  "message": "Current PIN is incorrect",
  "error": { "code": "UNAUTHORIZED" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — PIN locked (429)**
```json
{
  "success": false,
  "message": "Wallet PIN is locked. Try again in 15 minutes.",
  "error": { "code": "RATE_LIMIT_EXCEEDED" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 11. POST /api/users/security/wallet-pin/verify

Verify wallet PIN before authorizing a wallet transaction. Returns valid true/false.

**Request Body**
```json
{
  "pin": "1234"
}
```

**Expected Response — correct PIN (200)**
```json
{
  "success": true,
  "message": "PIN verified",
  "data": {
    "valid": true
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Expected Response — wrong PIN (200)**
```json
{
  "success": true,
  "message": "Invalid PIN",
  "data": {
    "valid": false
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — PIN not set (400)**
```json
{
  "success": false,
  "message": "Wallet PIN is not set",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — PIN locked after 5 failed attempts (429)**
```json
{
  "success": false,
  "message": "Wallet PIN is locked. Try again in 15 minutes.",
  "error": { "code": "RATE_LIMIT_EXCEEDED" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 12. POST /api/users/security/wallet-pin/remove

Remove wallet PIN entirely. Requires account password.

**Request Body**
```json
{
  "accountPassword": "YourPass@123"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Wallet PIN removed",
  "data": {
    "walletPinEnabled": false
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — no PIN set (400)**
```json
{
  "success": false,
  "message": "No wallet PIN is set",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — wrong account password (401)**
```json
{
  "success": false,
  "message": "Account password is incorrect",
  "error": { "code": "UNAUTHORIZED" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```


---

## Phase 3 — Safety Check-ins

---

## 13. GET /api/users/safety

Get emergency contact and alert timer settings.

**Request**
No body required.

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Safety settings retrieved",
  "data": {
    "emergencyContact": {
      "name": "Femi",
      "phone": "+2348149995923",
      "email": "richarddaniel324@gmail.com"
    },
    "alertTimer": {
      "enabled": true,
      "minutes": 6
    }
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Expected Response — no contact set yet (200)**
```json
{
  "success": true,
  "message": "Safety settings retrieved",
  "data": {
    "emergencyContact": {
      "name": null,
      "phone": null,
      "email": null
    },
    "alertTimer": {
      "enabled": false,
      "minutes": 6
    }
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 14. PATCH /api/users/safety/emergency-contact

Set or update emergency contact. Email is optional.

**Request Body**
```json
{
  "name": "Femi",
  "phone": "+2348149995923",
  "email": "richarddaniel324@gmail.com"
}
```

**Request Body — without email**
```json
{
  "name": "Femi",
  "phone": "+2348149995923"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Emergency contact updated",
  "data": {
    "emergencyContactName": "Femi",
    "emergencyContactPhone": "+2348149995923",
    "emergencyContactEmail": "richarddaniel324@gmail.com"
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — missing name or phone (400)**
```json
{
  "success": false,
  "message": "name and phone are required",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 15. PATCH /api/users/safety/alert-timer

Toggle alert timer on/off and optionally set the duration in minutes (1–60).

**Request Body — enable with custom duration**
```json
{
  "enabled": true,
  "minutes": 6
}
```

**Request Body — disable**
```json
{
  "enabled": false
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Alert timer updated",
  "data": {
    "alertTimerEnabled": true,
    "alertTimerMinutes": 6
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — enabled not a boolean (400)**
```json
{
  "success": false,
  "message": "enabled must be a boolean",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — minutes out of range (400)**
```json
{
  "success": false,
  "message": "minutes must be an integer between 1 and 60",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```


---

## Phase 4 — Referral, Help Center, Static Content

---

## 16. GET /api/users/referral

Get referral code and invited friends count. Auto-generates a code if the user doesn't have one yet.

**Request**
No body required.

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Referral info retrieved",
  "data": {
    "referralCode": "OLAKZRIDE1AB",
    "invitedCount": 3,
    "referredBy": null
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 17. PATCH /api/users/referral/code

Set a custom referral code. Must be 6–20 alphanumeric characters, unique across all users.

**Request Body**
```json
{
  "referralCode": "RICHARD2026"
}
```

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Referral code updated",
  "data": {
    "referralCode": "RICHARD2026"
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — invalid format (400)**
```json
{
  "success": false,
  "message": "Referral code must be 6–20 alphanumeric characters",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — code already taken (409)**
```json
{
  "success": false,
  "message": "This referral code is already taken",
  "error": { "code": "CONFLICT" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 18. GET /api/users/help/faqs

Get FAQ list. Optionally filter by category or search keyword.

**Request**
No body. Optional query params: `?category=general&search=password`

Supported categories: `general`, `account`, `ordering`, `payment`

**Expected Response (200)**
```json
{
  "success": true,
  "message": "FAQs retrieved",
  "data": {
    "faqs": [
      {
        "id": "uuid",
        "category": "general",
        "question": "How do I create a new account?",
        "answer": "Open the app and navigate to the login screen...",
        "rank": 1
      }
    ]
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 19. GET /api/users/help/tickets

Get the current user's support tickets. Optionally filter by status.

**Request**
No body. Optional query param: `?status=pending` or `?status=resolved` or `?status=all`

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Tickets retrieved",
  "data": {
    "tickets": [
      {
        "id": "uuid",
        "title": "Payment not credited",
        "complaint_type": "payment_issues",
        "status": "pending",
        "created_at": "2026-04-15T07:00:00.000Z",
        "updated_at": "2026-04-15T07:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 20. POST /api/users/help/tickets

Submit a new support complaint.

**Request Body**
```json
{
  "title": "Payment not credited",
  "complaintType": "payment_issues",
  "description": "I made a withdrawal and it has not been credited after 24 hours.",
  "photoUrls": []
}
```

Supported complaintType values: `bad_driver_behaviour`, `payment_issues`, `delivery_issues`, `others`

**Expected Response (201)**
```json
{
  "success": true,
  "message": "Ticket created successfully",
  "data": {
    "ticket": {
      "id": "uuid",
      "user_id": "uuid",
      "title": "Payment not credited",
      "complaint_type": "payment_issues",
      "description": "I made a withdrawal and it has not been credited after 24 hours.",
      "photo_urls": [],
      "status": "pending",
      "created_at": "2026-04-15T07:00:00.000Z",
      "updated_at": "2026-04-15T07:00:00.000Z"
    }
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — missing required fields (400)**
```json
{
  "success": false,
  "message": "title and complaintType are required",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — invalid complaint type (400)**
```json
{
  "success": false,
  "message": "complaintType must be one of: bad_driver_behaviour, payment_issues, delivery_issues, others",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 21. GET /api/users/help/tickets/:ticketId/messages

Get all chat messages for a support ticket.

**Request**
No body. Replace `:ticketId` with the actual ticket UUID.

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Messages retrieved",
  "data": {
    "messages": [
      {
        "id": "uuid",
        "sender_id": "uuid",
        "sender_type": "support",
        "message": "Welcome to Olakz support. How can we help you?",
        "attachment_url": null,
        "created_at": "2026-04-15T07:00:00.000Z"
      },
      {
        "id": "uuid",
        "sender_id": "uuid",
        "sender_type": "user",
        "message": "I made a withdrawal and I am yet to be credited.",
        "attachment_url": null,
        "created_at": "2026-04-15T07:05:00.000Z"
      }
    ]
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — ticket not found (404)**
```json
{
  "success": false,
  "message": "Ticket not found",
  "error": { "code": "NOT_FOUND" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 22. POST /api/users/help/tickets/:ticketId/messages

Send a message in a support ticket chat.

**Request Body**
```json
{
  "message": "I made a withdrawal and I am yet to be credited.",
  "attachmentUrl": null
}
```

**Expected Response (201)**
```json
{
  "success": true,
  "message": "Message sent",
  "data": {
    "message": {
      "id": "uuid",
      "ticket_id": "uuid",
      "sender_id": "uuid",
      "sender_type": "user",
      "message": "I made a withdrawal and I am yet to be credited.",
      "attachment_url": null,
      "created_at": "2026-04-15T07:05:00.000Z"
    }
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — empty message (400)**
```json
{
  "success": false,
  "message": "message is required",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

---

## 23. GET /api/users/content/:key

Get static app content. Replace `:key` with one of the supported keys.

Supported keys: `about_app`, `privacy_policy`, `terms_conditions`

**Request**
No body.

**Example:** `GET /api/users/content/about_app`

**Expected Response (200)**
```json
{
  "success": true,
  "message": "Content retrieved",
  "data": {
    "key": "about_app",
    "title": "About Olakz",
    "content": "Olakz is a ride-hailing, delivery, and marketplace platform built to connect people and businesses across Africa.",
    "updatedAt": "2026-04-15T07:00:00.000Z"
  },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — invalid key (400)**
```json
{
  "success": false,
  "message": "key must be one of: about_app, privacy_policy, terms_conditions",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```

**Error — content not found (404)**
```json
{
  "success": false,
  "message": "Content not found",
  "error": { "code": "NOT_FOUND" },
  "timestamp": "2026-04-15T07:00:00.000Z"
}
```
