# QUICK TEST FLOW — AIRTIME & DATA TOP-UP

**Base URL (direct):** `http://localhost:3004`
**Base URL (via gateway):** `http://localhost:3000`

All endpoints except the webhook require:
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

---

## STEP 1 — Get Available Networks

**GET** `/api/bills/networks`

No body required.

Expected response (200):
```json
{
  "success": true,
  "message": "Networks fetched successfully",
  "data": {
    "networks": [
      {
        "id": "uuid",
        "name": "MTN",
        "code": "mtn",
        "logo_url": null,
        "supports_airtime": true,
        "supports_data": true
      },
      {
        "id": "uuid",
        "name": "GLO",
        "code": "glo",
        "logo_url": null,
        "supports_airtime": true,
        "supports_data": true
      },
      {
        "id": "uuid",
        "name": "Airtel",
        "code": "airtel",
        "logo_url": null,
        "supports_airtime": true,
        "supports_data": true
      },
      {
        "id": "uuid",
        "name": "9Mobile",
        "code": "9mobile",
        "logo_url": null,
        "supports_airtime": true,
        "supports_data": true
      }
    ]
  },
  "timestamp": "2026-03-15T..."
}
```

---

## STEP 2 — Purchase Airtime

**POST** `/api/bills/airtime/purchase`

Body:
```json
{
  "phone_number": "08148761419",
  "network": "mtn",
  "amount": 100,
  "payment_method": "wallet"
}
```

Notes:
- `network` must match a `code` from Step 1 (e.g. `"mtn"`, `"glo"`, `"airtel"`, `"9mobile"`)
- `amount` must be a number between 50 and 500000
- `payment_method` must be `"wallet"` (card throws "not yet implemented")
- `phone_number` must be a valid Nigerian number (e.g. `08xxxxxxxxx` or `+234xxxxxxxxx`)

Expected response on success (200):
```json
{
  "success": true,
  "message": "Airtime purchase successful",
  "data": {
    "transaction": {
      "id": "uuid",
      "transaction_type": "airtime",
      "network": "MTN",
      "phone_number": "08148761419",
      "amount": 100,
      "status": "successful",
      "flw_reference": "BPUSSD...",
      "created_at": "2026-03-15T..."
    }
  },
  "timestamp": "2026-03-15T..."
}
```

Save the `transaction.id` — you'll need it for Steps 8, 9, 10.

---

## STEP 3 — Get Data Bundles for a Network

**GET** `/api/bills/data-bundles/mtn`

No body. Optional query param: `?validity_type=monthly`
Valid `validity_type` values: `daily`, `weekly`, `monthly`, `yearly`, `one-time`

Expected response (200):
```json
{
  "success": true,
  "message": "Data bundles fetched successfully",
  "data": {
    "network": "MTN",
    "bundles": [
      {
        "id": "uuid",
        "bundle_code": "mtn-MD101",
        "bundle_name": "MTN NIGERIA",
        "amount": 200,
        "data_size": null,
        "validity": null,
        "validity_type": null,
        "flw_item_code": "MD101",
        "last_synced_at": "2026-03-15T..."
      }
    ],
    "last_synced_at": "2026-03-15T..."
  },
  "timestamp": "2026-03-15T..."
}
```

Save a `bundle_code` from the response (e.g. `"mtn-MD101"`) — you'll need it for Step 4.

---

## STEP 4 — Purchase Data Bundle

**POST** `/api/bills/data/purchase`

Body:
```json
{
  "phone_number": "08148761419",
  "network": "mtn",
  "bundle_code": "mtn-MD101",
  "payment_method": "wallet"
}
```

Notes:
- `bundle_code` must come from the bundles list in Step 3 (exact value from `bundle_code` field)
- No `amount` field needed — the price is taken from the cached bundle

Expected response on success (200):
```json
{
  "success": true,
  "message": "Data bundle purchase successful",
  "data": {
    "transaction": {
      "id": "uuid",
      "transaction_type": "data",
      "network": "MTN",
      "phone_number": "08148761419",
      "bundle_name": "MTN NIGERIA",
      "bundle_validity": null,
      "amount": 200,
      "status": "successful",
      "flw_reference": "BPUSSD...",
      "created_at": "2026-03-15T..."
    }
  },
  "timestamp": "2026-03-15T..."
}
```

Note: If you're on test keys, Flutterwave will return "Invalid Biller selected" — the wallet will be refunded automatically. Switch to live keys to complete data purchases.

---

## STEP 5 — Refresh Data Bundle Cache (Admin)

**POST** `/api/bills/data-bundles/refresh`

Body:
```json
{
  "network": "mtn"
}
```

Valid network values: `"mtn"`, `"glo"`, `"airtel"`, `"9mobile"`

Expected response (200):
```json
{
  "success": true,
  "message": "Data bundle cache refreshed successfully",
  "data": {},
  "timestamp": "2026-03-15T..."
}
```

---

## STEP 6 — Get Transaction History

**GET** `/api/bills/transactions`

No body. Optional query params:
- `?page=1&limit=10` (defaults: page=1, limit=10, max limit=100)
- `?type=airtime` or `?type=data` to filter by type

Expected response (200):
```json
{
  "success": true,
  "message": "Transaction history fetched successfully",
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "transaction_type": "airtime",
        "network": "MTN",
        "phone_number": "08148761419",
        "amount": 100,
        "bundle_name": null,
        "bundle_validity": null,
        "payment_method": "wallet",
        "status": "successful",
        "created_at": "2026-03-15T..."
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "total_pages": 1
    }
  },
  "timestamp": "2026-03-15T..."
}
```

---

## STEP 7 — Get Single Transaction

**GET** `/api/bills/transaction/{transaction_id}`

Replace `{transaction_id}` with the `id` from Step 2 or Step 4.

No body required.

Expected response (200):
```json
{
  "success": true,
  "message": "Transaction fetched successfully",
  "data": {
    "transaction": {
      "id": "uuid",
      "user_id": "uuid",
      "transaction_type": "airtime",
      "network": "MTN",
      "phone_number": "08148761419",
      "amount": "100.00",
      "currency_code": "NGN",
      "bundle_code": null,
      "bundle_name": null,
      "bundle_validity": null,
      "payment_method": "wallet",
      "payment_status": "successful",
      "wallet_transaction_id": "uuid",
      "wallet_balance_before": "8124.00",
      "wallet_balance_after": "8024.00",
      "flw_reference": "BPUSSD...",
      "flw_tx_ref": "olakz_airtime_...",
      "flw_biller_code": "BIL099",
      "flw_item_code": null,
      "status": "successful",
      "error_message": null,
      "retry_count": 0,
      "completed_at": "2026-03-15T...",
      "failed_at": null,
      "created_at": "2026-03-15T...",
      "updated_at": "2026-03-15T..."
    }
  },
  "timestamp": "2026-03-15T..."
}
```

---

## STEP 8 — Get Transaction Receipt (Successful Only)

**GET** `/api/bills/transaction/{transaction_id}/receipt`

Replace `{transaction_id}` with the `id` of a **successful** transaction.

No body required.

Expected response (200):
```json
{
  "success": true,
  "message": "Receipt fetched successfully",
  "data": {
    "receipt": {
      "receipt_number": "OLAKZ-XXXXXXXX",
      "transaction_id": "uuid",
      "transaction_type": "airtime",
      "network": "MTN",
      "phone_number": "08148761419",
      "amount": 100,
      "currency": "NGN",
      "bundle_name": null,
      "bundle_validity": null,
      "payment_method": "wallet",
      "flw_reference": "BPUSSD...",
      "status": "successful",
      "completed_at": "2026-03-15T...",
      "issued_at": "2026-03-15T..."
    }
  },
  "timestamp": "2026-03-15T..."
}
```

Error if transaction is not successful (400):
```json
{
  "success": false,
  "message": "Receipt only available for successful transactions",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-03-15T..."
}
```

---

## STEP 9 — Retry a Failed Transaction

**POST** `/api/bills/transaction/{transaction_id}/retry`

Replace `{transaction_id}` with the `id` of a **failed** transaction.

No body required.

Expected response on success (200):
```json
{
  "success": true,
  "message": "Transaction retry successful",
  "data": {
    "transaction": {
      "id": "uuid",
      "status": "successful",
      ...
    }
  },
  "timestamp": "2026-03-15T..."
}
```

Error if transaction is not failed (400):
```json
{
  "success": false,
  "message": "Only failed transactions can be retried",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-03-15T..."
}
```

Error after 3 retries (400):
```json
{
  "success": false,
  "message": "Maximum retry attempts (3) reached",
  "error": { "code": "BAD_REQUEST" },
  "timestamp": "2026-03-15T..."
}
```

---

## STEP 10 — Webhook (Flutterwave Callback)

**POST** `/api/bills/webhook`

No `Authorization` header needed — this is a public endpoint.

Required header:
```
verif-hash: olakz-flw-webhook-secret-2026
Content-Type: application/json
```

Body (simulate a successful bill payment from Flutterwave):
```json
{
  "event": "bill.payment",
  "data": {
    "tx_ref": "olakz_airtime_1773501813826_0dfb1f7e",
    "flw_ref": "BPUSSD1234567890",
    "status": "successful",
    "amount": 100,
    "processor_response": "Successful"
  }
}
```

Expected response (200):
```json
{
  "success": true,
  "message": "Webhook received"
}
```

To test with wrong secret (should return 401):
```
verif-hash: wrong-secret
```

---

## ERROR REFERENCE

| Scenario | Status | Message |
|---|---|---|
| Missing Authorization header | 401 | No token provided |
| Expired/invalid JWT | 401 | Invalid or expired token |
| Invalid phone number | 400 | Invalid Nigerian phone number |
| Amount < 50 or > 500000 | 400 | Amount must be between ₦50 and ₦500,000 |
| Insufficient wallet balance | 500 | Insufficient wallet balance. Required: ₦X, Available: ₦Y |
| Invalid network code | 400 | Invalid or inactive network |
| Invalid bundle_code | 400 | Invalid or unavailable data bundle |
| Transaction not found | 404 | Transaction not found |
| Retry non-failed transaction | 400 | Only failed transactions can be retried |
| Retry limit exceeded | 400 | Maximum retry attempts (3) reached |
| Receipt on non-successful tx | 400 | Receipt only available for successful transactions |
| Wrong webhook secret | 401 | Invalid webhook signature |
| Rate limit exceeded (>5/min) | 429 | Too many requests, please try again later |
