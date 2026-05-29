# Airtime & Data Top-Up API Guide

Base URL: `https://olakzride.duckdns.org`

All requests require a Bearer token in the Authorization header.

---

## AIRTIME PURCHASE

### Flow
1. Get available networks
2. Purchase airtime

---

### 1. Get Networks

```
GET /api/bills/networks
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": [
    { "id": "...", "code": "mtn", "name": "MTN", "supports_airtime": true, "supports_data": true },
    { "id": "...", "code": "glo", "name": "GLO", "supports_airtime": true, "supports_data": true },
    { "id": "...", "code": "airtel", "name": "Airtel", "supports_airtime": true, "supports_data": true },
    { "id": "...", "code": "9mobile", "name": "9Mobile", "supports_airtime": true, "supports_data": true }
  ]
}
```

Use the `code` field when making purchases.

---

### 2. Purchase Airtime

```
POST /api/bills/airtime/purchase
Authorization: Bearer <token>
Content-Type: application/json
```

Request body:
```json
{
  "phone_number": "08012345678",
  "network": "mtn",
  "amount": 100,
  "payment_method": "wallet"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| phone_number | string | yes | Nigerian phone number |
| network | string | yes | `mtn`, `glo`, `airtel`, `9mobile` |
| amount | number | yes | Min: 50, Max: 500000 (in Naira) |
| payment_method | string | yes | Only `wallet` is supported |

Success response:
```json
{
  "success": true,
  "message": "Airtime purchase successful",
  "data": {
    "transaction": {
      "id": "...",
      "transaction_type": "airtime",
      "network": "MTN",
      "phone_number": "08012345678",
      "amount": 100,
      "status": "successful",
      "flw_reference": "BPUSSD...",
      "created_at": "2026-05-26T..."
    }
  }
}
```

---

## DATA BUNDLE PURCHASE

### Flow
1. Get available networks (same endpoint above)
2. Get data bundles for the selected network
3. Purchase data bundle

---

### 1. Get Data Bundles

```
GET /api/bills/data-bundles/:network
Authorization: Bearer <token>
```

Replace `:network` with `mtn`, `glo`, `airtel`, or `9mobile`.

Example:
```
GET /api/bills/data-bundles/mtn
```

Response:
```json
{
  "success": true,
  "data": {
    "network": "MTN",
    "bundles": [
      {
        "id": "...",
        "bundle_code": "mtn-MD104",
        "bundle_name": "MTN 100 MB DATA BUNDLE",
        "amount": 100,
        "validity": "1 day(s)",
        "flw_item_code": "MD104"
      },
      {
        "id": "...",
        "bundle_code": "mtn-MD105",
        "bundle_name": "MTN 500MB data purchase",
        "amount": 200,
        "validity": "30 day(s)",
        "flw_item_code": "MD105"
      }
    ]
  }
}
```

Save the `bundle_code` — you need it for the purchase.

---

### 2. Purchase Data Bundle

```
POST /api/bills/data/purchase
Authorization: Bearer <token>
Content-Type: application/json
```

Request body:
```json
{
  "phone_number": "08012345678",
  "network": "mtn",
  "bundle_code": "mtn-MD104",
  "payment_method": "wallet"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| phone_number | string | yes | Nigerian phone number |
| network | string | yes | `mtn`, `glo`, `airtel`, `9mobile` |
| bundle_code | string | yes | From the bundles list e.g. `mtn-MD104` |
| payment_method | string | yes | Only `wallet` is supported |

Success response:
```json
{
  "success": true,
  "message": "Data bundle purchase successful",
  "data": {
    "transaction": {
      "id": "...",
      "transaction_type": "data",
      "network": "MTN",
      "phone_number": "08012345678",
      "bundle_name": "MTN 100 MB DATA BUNDLE",
      "bundle_validity": "1 day(s)",
      "amount": 100,
      "status": "successful",
      "flw_reference": "...",
      "created_at": "2026-05-26T..."
    }
  }
}
```

---

## TRANSACTION HISTORY

```
GET /api/bills/transactions?page=1&limit=10&type=airtime
Authorization: Bearer <token>
```

Query params:
- `page` — page number (default: 1)
- `limit` — items per page (default: 10)
- `type` — filter by `airtime` or `data` (optional, returns both if omitted)

---


## Transation receipt 
GET /api/bills/transaction/:transaction_id/receipt

Success response:

{
    "success": true,
    "message": "Receipt fetched successfully",
    "data": {
        "receipt": {
            "receipt_number": "OLAKZ-E6C17ADD",
            "transaction_id": "e6c17add-90b4-428f-8527-1b5fc98bc4c2",
            "transaction_type": "airtime",
            "network": "MTN",
            "phone_number": "08063899074",
            "amount": 50,
            "currency": "NGN",
            "bundle_name": null,
            "bundle_validity": null,
            "payment_method": "wallet",
            "flw_reference": "BPUSSD17798417915865738824",
            "status": "successful",
            "completed_at": "2026-05-27T00:29:54.337Z",
            "issued_at": "2026-05-27T00:35:53.892Z"
        }
    },
    "timestamp": "2026-05-27T00:35:53.892Z"
}



## Single transation

GET /api/bills/transaction/:transaction_id


## ERROR HANDLING

All errors follow this format:
```json
{
  "success": false,
  "message": "Error description here",
  "error": { "code": "BAD_REQUEST" }
}
```

Common errors:

| Message | Cause |
|---------|-------|
| Insufficient wallet balance | User wallet balance is too low |
| Invalid or inactive network | Wrong network code sent |
| Invalid or unavailable data bundle | bundle_code doesn't exist or is wrong |
| Data bundle purchase failed | Flutterwave/network rejected the transaction |

When a purchase fails, the wallet is automatically refunded.

---

## IMPORTANT NOTES

- Always call **Get Data Bundles** first before showing the data purchase screen — bundle codes change.
- The `bundle_code` format is always `{network}-{item_code}` e.g. `glo-MD147`, `mtn-MD104`.
- Only `wallet` payment is supported. Make sure the user has sufficient balance before initiating.
- Check wallet balance via `GET /api/payment/wallet/balance` before purchase.
