


---

## SECTION 3 — FUND WALLET VIA BANK TRANSFER (Virtual Account)

Users can fund their wallet by transferring money from any Nigerian bank to a dedicated account number generated for them. Money reflects automatically.

Base URL: `https://olakzride.duckdns.org`  
All requests require: `Authorization: Bearer <token>`

---

### How it works

1. User taps "Fund Wallet"
2. App calls `GET /api/payment/wallet/virtual-account`
3. If account exists → show account details
4. If no account yet → show BVN input screen → call `POST` with BVN → show account details
5. User transfers money from their bank app to the shown account number
6. Wallet is credited automatically within 1–5 minutes

---

### 3.1 Get Existing Virtual Account

Call this first whenever the user opens the Fund Wallet screen.

**GET** `/api/payment/wallet/virtual-account`

No request body.

**Response — account exists**
```json
{
  "success": true,
  "data": {
    "virtual_account": {
      "account_number": "1234567890",
      "bank_name": "Wema Bank",
      "account_name": "JOHN DOE"
    }
  }
}
```

**Response — no account yet (404)**
```json
{
  "success": false,
  "message": "No virtual account found. Call POST to generate one."
}
```

If you get a 404, proceed to 3.2.

---

### 3.2 Generate Virtual Account (First Time Only)

Show a screen asking for the user's BVN. Explain: *"Your BVN is required once to generate your dedicated wallet account number."*

**POST** `/api/payment/wallet/virtual-account`

```json
{
  "bvn": "12345678901"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `bvn` | Yes | User's 11-digit BVN |

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "virtual_account": {
      "account_number": "1234567890",
      "bank_name": "Wema Bank",
      "account_name": "JOHN DOE"
    }
  },
  "message": "Virtual account created successfully"
}
```

**Error — missing or invalid BVN**
```json
{
  "success": false,
  "message": "BVN must be 11 digits"
}
```

---

### 3.3 What to Display to the User

After getting the account details (from GET or POST), show:

```
Fund Your Wallet

Transfer any amount to:

Bank:            Wema Bank
Account Number:  1234567890
Account Name:    JOHN DOE

Your wallet will be credited automatically
within a few minutes after transfer.
```

Include a "Copy Account Number" button.

---

### Notes for Frontend

- The account number is permanent — cache it locally after first fetch, no need to call the API every time
- BVN is only needed once. After the account is created, `POST` returns the existing account without asking for BVN again
- After the user transfers, wallet balance updates automatically — no polling needed, just refresh balance when user returns to the wallet screen
- No minimum transfer amount
