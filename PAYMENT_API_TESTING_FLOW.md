# Payment Service API Testing Flow

Base URL (via gateway): `http://localhost:3000`
Direct service URL: `http://localhost:3007`

Internal API key: `olakz-internal-api-key-2026-secure`

---

## 1. Health Check

Confirms the payment-service is running and healthy. No auth required.

```
GET /api/payment/health
```

Success `200`:
```json
{
  "status": "healthy",
  "service": "payment-service",
  "version": "1.0.0",
  "uptime": 42.5,
  "timestamp": "2026-04-11T10:00:00.000Z"
}
```

---

## 2. Get Wallet Balance (User-Facing)

Returns the current wallet balance for the authenticated user. Calculates balance from all completed transactions in the `wallet_transactions` table.

```
GET /api/payment/wallet/balance
Authorization: Bearer <jwt_token>
```

Query params (optional): `currency=NGN`

Success `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "wallet": {
      "balance": 50000,
      "currency_code": "NGN"
    }
  }
}
```

Error — missing token `401`:
```json
{
  "success": false,
  "message": "Missing or invalid authorization header"
}
```

---

## 3. Get Wallet Balance (Internal API)

Used by other services (food-service, marketplace-service, core-logistics) to check a user's wallet balance without a JWT. Requires the internal API key and the target user's ID in a header.

```
GET /api/internal/payment/wallet/balance
x-internal-api-key: olakz-internal-api-key-2026-secure
x-user-id: <user_uuid>
```

Query params (optional): `currency=NGN`

Success `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "wallet": {
      "balance": 50000,
      "currency_code": "NGN"
    }
  }
}
```

Error — missing API key `401`:
```json
{
  "success": false,
  "message": "Invalid or missing internal API key"
}
```

Error — missing user ID `400`:
```json
{
  "success": false,
  "message": "x-user-id header is required"
}
```

---

## 4. Deduct from Wallet (Internal API)

Used by other services to deduct an amount from a user's wallet. Called when a user pays for an order, ride, or any service. Checks balance before deducting — returns error if insufficient.

```
POST /api/internal/payment/wallet/deduct
x-internal-api-key: olakz-internal-api-key-2026-secure
x-user-id: <user_uuid>
Content-Type: application/json
```

Request:
```json
{
  "amount": 5000,
  "currency_code": "NGN",
  "reference": "order_abc123_1714000000000",
  "description": "Marketplace order payment"
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "transaction": {
      "id": "uuid",
      "amount": 5000,
      "status": "completed",
      "reference": "order_abc123_1714000000000"
    },
    "wallet": {
      "balance": 45000,
      "currency_code": "NGN"
    }
  }
}
```

Error — insufficient balance `400`:
```json
{
  "success": false,
  "message": "Insufficient wallet balance. Required: ₦5000.00, Available: ₦2000.00"
}
```

Error — missing reference `400`:
```json
{
  "success": false,
  "message": "reference is required"
}
```

---

## 5. Credit Wallet (Internal API)

Used by other services to add funds to a user's wallet. Called for refunds, order cancellations, or any credit operation.

```
POST /api/internal/payment/wallet/credit
x-internal-api-key: olakz-internal-api-key-2026-secure
x-user-id: <user_uuid>
Content-Type: application/json
```

Request:
```json
{
  "amount": 5000,
  "currency_code": "NGN",
  "reference": "refund_order_abc123_1714000000000",
  "description": "Refund: marketplace order cancelled"
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "transaction": {
      "id": "uuid",
      "amount": 5000,
      "status": "completed",
      "reference": "refund_order_abc123_1714000000000"
    },
    "wallet": {
      "balance": 55000,
      "currency_code": "NGN"
    }
  }
}
```

Error — missing reference `400`:
```json
{
  "success": false,
  "message": "reference is required"
}
```

---

## 6. List Saved Cards

Returns all active saved payment cards for the authenticated user. Cards are ordered with the default card first.

```
GET /api/payment/cards
Authorization: Bearer <jwt_token>
```

Success `200` (with cards):
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "cards": [
      {
        "id": "uuid",
        "card_last4": "4242",
        "card_brand": "ACCESS BANK NIGERIA",
        "card_type": "VISA",
        "card_exp_month": "12",
        "card_exp_year": "2027",
        "cardholder_name": "John Doe",
        "bank_name": "Access Bank",
        "is_default": true,
        "created_at": "2026-04-11T10:00:00.000Z"
      }
    ]
  }
}
```

Success `200` (no cards):
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "cards": []
  }
}
```

---

## 7. Top Up Wallet via Card

Initiates a wallet top-up by charging a card. Supports both saved cards (by `card_id`) and new card details. If the card requires OTP/PIN authorization, returns a pending state with `flw_ref` to use in the validate step.

```
POST /api/payment/wallet/topup
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Option A — Using a saved card

```json
{
  "amount": 10000,
  "currency_code": "NGN",
  "card_id": "uuid-of-saved-card"
}
```

### Option B — Using new card details

```json
{
  "amount": 10000,
  "currency_code": "NGN",
  "card_details": {
    "card_number": "5531886652142950",
    "cvv": "564",
    "expiry_month": "09",
    "expiry_year": "32",
    "fullname": "John Doe",
    "pin": "3310"
  }
}
```

Success — immediate charge `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "message": "Wallet top-up successful",
    "transaction": {
      "id": "uuid",
      "amount": 10000,
      "currency_code": "NGN",
      "reference": "topup_1714000000000_uuid"
    },
    "wallet": {
      "balance": 60000,
      "currency_code": "NGN"
    }
  }
}
```

Success — OTP required `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "status": "pending_authorization",
    "message": "Please validate the charge with OTP",
    "authorization": {
      "mode": "otp"
    },
    "flw_ref": "FLW-MOCK-abc123",
    "tx_ref": "topup_uuid_1714000000000",
    "amount": 10000,
    "currency_code": "NGN"
  }
}
```

Error — insufficient amount `400`:
```json
{
  "success": false,
  "message": "Minimum top-up amount is ₦100"
}
```

Error — no payment method `400`:
```json
{
  "success": false,
  "message": "Either card_id or card_details is required"
}
```

---

## 8. Validate Wallet Top-Up OTP

Completes a pending card charge by submitting the OTP. Called after receiving `pending_authorization` from the topup endpoint.

```
POST /api/payment/wallet/topup/validate
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

Request:
```json
{
  "flw_ref": "FLW-MOCK-abc123",
  "otp": "12345",
  "amount": 10000,
  "currency_code": "NGN"
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "message": "Wallet top-up successful",
    "transaction": {
      "id": "uuid",
      "amount": 10000,
      "currency_code": "NGN",
      "reference": "topup_1714000000000_uuid"
    },
    "wallet": {
      "balance": 60000,
      "currency_code": "NGN"
    }
  }
}
```

Error — invalid OTP `400`:
```json
{
  "success": false,
  "message": "OTP validation failed"
}
```

---

## Common Error Responses

`401 Unauthorized`:
```json
{ "success": false, "message": "Missing or invalid authorization header" }
```

`401 Invalid internal key`:
```json
{ "success": false, "message": "Invalid or missing internal API key" }
```

`500 Internal Server Error`:
```json
{
  "success": false,
  "message": "Internal server error",
  "error": { "code": "INTERNAL_SERVER_ERROR" }
}
```

---

## Recommended Testing Order

1. `GET /api/payment/health` — confirm service is up
2. `GET /api/payment/wallet/balance` (JWT) — check user balance
3. `POST /api/internal/payment/wallet/credit` — add funds to wallet
4. `GET /api/payment/wallet/balance` — confirm balance increased
5. `POST /api/internal/payment/wallet/deduct` — deduct from wallet
6. `GET /api/payment/wallet/balance` — confirm balance decreased
7. `POST /api/internal/payment/wallet/deduct` (amount > balance) — confirm insufficient balance error
8. `GET /api/payment/cards` — list saved cards (empty initially)
9. `POST /api/payment/wallet/topup` with card details — initiate top-up
10. If OTP required: `POST /api/payment/wallet/topup/validate` — complete with OTP
