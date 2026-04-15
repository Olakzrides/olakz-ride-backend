# Profile Setup Implementation Guide

## Overview

This guide tracks the implementation of the user profile settings feature across the Olakz app.
All profile-related endpoints live in **auth-service** (port 3003) since that's where the `users` table lives.
The gateway routes `/api/users/*` already proxies to auth-service.

**Service:** `auth-service`
**Gateway route:** `/api/users/*` → `http://localhost:3003`

---

## Current State (Before Implementation)

The `users` table already has:
- `id`, `email`, `firstName`, `lastName`, `username`, `phone`, `avatarUrl`
- `passwordHash`, `role`, `provider`, `emailVerified`, `status`
- `lastLoginAt`, `createdAt`, `updatedAt`, `roles`, `activeRole`

**Missing fields that need to be added:**
- `notificationsEnabled` — push notification toggle
- `language` — preferred language (en, fr, ha, yo, ig)
- `walletPin` — hashed 4-digit PIN for wallet transactions
- `walletPinEnabled` — whether PIN is set and active
- `biometricEnabled` — biometric login/confirmation toggle
- `referralCode` — user's unique referral code
- `referredBy` — referral code used during signup
- `emergencyContactName` — emergency contact full name
- `emergencyContactPhone` — emergency contact phone
- `emergencyContactEmail` — emergency contact email
- `alertTimerEnabled` — safety alert timer toggle
- `alertTimerMinutes` — alert timer duration in minutes

---

## Phase Breakdown

| Phase | Feature | Status |
|---|---|---|
| Phase 1 | Personal Info + Notification + Language | [ ] Not started |
| Phase 2 | Security (Password + Biometric + Wallet PIN) | [ ] Not started |
| Phase 3 | Safety Check-ins (Emergency Contact + Alert Timer) | [ ] Not started |
| Phase 4 | Referral System + Help Center + Static Pages | [ ] Not started |

---

## Phase 1 — Personal Info, Notification Toggle, Language

**Goal:** Users can view and update their profile, toggle notifications, and set preferred language.

### 1.1 Database Migration

Add to `users` table:
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
```

Migration file: `services/auth-service/prisma/migrations/YYYYMMDD_phase1_profile_settings/migration.sql`

Update `services/auth-service/prisma/schema.prisma` — add to `User` model:
```prisma
notificationsEnabled  Boolean?  @default(true) @map("notifications_enabled")
language              String?   @default("en") @db.VarChar(10)
```

### 1.2 Endpoints

```
GET  /api/users/profile
     Auth: Bearer JWT
     Returns: { id, firstName, lastName, email, phone, avatarUrl, notificationsEnabled, language }

PATCH /api/users/profile
      Auth: Bearer JWT
      Body: { firstName?, lastName?, phone? }
      Returns: updated user profile

PATCH /api/users/profile/avatar
      Auth: Bearer JWT
      Body: multipart/form-data — file: image
      Returns: { avatarUrl }

PATCH /api/users/profile/notifications
      Auth: Bearer JWT
      Body: { enabled: boolean }
      Returns: { notificationsEnabled }

PATCH /api/users/profile/language
      Auth: Bearer JWT
      Body: { language: "en" | "fr" | "ha" | "yo" | "ig" }
      Returns: { language }
```

### 1.3 Files to Create/Update

```
services/auth-service/src/
  controllers/profile.controller.ts     — new
  services/profile.service.ts           — new
  routes/profile.routes.ts              — new
  app.ts                                — register /api/users route
```

Avatar upload uses Supabase Storage (same pattern as driver document uploads in core-logistics).

### 1.4 Supported Languages

| Code | Language |
|---|---|
| en | English |
| fr | French |
| ha | Hausa |
| yo | Yoruba |
| ig | Igbo |

### Phase 1 Testing Checklist
- [ ] `GET /api/users/profile` — returns current user profile
- [ ] `PATCH /api/users/profile` — updates name and phone
- [ ] `PATCH /api/users/profile/avatar` — uploads photo, returns new URL
- [ ] `PATCH /api/users/profile/notifications` — toggles notification setting
- [ ] `PATCH /api/users/profile/language` — saves preferred language

---

## Phase 2 — Security (Password Change, Biometric, Wallet PIN)

**Goal:** Users can change their password, enable biometric login, and set/update a 4-digit wallet PIN used to authorize wallet transactions.

### 2.1 Database Migration

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS wallet_pin_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wallet_pin_enabled BOOLEAN DEFAULT false;
```

Migration file: `services/auth-service/prisma/migrations/YYYYMMDD_phase2_security_settings/migration.sql`

Update `schema.prisma`:
```prisma
biometricEnabled   Boolean?  @default(false) @map("biometric_enabled")
walletPinHash      String?   @map("wallet_pin_hash") @db.VarChar(255)
walletPinEnabled   Boolean?  @default(false) @map("wallet_pin_enabled")
```

### 2.2 Endpoints

```
PATCH /api/users/security/password
      Auth: Bearer JWT
      Body: { currentPassword: string, newPassword: string, confirmPassword: string }
      Returns: { message: "Password updated successfully" }

PATCH /api/users/security/biometric
      Auth: Bearer JWT
      Body: { enabled: boolean }
      Returns: { biometricEnabled }

POST  /api/users/security/wallet-pin
      Auth: Bearer JWT
      Body: { pin: string (4 digits), accountPassword: string }
      Action: Set wallet PIN for the first time
      Returns: { walletPinEnabled: true }

PATCH /api/users/security/wallet-pin
      Auth: Bearer JWT
      Body: { currentPin: string, newPin: string (4 digits), accountPassword: string }
      Action: Update existing wallet PIN
      Returns: { walletPinEnabled: true }

POST  /api/users/security/wallet-pin/verify
      Auth: Bearer JWT (or internal)
      Body: { pin: string }
      Action: Verify PIN before wallet operation (called by payment-service or client)
      Returns: { valid: boolean }

DELETE /api/users/security/wallet-pin
       Auth: Bearer JWT
       Body: { accountPassword: string }
       Action: Remove wallet PIN
       Returns: { walletPinEnabled: false }
```

### 2.3 PIN Security Rules
- PIN is exactly 4 digits (numeric only)
- Stored as bcrypt hash (never plain text)
- Account password must be verified before setting or changing PIN
- PIN verify endpoint is rate-limited (max 5 attempts, then lock for 15 min)

### 2.4 Files to Create/Update

```
services/auth-service/src/
  controllers/security.controller.ts    — new
  services/security.service.ts          — new
  routes/security.routes.ts             — new
```

### Phase 2 Testing Checklist
- [ ] `PATCH /api/users/security/password` — changes password, old password required
- [ ] `PATCH /api/users/security/biometric` — toggles biometric flag
- [ ] `POST /api/users/security/wallet-pin` — sets PIN (requires account password)
- [ ] `PATCH /api/users/security/wallet-pin` — updates PIN
- [ ] `POST /api/users/security/wallet-pin/verify` — returns valid/invalid
- [ ] `DELETE /api/users/security/wallet-pin` — removes PIN

---

## Phase 3 — Safety Check-ins (Emergency Contact + Alert Timer)

**Goal:** Users can set an emergency contact and configure an alert timer that triggers during rides.

### 3.1 Database Migration

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alert_timer_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_timer_minutes INTEGER DEFAULT 6;
```

Migration file: `services/auth-service/prisma/migrations/YYYYMMDD_phase3_safety_checkins/migration.sql`

Update `schema.prisma`:
```prisma
emergencyContactName   String?  @map("emergency_contact_name") @db.VarChar(100)
emergencyContactPhone  String?  @map("emergency_contact_phone") @db.VarChar(20)
emergencyContactEmail  String?  @map("emergency_contact_email") @db.VarChar(255)
alertTimerEnabled      Boolean? @default(false) @map("alert_timer_enabled")
alertTimerMinutes      Int?     @default(6) @map("alert_timer_minutes")
```

### 3.2 Endpoints

```
GET  /api/users/safety
     Auth: Bearer JWT
     Returns: { emergencyContact: { name, phone, email }, alertTimer: { enabled, minutes } }

PATCH /api/users/safety/emergency-contact
      Auth: Bearer JWT
      Body: { name: string, phone: string, email?: string }
      Returns: { emergencyContactName, emergencyContactPhone, emergencyContactEmail }

PATCH /api/users/safety/alert-timer
      Auth: Bearer JWT
      Body: { enabled: boolean, minutes?: number (1–60) }
      Returns: { alertTimerEnabled, alertTimerMinutes }
```

### 3.3 Files to Create/Update

```
services/auth-service/src/
  controllers/safety.controller.ts      — new
  services/safety.service.ts            — new
  routes/safety.routes.ts               — new
```

### Phase 3 Testing Checklist
- [ ] `GET /api/users/safety` — returns emergency contact and alert timer settings
- [ ] `PATCH /api/users/safety/emergency-contact` — saves emergency contact
- [ ] `PATCH /api/users/safety/alert-timer` — toggles timer and sets duration

---

## Phase 4 — Referral System + Help Center + Static Pages

**Goal:** Users can view/customize their referral code, see invited friends count, submit complaints, browse FAQs, and access static legal pages.

### 4.1 Database Migration

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50);

-- Auto-generate referral code on user creation (trigger or app-level)

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  complaint_type VARCHAR(100) NOT NULL,
  description TEXT,
  photo_urls JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type VARCHAR(20) NOT NULL, -- 'user' or 'support'
  message TEXT NOT NULL,
  attachment_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'general', 'account', 'ordering', 'payment'
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  rank INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key VARCHAR(100) UNIQUE NOT NULL, -- 'about_app', 'privacy_policy', 'terms_conditions'
  title VARCHAR(255),
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Migration file: `services/auth-service/prisma/migrations/YYYYMMDD_phase4_referral_helpcenter/migration.sql`

Update `schema.prisma` — add to `User` model:
```prisma
referralCode  String?  @unique @map("referral_code") @db.VarChar(50)
referredBy    String?  @map("referred_by") @db.VarChar(50)
```

Add new models: `SupportTicket`, `SupportMessage`, `FaqItem`, `AppContent`

### 4.2 Referral Endpoints

```
GET  /api/users/referral
     Auth: Bearer JWT
     Returns: { referralCode, invitedCount, referredBy }

PATCH /api/users/referral/code
      Auth: Bearer JWT
      Body: { referralCode: string }
      Validation: alphanumeric, 6–20 chars, unique
      Returns: { referralCode }
```

Referral code is auto-generated at registration if not provided (format: `OLAKZ` + 7 random alphanumeric chars).

### 4.3 Help Center Endpoints

```
GET  /api/users/help/faqs
     Auth: Bearer JWT
     Query: ?category=general|account|ordering|payment&search=keyword
     Returns: { faqs: [{ id, category, question, answer }] }

GET  /api/users/help/tickets
     Auth: Bearer JWT
     Query: ?status=all|pending|resolved
     Returns: { tickets: [...] }

POST /api/users/help/tickets
     Auth: Bearer JWT
     Body: { title, complaintType, description, photoUrls?: string[] }
     Complaint types: bad_driver_behaviour | payment_issues | delivery_issues | others
     Returns: { ticket }

GET  /api/users/help/tickets/:ticketId/messages
     Auth: Bearer JWT
     Returns: { messages: [...] }

POST /api/users/help/tickets/:ticketId/messages
     Auth: Bearer JWT
     Body: { message: string, attachmentUrl?: string }
     Returns: { message }
```

### 4.4 Static Content Endpoints

```
GET /api/users/content/:key
    Auth: Bearer JWT
    Keys: about_app | privacy_policy | terms_conditions
    Returns: { title, content }
```

### 4.5 Earn with Olakz

This screen is purely informational/navigation — no backend needed. The three cards (Become a Driver, Become a Vendor, Become a Fleet Owner) just navigate to the existing driver registration and vendor registration flows already implemented.

### 4.6 Files to Create/Update

```
services/auth-service/src/
  controllers/referral.controller.ts    — new
  controllers/help.controller.ts        — new
  controllers/content.controller.ts     — new
  services/referral.service.ts          — new
  services/help.service.ts              — new
  routes/referral.routes.ts             — new
  routes/help.routes.ts                 — new
  routes/content.routes.ts              — new
```

### Phase 4 Testing Checklist
- [ ] `GET /api/users/referral` — returns referral code and invited count
- [ ] `PATCH /api/users/referral/code` — updates referral code (unique check)
- [ ] `GET /api/users/help/faqs` — returns FAQ list, filterable by category
- [ ] `GET /api/users/help/tickets` — returns user's support tickets
- [ ] `POST /api/users/help/tickets` — creates new complaint
- [ ] `GET /api/users/help/tickets/:id/messages` — returns chat messages
- [ ] `POST /api/users/help/tickets/:id/messages` — sends a message
- [ ] `GET /api/users/content/about_app` — returns About Olakz content
- [ ] `GET /api/users/content/privacy_policy` — returns Privacy Policy
- [ ] `GET /api/users/content/terms_conditions` — returns Terms & Conditions

---

## Gateway Routes

All profile routes are already covered by the existing gateway proxy:
```
/api/users/* → auth-service (http://localhost:3003)
```

No gateway changes needed.

---

## Progress Tracker

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Personal Info + Notification + Language | [ ] Not started | |
| Phase 2 — Security (Password + Biometric + Wallet PIN) | [ ] Not started | Requires Phase 1 |
| Phase 3 — Safety Check-ins | [ ] Not started | Requires Phase 1 |
| Phase 4 — Referral + Help Center + Static Pages | [ ] Not started | Requires Phase 1 |
