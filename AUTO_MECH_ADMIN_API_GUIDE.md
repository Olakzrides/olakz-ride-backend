# Auto Mech — Admin API Guide

> Base URL (via gateway): `https://<your-gateway-domain>`  
> All endpoints require an **admin or super_admin JWT** in the Authorization header.

---

## Authentication

Every request must include:

```
Authorization: Bearer <admin_jwt_token>
```

The token is obtained from the standard admin login endpoint. If the token is expired or revoked the API returns `401`.

---

## Base Path

All auto mech admin endpoints sit under:

```
/api/admin/auto-mech
```

---

## 1. Dashboard

### `GET /api/admin/auto-mech/dashboard`

Returns summary stats for the auto mech overview cards.

**Request:** No body, no query params.

**Response:**
```json
{
  "success": true,
  "data": {
    "vendors": {
      "total": 42,
      "pending": 5,
      "approved": 30,
      "suspended": 4,
      "rejected": 3
    },
    "bookings": {
      "total": 310,
      "pending": 18,
      "confirmed": 22,
      "in_progress": 7,
      "completed": 240,
      "cancelled": 23
    },
    "revenue": {
      "total": 1850000.00,
      "this_month": 245000.00,
      "month_orders": 38
    }
  }
}
```

**UI usage:** Summary cards at top of Auto Mech page — vendor counts, booking counts, revenue totals.

---

## 2. Vendors

### `GET /api/admin/auto-mech/vendors`

Paginated list of all auto mech vendors.

**Query params (all optional):**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by `pending`, `approved`, `rejected`, `suspended` |
| `city` | string | Partial match on city name |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response:**
```json
{
  "success": true,
  "data": {
    "vendors": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "business_name": "Femi Auto Works",
        "phone": "08012345678",
        "email": "femi@autoworks.com",
        "city": "Lagos",
        "state": "Lagos",
        "address": "5 Mechanic Rd, Surulere",
        "status": "approved",
        "rating": "4.50",
        "total_customers": 120,
        "total_hours_served": "340.00",
        "logo_url": "https://...",
        "cover_image_url": "https://...",
        "created_at": "2026-01-15T10:00:00Z",
        "updated_at": "2026-08-20T14:30:00Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

---

### `GET /api/admin/auto-mech/vendors/:id`

Full vendor detail — profile, owner identity, submitted documents, wallet balance, booking stats, and active services.

**Response:**
```json
{
  "success": true,
  "data": {
    "vendor": {
      "id": "uuid",
      "business_name": "Femi Auto Works",
      "description": "Experienced auto mechanic...",
      "phone": "08012345678",
      "email": "femi@autoworks.com",
      "address": "5 Mechanic Rd, Surulere",
      "city": "Lagos",
      "state": "Lagos",
      "latitude": "6.51234560",
      "longitude": "3.37654320",
      "logo_url": "https://...",
      "cover_image_url": "https://...",
      "status": "approved",
      "rating": "4.50",
      "total_customers": 120,
      "total_hours_served": "340.00",
      "operating_hours": {
        "monday":    { "open": "08:00", "close": "18:00", "closed": false },
        "tuesday":   { "open": "08:00", "close": "18:00", "closed": false },
        "wednesday": { "open": "08:00", "close": "18:00", "closed": false },
        "thursday":  { "open": "08:00", "close": "18:00", "closed": false },
        "friday":    { "open": "08:00", "close": "18:00", "closed": false },
        "saturday":  { "open": "09:00", "close": "15:00", "closed": false },
        "sunday":    { "open": "00:00", "close": "00:00", "closed": true }
      },
      "is_open": true,
      "rejection_reason": null,
      "reviewed_at": "2026-01-20T09:00:00Z",
      "created_at": "2026-01-15T10:00:00Z",

      "owner": {
        "id": "uuid",
        "name": "Femi Adeyemi",
        "email": "femi@autoworks.com",
        "phone": "08012345678",
        "avatar_url": "https://...",
        "account_status": "active",
        "email_verified": true
      },

      "documents": {
        "nin_number": "***provided***",
        "cac_document_url": "https://...",
        "profile_picture_url": "https://...",
        "store_images": ["https://...", "https://..."],
        "registration_status": "approved",
        "approved_at": "2026-01-20T09:00:00Z"
      },

      "wallet_balance": 45000.00,
      "wallet_formatted": "₦45,000.00",

      "stats": {
        "total_bookings": 145,
        "completed_bookings": 120,
        "cancelled_bookings": 10,
        "pending_bookings": 3,
        "total_revenue": 870000.00
      },

      "services": [
        {
          "id": "uuid",
          "name": "Full Engine Overhaul",
          "category": "engine_repair",
          "duration_minutes": 180,
          "price": "45000.00",
          "price_min": "45000.00",
          "price_max": "80000.00",
          "is_active": true
        }
      ]
    }
  }
}
```

---

### `GET /api/admin/auto-mech/vendors/:id/wallet-balance`

Standalone wallet balance for a vendor.

**Response:**
```json
{
  "success": true,
  "data": {
    "vendor_id": "uuid",
    "user_id": "uuid",
    "business_name": "Femi Auto Works",
    "status": "approved",
    "first_name": "Femi",
    "last_name": "Adeyemi",
    "email": "femi@autoworks.com",
    "phone": "08012345678",
    "wallet_balance": 45000.00,
    "currency_code": "NGN",
    "formatted_balance": "₦45,000.00"
  }
}
```

---

### `GET /api/admin/auto-mech/vendors/:id/bookings`

Booking history for a specific vendor.

**Query params (all optional):**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `pending`, `confirmed`, `in_progress`, `completed`, `cancelled` |
| `from` | ISO date | e.g. `2026-08-01` |
| `to` | ISO date | e.g. `2026-08-31` |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response:**
```json
{
  "success": true,
  "data": {
    "vendor": {
      "id": "uuid",
      "business_name": "Femi Auto Works"
    },
    "orders": [
      {
        "sn": 1,
        "id": "uuid",
        "booking_type": "book_now",
        "status": "completed",
        "scheduled_at": null,
        "service_address": "12 Eko Road, Lagos",
        "service": {
          "id": "uuid",
          "name": "Oil Change",
          "category": "oil_change",
          "duration_minutes": 45
        },
        "vehicle": {
          "make": "Toyota",
          "model": "Camry",
          "year": 2020,
          "plate_number": "AHD583LG"
        },
        "customer": {
          "name": "Chidi Okafor",
          "phone": "08099887766"
        },
        "amount": {
          "total": 8000.00,
          "estimated_cost_min": 8000.00,
          "estimated_cost_max": null,
          "payment_method": "wallet",
          "payment_status": "paid"
        },
        "rating": 5,
        "feedback": "Very professional",
        "created_at": "2026-08-15T11:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 145,
      "pages": 8
    }
  }
}
```

---

## 3. Vendor Actions

### `POST /api/admin/auto-mech/vendors/:id/approve`

Approves a pending vendor.

**Request body:** None required.

**Response:**
```json
{
  "success": true,
  "data": { "vendor": { "id": "uuid", "status": "approved", ... } },
  "message": "Auto mech vendor approved"
}
```

---

### `POST /api/admin/auto-mech/vendors/:id/reject`

Rejects a pending vendor. Reason is **required**.

**Request body:**
```json
{ "reason": "Incomplete documentation submitted" }
```

**Response:**
```json
{
  "success": true,
  "data": { "vendor": { "id": "uuid", "status": "rejected", ... } },
  "message": "Auto mech vendor rejected"
}
```

---

### `POST /api/admin/auto-mech/vendors/:id/suspend`

Suspends an approved vendor. Reason is **optional**.

**Request body:**
```json
{ "reason": "Multiple customer complaints" }
```

**Response:**
```json
{
  "success": true,
  "data": { "vendor": { "id": "uuid", "status": "suspended", ... } },
  "message": "Auto mech vendor suspended"
}
```

---

### `POST /api/admin/auto-mech/vendors/:id/reactivate`

Reactivates a suspended vendor (sets status back to `approved`).

**Request body:** None required.

**Response:**
```json
{
  "success": true,
  "data": { "vendor": { "id": "uuid", "status": "approved", ... } },
  "message": "Auto mech vendor reactivated"
}
```

---

## 4. Bookings

### `GET /api/admin/auto-mech/bookings/status-counts`

Returns a count per booking status. Use this for the filter pill badges on the bookings table.

**Query params (all optional):**

| Param | Type | Description |
|-------|------|-------------|
| `vendor_id` | UUID | Scope counts to a single vendor |
| `from` | ISO date | Start of date range |
| `to` | ISO date | End of date range |

**Response:**
```json
{
  "success": true,
  "data": {
    "all": 310,
    "pending": 18,
    "confirmed": 22,
    "in_progress": 7,
    "completed": 240,
    "cancelled": 23
  }
}
```

---

### `GET /api/admin/auto-mech/bookings`

All bookings across all vendors. Paginated and filterable.

**Query params (all optional):**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `pending`, `confirmed`, `in_progress`, `completed`, `cancelled` |
| `vendor_id` | UUID | Filter to a specific vendor |
| `from` | ISO date | e.g. `2026-08-01` |
| `to` | ISO date | e.g. `2026-08-31` |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response:**
```json
{
  "success": true,
  "data": {
    "bookings": [
      {
        "sn": 1,
        "id": "uuid",
        "booking_reference": "MEC-2026-001234",
        "status": "completed",
        "booking_type": "book_now",
        "scheduled_at": null,
        "service_address": "12 Eko Road, Lagos",
        "vehicle": {
          "make": "Toyota",
          "model": "Camry",
          "year": 2020,
          "plate_number": "AHD583LG"
        },
        "customer": {
          "id": "uuid",
          "name": "Chidi Okafor"
        },
        "vendor": {
          "id": "uuid",
          "business_name": "Femi Auto Works"
        },
        "service": {
          "id": "uuid",
          "name": "Oil Change",
          "category": "oil_change"
        },
        "amount": {
          "total": 8000.00,
          "estimated_cost_min": 8000.00,
          "estimated_cost_max": null,
          "payment_method": "wallet",
          "payment_status": "paid"
        },
        "customer_rating": 5,
        "created_at": "2026-08-15T11:00:00Z"
      }
    ],
    "total": 310,
    "page": 1,
    "limit": 20
  }
}
```

---

### `GET /api/admin/auto-mech/bookings/:bookingId`

Full detail for a single booking — customer, vendor, service, vehicle, payment, timeline.

**Response:**
```json
{
  "success": true,
  "data": {
    "booking": {
      "id": "uuid",
      "booking_reference": "MEC-2026-001234",
      "booking_type": "book_now",
      "status": "completed",
      "scheduled_at": null,
      "service_address": "12 Eko Road, Lagos",
      "service_latitude": "6.51234560",
      "service_longitude": "3.37654320",

      "vehicle": {
        "make": "Toyota",
        "model": "Camry",
        "year": 2020,
        "plate_number": "AHD583LG",
        "description": "White car, dent on rear bumper",
        "photo_urls": ["https://...", "https://..."]
      },

      "notes": "Please check the brake pads too",

      "payment": {
        "total_amount": 8000.00,
        "estimated_cost_min": 8000.00,
        "estimated_cost_max": 12000.00,
        "duration_display": "45 minutes",
        "payment_method": "wallet",
        "payment_status": "paid"
      },

      "customer": {
        "id": "uuid",
        "name": "Chidi Okafor",
        "email": "chidi@email.com",
        "phone": "08099887766",
        "avatar_url": "https://..."
      },

      "vendor": {
        "id": "uuid",
        "business_name": "Femi Auto Works",
        "phone": "08012345678",
        "email": "femi@autoworks.com",
        "address": "5 Mechanic Rd, Surulere",
        "city": "Lagos",
        "state": "Lagos",
        "logo_url": "https://...",
        "rating": 4.5
      },

      "service": {
        "id": "uuid",
        "name": "Oil Change",
        "category": "oil_change",
        "duration_minutes": 45,
        "price": "8000.00",
        "price_min": "8000.00",
        "price_max": "12000.00"
      },

      "customer_rating": 5,
      "customer_feedback": "Very professional",
      "vendor_rating": null,

      "timeline": {
        "created_at": "2026-08-15T11:00:00Z",
        "started_at": "2026-08-15T11:30:00Z",
        "completed_at": "2026-08-15T12:15:00Z",
        "cancelled_at": null
      },

      "cancellation_reason": null
    }
  }
}
```

---

## 5. Status & Enum Reference

**Vendor status values:**

| Value | Meaning |
|-------|---------|
| `pending` | Registered, awaiting admin review |
| `approved` | Active and visible to customers |
| `rejected` | Application rejected |
| `suspended` | Temporarily blocked by admin |

**Booking status values:**

| Value | Meaning |
|-------|---------|
| `pending` | Created, awaiting vendor confirmation |
| `confirmed` | Vendor confirmed the booking |
| `in_progress` | Mechanic has started the job |
| `completed` | Job done, payment settled |
| `cancelled` | Cancelled by customer or vendor |

**Booking type values:**

| Value | Meaning |
|-------|---------|
| `book_now` | Immediate booking |
| `scheduled` | Booked for a future date/time |

**Payment method values:**

| Value |
|-------|
| `wallet` |
| `card` |
| `cash` |

**Payment status values:**

| Value |
|-------|
| `pending` |
| `paid` |
| `failed` |
| `refunded` |

---

## 6. Error Responses

All errors follow the same shape:

```json
{
  "success": false,
  "error": {
    "message": "Auto mech vendor not found"
  },
  "timestamp": "2026-09-01T13:24:01.466Z"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Bad request (missing required field) |
| `401` | Token missing, invalid, or revoked |
| `403` | Not an admin |
| `404` | Vendor or booking not found |
| `500` | Server error |

---

## 7. Suggested UI Flow

```
Auto Mech Section
├── Overview page
│   └── GET /dashboard  → summary cards
│
├── Vendors page
│   ├── GET /vendors?status=&city=&page=  → table list
│   ├── GET /vendors/:id                  → vendor detail modal/page
│   │   ├── Owner info tab
│   │   ├── Documents tab
│   │   ├── Services tab
│   │   ├── Wallet tab  → GET /vendors/:id/wallet-balance
│   │   └── Bookings tab → GET /vendors/:id/bookings
│   └── Action buttons on vendor detail
│       ├── Approve  → POST /vendors/:id/approve
│       ├── Reject   → POST /vendors/:id/reject   (prompt for reason)
│       ├── Suspend  → POST /vendors/:id/suspend  (reason optional)
│       └── Reactivate → POST /vendors/:id/reactivate
│
└── Bookings page
    ├── GET /bookings/status-counts  → pill badge counts
    ├── GET /bookings?status=&vendor_id=&from=&to=&page=  → table
    └── GET /bookings/:bookingId     → booking detail modal
```
