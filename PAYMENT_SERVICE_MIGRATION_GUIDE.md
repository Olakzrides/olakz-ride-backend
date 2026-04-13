# Payment Service Migration Guide

## Overview

This guide tracks the migration of all payment logic into a single dedicated `payment-service`.
Currently, payment code (Flutterwave integration, wallet operations, card management) is duplicated
across `core-logistics`, `food-service`, and `platform-service`. The `payment-service` folder exists
but is completely empty.

**Goal:** payment-service becomes the single source of truth for all payment operations.
All other services call it via internal HTTP API instead of having their own payment code.

**Internal API key:** `olakz-internal-api-key-2026-secure`
**Payment service port:** `3007`
**Gateway route:** `/api/payment`

---

## Current State (Before Migration)

| Service | Payment code it currently owns |
|---|---|
| `core-logistics` | `PaymentService` (wallet top-up, holds, ride payments), `FlutterwaveService` (card tokenize/charge/refund), `PaymentCardsService` (save/list/charge saved cards), wallet internal API endpoints |
| `food-service` | `FoodPaymentService` (card + wallet for food orders), `FlutterwaveService` (duplicate copy) |
| `marketplace-service` | `WalletService` (calls core-logistics internal API — already correct pattern) |
| `platform-service` | `FlutterwaveBillsService` (airtime/data top-ups via Flutterwave) |
| `payment-service` | Empty scaffold — nothing implemented |

---

## Target State (After Migration)

```
payment-service owns:
  - Flutterwave integration (one copy)
  - Wallet: balance, deduct, credit, top-up via card, validate OTP
  - Cards: save, list, charge saved card, delete
  - Transaction history

Other services call payment-service:
  core-logistics  → POST /api/internal/payment/wallet/deduct
  food-service    → POST /api/internal/payment/wallet/deduct
  marketplace     → POST /api/internal/payment/wallet/deduct  (replaces core-logistics call)
  platform        → POST /api/internal/payment/flutterwave/bills/...
```

---

## Phase 1 — Build the Payment Service

**Status:** [ ] Not started

**Goal:** Implement the payment-service from scratch. No other service changes. Zero risk to existing functionality.

**Port:** 3007

### 1.1 Service Bootstrap

Files to create in `services/payment-service/src/`:

```
app.ts                          — Express app setup
server.ts                       — HTTP server + startup
config/
  index.ts                      — Config (port, Supabase, Flutterwave keys, internal API key)
middleware/
  internal-api.middleware.ts    — Validates x-internal-api-key header
  auth.middleware.ts            — JWT validation for user-facing endpoints
  error.middleware.ts           — Global error handler
services/
  flutterwave.service.ts        — Single Flutterwave implementation (moved from core-logistics)
  wallet.service.ts             — Wallet: balance, deduct, credit, top-up, validate OTP
  payment-cards.service.ts      — Card: save, list, charge saved card, delete
controllers/
  wallet.controller.ts          — User-facing wallet endpoints
  payment-cards.controller.ts   — User-facing card endpoints
  internal.controller.ts        — Internal API endpoints (service-to-service)
routes/
  wallet.routes.ts              — /api/payment/wallet/*
  cards.routes.ts               — /api/payment/cards/*
  internal.routes.ts            — /api/internal/payment/*
utils/
  response.ts                   — Standard response helpers
  logger.ts                     — Winston logger
```

Update `services/payment-service/package.json` — add all required dependencies:
- express, cors, helmet, morgan
- @supabase/supabase-js
- axios, crypto-js
- jsonwebtoken
- winston
- typescript dev dependencies

### 1.2 Flutterwave Service

Consolidate the Flutterwave implementation from `core-logistics/src/services/flutterwave.service.ts`.

Methods to implement:
- `tokenizeCard(payload)` — charge + tokenize a new card (3DES encrypted)
- `chargeTokenizedCard(payload)` — charge a saved card token
- `validateCharge(flwRef, otp)` — validate OTP for pending charge
- `verifyTransaction(transactionId)` — verify a completed transaction
- `refundTransaction(transactionId, amount?)` — initiate refund
- `validateWebhookSignature(signature, payload)` — webhook validation

### 1.3 Wallet Service

Consolidate wallet logic from `core-logistics/src/services/payment.service.ts` and `core-logistics/src/controllers/wallet.controller.ts`.

Methods to implement:
- `getBalance(userId, currencyCode)` — calculate balance from wallet_transactions table
- `deduct(userId, amount, currencyCode, reference, description)` — debit wallet
- `credit(userId, amount, currencyCode, reference, description)` — credit wallet
- `topupViaCard(params)` — charge card + credit wallet (Step 1)
- `validateTopup(params)` — validate OTP + credit wallet (Step 2)
- `getTransactionHistory(userId, page, limit)` — paginated transaction list

### 1.4 Payment Cards Service

Consolidate from `core-logistics/src/services/payment-cards.service.ts`.

Methods to implement:
- `saveCard(userId, cardDetails)` — tokenize and save card to `payment_cards` table
- `listCards(userId)` — list user's saved cards
- `deleteCard(userId, cardId)` — soft delete a saved card
- `chargeCard(cardId, userId, amount, currency, email, txRef)` — charge a saved card token

### 1.5 Internal API Endpoints

These are called by other services (require `x-internal-api-key` header):

```
POST /api/internal/payment/wallet/balance
     Headers: x-internal-api-key, x-user-id
     Returns: { balance, currency_code }

POST /api/internal/payment/wallet/deduct
     Headers: x-internal-api-key, x-user-id
     Body: { amount, currency_code, reference, description }
     Returns: { transaction_id, new_balance }

POST /api/internal/payment/wallet/credit
     Headers: x-internal-api-key, x-user-id
     Body: { amount, currency_code, reference, description }
     Returns: { transaction_id, new_balance }
```

### 1.6 User-Facing Endpoints

These are called by the frontend (require JWT Bearer token):

```
GET  /api/payment/wallet/balance
POST /api/payment/wallet/topup
POST /api/payment/wallet/topup/validate
GET  /api/payment/wallet/transactions

GET  /api/payment/cards
POST /api/payment/cards
DELETE /api/payment/cards/:id
```

### 1.7 Gateway Registration

Add to `gateway/src/config/index.ts` and `gateway/src/routes/index.ts`:
- Route: `/api/payment/*` → `http://localhost:3007`
- Timeout: 30s

### 1.8 Environment Variables

Add to `services/payment-service/.env`:
```
NODE_ENV=development
PORT=3007
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
FLUTTERWAVE_PUBLIC_KEY=...
FLUTTERWAVE_SECRET_KEY=...
FLUTTERWAVE_ENCRYPTION_KEY=...
INTERNAL_API_KEY=olakz-internal-api-key-2026-secure
```

### Phase 1 Testing Checklist

After implementation, verify these work before moving to Phase 2:

- [ ] `GET /api/payment/wallet/balance` — returns correct balance
- [ ] `POST /api/payment/wallet/topup` — initiates card charge
- [ ] `POST /api/payment/wallet/topup/validate` — validates OTP, credits wallet
- [ ] `GET /api/payment/cards` — lists saved cards
- [ ] `POST /api/payment/cards` — saves a new card
- [ ] `DELETE /api/payment/cards/:id` — deletes a card
- [ ] `POST /api/internal/payment/wallet/balance` — internal balance check
- [ ] `POST /api/internal/payment/wallet/deduct` — internal deduct
- [ ] `POST /api/internal/payment/wallet/credit` — internal credit
- [ ] `GET /api/payment/health` — service health check

---

## Phase 2 — Migrate marketplace-service and food-service

**Status:** [ ] Not started
**Prerequisite:** Phase 1 complete and tested

**Goal:** Switch marketplace-service and food-service to use payment-service. These are the lowest-risk changes.

### 2.1 marketplace-service

File to update: `services/marketplace-service/src/services/wallet.service.ts`

Current behavior: calls `core-logistics` internal wallet API
New behavior: calls `payment-service` internal wallet API

Changes:
- Update `WALLET_SERVICE_URL` env var to point to payment-service
- Update endpoint paths from `/api/wallet/internal/*` to `/api/internal/payment/wallet/*`
- No other files change

Add to `services/marketplace-service/.env`:
```
PAYMENT_SERVICE_URL=http://localhost:3007
```

### 2.2 food-service

Files to update:
- `services/food-service/src/services/wallet.service.ts` — update to call payment-service internal API
- `services/food-service/src/services/payment.service.ts` — update Flutterwave calls to use payment-service

Files to delete after migration:
- `services/food-service/src/services/flutterwave.service.ts` — no longer needed

Add to `services/food-service/.env`:
```
PAYMENT_SERVICE_URL=http://localhost:3007
```

### Phase 2 Testing Checklist

- [ ] Place a food order with wallet payment — confirm deduction works
- [ ] Cancel a food order — confirm wallet refund works
- [ ] Place a marketplace order with wallet payment — confirm deduction works
- [ ] Cancel a marketplace order — confirm wallet refund works
- [ ] Confirm food-service `flutterwave.service.ts` is deleted and no errors

---

## Phase 3 — Migrate core-logistics and platform-service

**Status:** [ ] Not started
**Prerequisite:** Phase 2 complete and tested

**Goal:** Migrate the largest and most critical service. core-logistics handles rides, deliveries, and wallet top-ups.

### 3.1 core-logistics

Files to update:
- `src/services/payment.service.ts` — replace wallet operations with calls to payment-service
- `src/controllers/wallet.controller.ts` — update internal endpoints to proxy to payment-service OR keep as-is and just update the underlying service calls

Files to delete after migration:
- `src/services/flutterwave.service.ts` — replaced by payment-service
- `src/services/payment-cards.service.ts` — replaced by payment-service card endpoints

Note: The wallet internal API endpoints on core-logistics (`/api/wallet/internal/*`) can remain as thin proxies to payment-service during transition, then be removed once all callers are updated.

Add to `services/core-logistics/.env`:
```
PAYMENT_SERVICE_URL=http://localhost:3007
```

### 3.2 platform-service

File to update:
- `src/services/flutterwave-bills.service.ts` — update Flutterwave calls to use payment-service

Add to `services/platform-service/.env`:
```
PAYMENT_SERVICE_URL=http://localhost:3007
```

### 3.3 Cleanup

After Phase 3 is verified working:
- Delete `services/payment-service/src/services/stripe.service.ts` (Stripe not used)
- Delete `services/payment-service/src/webhooks/stripe.webhook.ts` (not used)
- Remove duplicate payment files from core-logistics

### Phase 3 Testing Checklist

- [ ] Book a ride — confirm wallet hold works
- [ ] Complete a ride — confirm wallet deduction works
- [ ] Cancel a ride — confirm wallet hold release works
- [ ] Top up wallet via card — confirm Flutterwave charge works
- [ ] Validate OTP top-up — confirm wallet credit works
- [ ] Save a card — confirm card tokenization works
- [ ] Charge a saved card — confirm tokenized charge works
- [ ] Airtime top-up via platform-service — confirm Flutterwave bills work
- [ ] Data top-up via platform-service — confirm Flutterwave bills work

---

## Key Principle

Each phase is independently testable. If Phase 2 causes an issue, roll back just that service.
core-logistics and everything else remains untouched until Phase 3.

The wallet data lives in Supabase (`wallet_transactions` table) — shared across all services.
No data migration is needed at any phase.

---

## Progress Tracker

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Build payment-service | [ ] Not started | |
| Phase 2 — Migrate marketplace + food | [ ] Not started | Requires Phase 1 |
| Phase 3 — Migrate core-logistics + platform | [ ] Not started | Requires Phase 2 |
