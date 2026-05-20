# BANK ACCOUNTS & WITHDRAWAL API GUIDE

Base URL: `https://olakzride.duckdns.org`  
All requests require: `Authorization: Bearer <token>` unless stated otherwise.  
All responses are JSON.

---

## SECTION 1 — BANK ACCOUNTS

### 1.1 Get Nigerian Banks List

**GET** `/api/payment/banks`

No request body.

**Response**
```json
{
  "success": true,
  "data": {
    "banks": [
      { "id": 1, "code": "044", "name": "Access Bank" },
      { "id": 2, "code": "058", "name": "GTBank" }
    ]
  }
}
```

> Use `code` as `bank_code` when adding a bank account.

---

### 1.2 Add a Bank Account

Account name is automatically verified via Flutterwave before saving.

**POST** `/api/payment/bank-accounts`

```json
{
  "account_number": "0690000031",
  "bank_code": "044",
  "bank_name": "Access Bank",
  "is_default": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `account_number` | Yes | Bank account number |
| `bank_code` | Yes | From 1.1 banks list |
| `bank_name` | Yes | Bank name |
| `is_default` | No | Defaults to `false` |

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "bank_account": {
      "id": "account-uuid",
      "account_number": "0690000031",
      "account_name": "JOHN DOE",
      "bank_code": "044",
      "bank_name": "Access Bank",
      "is_default": true,
      "is_verified": true,
      "created_at": "2026-05-20T10:00:00.000Z"
    }
  },
  "message": "Bank account added successfully"
}
```

**Failed Verification**
```json
{
  "success": false,
  "message": "Could not verify account. Please check the account number and bank."
}
```

---

### 1.3 List Bank Accounts

**GET** `/api/payment/bank-accounts`

No request body.

**Response**
```json
{
  "success": true,
  "data": {
    "bank_accounts": [
      {
        "id": "account-uuid",
        "account_number": "0690000031",
        "account_name": "JOHN DOE",
        "bank_code": "044",
        "bank_name": "Access Bank",
        "is_default": true,
        "is_verified": true,
        "created_at": "2026-05-20T10:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

### 1.4 Set Default Bank Account

**PATCH** `/api/payment/bank-accounts/:id/default`

No request body.

**Response**
```json
{
  "success": true,
  "data": {
    "bank_account": {
      "id": "account-uuid",
      "account_number": "0690000031",
      "account_name": "JOHN DOE",
      "bank_name": "Access Bank",
      "is_default": true
    }
  },
  "message": "Default bank account updated"
}
```

---

### 1.5 Delete a Bank Account

**DELETE** `/api/payment/bank-accounts/:id`

No request body.

**Response**
```json
{
  "success": true,
  "data": null,
  "message": "Bank account deleted"
}
```

---

## SECTION 2 — WITHDRAWALS

Only **earned money** can be withdrawn. Money topped up via card cannot be withdrawn.

Minimum withdrawal: **₦1,000**

The Flutterwave transfer fee is deducted from the earned balance on top of the withdrawal amount.

---

### 2.1 Initiate Withdrawal

**POST** `/api/payment/withdrawals`

```json
{
  "bank_account_id": "account-uuid",
  "amount": 5000
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `bank_account_id` | Yes | From section 1 |
| `amount` | Yes | Minimum ₦1,000 |

**Success Response (201)**
```json
{
  "success": true,
  "data": {
    "withdrawal": {
      "id": "withdrawal-uuid",
      "amount": 5000,
      "fee": 10,
      "net_amount": 5000,
      "status": "processing",
      "bank_account": {
        "bank_name": "Access Bank",
        "account_number": "0690000031",
        "account_name": "JOHN DOE"
      }
    }
  },
  "message": "Withdrawal initiated. Funds will be transferred to your bank account shortly."
}
```

> `fee` is the Flutterwave transfer fee. `net_amount` is what lands in the bank. Both `fee` and `amount` are deducted from earned balance.

**Error — Insufficient Earned Balance**
```json
{
  "success": false,
  "message": "Insufficient earned balance. Available to withdraw: ₦3,000"
}
```

**Error — Below Minimum**
```json
{
  "success": false,
  "message": "Minimum withdrawal amount is ₦1,000"
}
```

**Error — Bank Account Not Found**
```json
{
  "success": false,
  "message": "Bank account not found"
}
```

---

### 2.2 Withdrawal History & Earned Balance

**GET** `/api/payment/withdrawals?page=1&limit=10`

| Query Param | Default |
|-------------|---------|
| `page` | 1 |
| `limit` | 10 |

**Response**
```json
{
  "success": true,
  "data": {
    "withdrawals": [
      {
        "id": "withdrawal-uuid",
        "amount": "5000.00",
        "fee": "10.00",
        "net_amount": "5000.00",
        "status": "processing",
        "flw_transfer_id": "12345",
        "failure_reason": null,
        "created_at": "2026-05-20T10:00:00.000Z",
        "updated_at": "2026-05-20T10:00:00.000Z",
        "bank_account": {
          "account_number": "0690000031",
          "account_name": "JOHN DOE",
          "bank_name": "Access Bank"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "totalPages": 1
    },
    "earned_balance": 3000
  }
}
```

> `earned_balance` is the amount currently available to withdraw.

**Withdrawal status values:**
| Status | Meaning |
|--------|---------|
| `processing` | Transfer sent, awaiting bank confirmation |
| `completed` | Money delivered to bank account |
| `failed` | Transfer failed — amount refunded to earned balance |

---

## SECTION 3 — NOTES

- `earned_balance` in the withdrawal history response shows how much the user can currently withdraw
- If a withdrawal fails, the full amount (including fee) is automatically refunded back to the earned balance
- Withdrawal status updates from `processing` to `completed` or `failed` via Flutterwave webhook — this only works in production with a public URL configured in the Flutterwave dashboard
- In test mode, withdrawals stay in `processing` status — this is expected

---

## Test Bank Account (Development Only)

| Field | Value |
|-------|-------|
| `account_number` | `0690000031` |
| `bank_code` | `044` |
| `bank_name` | `Access Bank` |
