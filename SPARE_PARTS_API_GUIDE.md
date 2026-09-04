# Spare Parts — Complete API Guide
## Admin Dashboard + Vendor Dashboard

> Base URL (via gateway): `https://olakzride.duckdns.org`  
> All authenticated endpoints require: `Authorization: Bearer <jwt_token>`

---

## Authentication

| Role | How to get token |
|------|-----------------|
| Customer | Standard login |
| Vendor | Standard login — must have approved `spare_parts` store |
| Admin | Admin login |

---

## Health Check

```
GET /api/spare-parts/health
```
```json
{ "success": true, "service": "spare-parts-service", "status": "healthy" }
```

---

# PART 1 — ADMIN DASHBOARD

> **Note:** The spare-parts service has no dedicated `/api/admin/spare-parts` endpoints yet — admin management is handled through the existing **`/api/admin/vendors`** endpoints (same flow as marketplace/food). The admin can:
> - View all spare-parts vendors via `GET /api/admin/vendors?business_type=spare_parts`
> - Approve/reject/suspend via `POST /api/admin/vendors/:id/approve|reject|suspend`
> - View wallet balance via `GET /api/admin/vendors/:id/view-wallet-balance`
>
> The following are the data endpoints the admin frontend needs to read directly from the spare-parts service for order/store monitoring.

---

## 1.1 Store Listing (Admin view — public endpoint, no auth)

### `GET /api/spare-parts/stores`

List all stores with filters.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `city` | string | Filter by city |
| `state` | string | Filter by state |
| `category` | string | Filter by category name |
| `search` | string | Search store name |
| `is_open` | boolean | Only open stores |
| `is_verified` | boolean | Only verified/approved stores |
| `page` | number | Default 1 |
| `limit` | number | Default 20 |

**Response:**
```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "id": "uuid",
        "name": "Eko Auto Parts",
        "logoUrl": "https://...",
        "bannerUrl": "https://...",
        "address": "5 Eko Road, Lagos",
        "city": "Lagos",
        "state": "Lagos",
        "phone": "08012345678",
        "isOpen": true,
        "isVerified": true,
        "averageRating": 4.5,
        "totalRatings": 42,
        "totalOrders": 120,
        "categories": ["Engine Parts", "Tyres"]
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### `GET /api/spare-parts/stores/:id`

Full store profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Eko Auto Parts",
    "description": "Quality spare parts since 2010",
    "logoUrl": "https://...",
    "bannerUrl": "https://...",
    "address": "5 Eko Road, Lagos",
    "city": "Lagos",
    "state": "Lagos",
    "latitude": "6.5244",
    "longitude": "3.3792",
    "phone": "08012345678",
    "email": "eko@autoparts.com",
    "isActive": true,
    "isOpen": true,
    "isVerified": true,
    "averageRating": 4.5,
    "totalRatings": 42,
    "totalOrders": 120,
    "operatingHours": {
      "monday": { "open": "08:00", "close": "18:00", "closed": false }
    },
    "categories": [{ "id": "uuid", "name": "Engine Parts" }],
    "createdAt": "2026-01-15T10:00:00Z"
  }
}
```

---

### `GET /api/spare-parts/stores/:id/reviews`

Store reviews.

**Query:** `?page=1&limit=10`

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "storeRating": 5,
        "comment": "Fast delivery, genuine parts",
        "customerId": "uuid",
        "createdAt": "2026-08-15T10:00:00Z",
        "productReviews": [
          { "productId": "uuid", "productRating": 5 }
        ]
      }
    ],
    "total": 42,
    "averageRating": 4.5
  }
}
```

---

## 1.2 Categories (Admin-managed global taxonomy)

### `GET /api/spare-parts/categories`

Returns all active global categories (no auth).

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Engine Parts", "iconUrl": "https://...", "sortOrder": 1 },
    { "id": "uuid", "name": "Tyres & Rims", "iconUrl": "https://...", "sortOrder": 2 },
    { "id": "uuid", "name": "Brakes",        "iconUrl": "https://...", "sortOrder": 3 },
    { "id": "uuid", "name": "Electrical",    "iconUrl": "https://...", "sortOrder": 4 },
    { "id": "uuid", "name": "Body Parts",    "iconUrl": "https://...", "sortOrder": 5 }
  ]
}
```

---

## 1.3 Products

### `GET /api/spare-parts/stores/:id/products`

All products for a store.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `category_id` | UUID | Filter by category |
| `search` | string | Search product name |
| `min_price` | number | Min price filter |
| `max_price` | number | Max price filter |
| `is_available` | boolean | Available products only |
| `page` | number | Default 1 |
| `limit` | number | Default 20 |

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Michelin Tyre 225/70R16",
        "description": "Genuine Michelin tyre",
        "price": 45000.00,
        "images": ["https://...", "https://..."],
        "specs": { "Size": "225/70R16", "Brand": "Michelin", "Type": "Radial" },
        "isActive": true,
        "isAvailable": true,
        "stockQuantity": 10,
        "averageRating": 4.8,
        "totalRatings": 15,
        "categoryId": "uuid",
        "categoryName": "Tyres & Rims"
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 20
  }
}
```

---

## 1.4 Search

### `GET /api/spare-parts/search`

Search products and stores.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search term (required) |
| `type` | string | `products` or `stores` or `all` |
| `city` | string | Filter by city |
| `category_id` | UUID | Filter by category |
| `page` | number | Default 1 |
| `limit` | number | Default 20 |

---

## 1.5 Order Status Overview (via vendor-admin routes)

For admin order monitoring, use the existing admin vendors endpoint to get the vendor, then call the store's order stats via the vendor's store.

**Get vendor (with spare_parts type):**
```
GET /api/admin/vendors?business_type=spare_parts&page=1&limit=20
Authorization: Bearer <admin_token>
```

**Approve a spare-parts vendor:**
```
POST /api/admin/vendors/:vendorId/approve
Authorization: Bearer <admin_token>
```

**Reject a spare-parts vendor:**
```
POST /api/admin/vendors/:vendorId/reject
Authorization: Bearer <admin_token>
Body: { "reason": "Incomplete documentation" }
```

**Suspend a spare-parts vendor:**
```
POST /api/admin/vendors/:vendorId/suspend
Authorization: Bearer <admin_token>
Body: { "reason": "Customer complaints" }   ← optional
```

**Reactivate:**
```
POST /api/admin/vendors/:vendorId/suspend   ← toggles suspend/reactivate
Authorization: Bearer <admin_token>
```

---

# PART 2 — VENDOR DASHBOARD

All vendor routes require:
- `Authorization: Bearer <vendor_jwt>`
- An **approved** `spare_parts` store for this vendor

---

## 2.1 Store Profile

### `GET /api/spare-parts/vendor/store`

Get own store profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "ownerId": "uuid",
    "name": "Eko Auto Parts",
    "description": "...",
    "logoUrl": "https://...",
    "bannerUrl": "https://...",
    "address": "5 Eko Road, Lagos",
    "city": "Lagos",
    "state": "Lagos",
    "phone": "08012345678",
    "email": "eko@autoparts.com",
    "isOpen": false,
    "isVerified": true,
    "averageRating": 4.5,
    "totalOrders": 120,
    "operatingHours": {}
  }
}
```

---

### `PUT /api/spare-parts/vendor/store`

Update store profile.

**Request body (all optional):**
```json
{
  "name": "Eko Auto Parts",
  "description": "Quality spare parts since 2010",
  "address": "5 Eko Road, Lagos",
  "city": "Lagos",
  "state": "Lagos",
  "phone": "08012345678",
  "email": "eko@autoparts.com",
  "operatingHours": {
    "monday": { "open": "08:00", "close": "18:00", "closed": false },
    "sunday": { "open": "00:00", "close": "00:00", "closed": true }
  }
}
```

---

### `PUT /api/spare-parts/vendor/store/status`

Toggle store open/closed.

**Request body:**
```json
{ "is_open": true }
```

**Response:**
```json
{
  "success": true,
  "data": { "is_open": true },
  "message": "Store is now open"
}
```

---

### `GET /api/spare-parts/vendor/store/statistics`

Dashboard summary stats.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_orders": 120,
    "pending_orders": 3,
    "in_progress_orders": 5,
    "delivered_orders": 108,
    "cancelled_orders": 4,
    "total_revenue": 2450000.00,
    "this_month": {
      "orders": 18,
      "revenue": 345000.00
    },
    "average_rating": 4.5,
    "total_ratings": 42
  }
}
```

---

## 2.2 Image Upload

### `GET /api/spare-parts/vendor/upload-url`

Get a pre-signed upload URL for product/store images.

**Query:** `?file_name=product.jpg&content_type=image/jpeg`

**Response:**
```json
{
  "success": true,
  "data": {
    "upload_url": "https://supabase.co/storage/v1/...",
    "public_url": "https://supabase.co/storage/v1/object/public/..."
  }
}
```

Use the `upload_url` to PUT the image directly. Use `public_url` as the image URL when creating/updating products.

---

## 2.3 Categories

### `GET /api/spare-parts/vendor/categories`

Returns global categories + this store's custom categories.

**Response:**
```json
{
  "success": true,
  "data": {
    "global": [
      { "id": "uuid", "name": "Engine Parts", "type": "global" }
    ],
    "custom": [
      { "id": "uuid", "name": "Suspension Kits", "type": "custom" }
    ]
  }
}
```

---

### `POST /api/spare-parts/vendor/categories`

Create a custom category for this store.

**Request body:**
```json
{
  "name": "Suspension Kits",
  "description": "Shock absorbers and related parts"
}
```

---

### `PUT /api/spare-parts/vendor/categories/:id`

Update a custom category (own categories only).

**Request body:**
```json
{ "name": "Updated Name", "description": "Updated description" }
```

---

### `DELETE /api/spare-parts/vendor/categories/:id`

Delete a custom category (own categories only, cannot delete global).

---

## 2.4 Products

### `GET /api/spare-parts/vendor/products`

List own products including inactive ones.

**Query:** `?category_id=uuid&search=tyre&page=1&limit=20`

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Michelin Tyre 225/70R16",
        "price": 45000.00,
        "images": ["https://..."],
        "specs": { "Size": "225/70R16", "Brand": "Michelin" },
        "isActive": true,
        "isAvailable": true,
        "stockQuantity": 10,
        "categoryId": "uuid",
        "categoryName": "Tyres & Rims",
        "averageRating": 4.8,
        "totalRatings": 15,
        "createdAt": "2026-08-01T10:00:00Z"
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 20
  }
}
```

---

### `POST /api/spare-parts/vendor/products`

Create a new product.

**Request body:**
```json
{
  "name": "Michelin Tyre 225/70R16",
  "description": "Genuine Michelin all-season tyre",
  "price": 45000,
  "category_id": "uuid",
  "images": ["https://...", "https://..."],
  "specs": {
    "Size": "225/70R16",
    "Brand": "Michelin",
    "Type": "Radial"
  },
  "stock_quantity": 10
}
```

**Response:** `201 Created` with the created product object.

---

### `PUT /api/spare-parts/vendor/products/:id`

Update a product (all fields optional).

**Request body:**
```json
{
  "name": "Updated Name",
  "price": 48000,
  "stock_quantity": 8,
  "images": ["https://..."],
  "is_active": true
}
```

---

### `DELETE /api/spare-parts/vendor/products/:id`

Soft-delete (deactivates) a product.

---

### `PUT /api/spare-parts/vendor/products/:id/availability`

Toggle product available/unavailable (without deleting).

**Request body:**
```json
{ "is_available": false }
```

---

## 2.5 Order Management

### `GET /api/spare-parts/vendor/orders`

List orders for this store.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (see status table below) |
| `page` | number | Default 1 |
| `limit` | number | Default 20 |

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "customerId": "uuid",
        "status": "pending",
        "paymentMethod": "wallet",
        "paymentStatus": "paid",
        "subtotal": 45000.00,
        "deliveryFee": 1500.00,
        "serviceFee": 500.00,
        "totalAmount": 47000.00,
        "deliveryAddress": {
          "address": "12 Lekki Phase 1, Lagos",
          "lat": 6.5244,
          "lng": 3.3792
        },
        "specialInstructions": "Leave at gate",
        "orderItems": [
          {
            "id": "uuid",
            "productName": "Michelin Tyre 225/70R16",
            "quantity": 1,
            "productPrice": 45000.00
          }
        ],
        "createdAt": "2026-09-04T10:00:00Z"
      }
    ],
    "total": 18,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### `GET /api/spare-parts/vendor/orders/:id`

Single order detail with full status history.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "in_progress",
    "orderItems": [...],
    "statusHistory": [
      { "status": "pending", "previousStatus": null, "changedByRole": "customer", "createdAt": "..." },
      { "status": "in_progress", "previousStatus": "pending", "changedByRole": "vendor", "notes": "Vendor accepted the order", "createdAt": "..." }
    ],
    "deliveryAddress": { "address": "...", "lat": 6.52, "lng": 3.37 }
  }
}
```

---

### `POST /api/spare-parts/vendor/orders/:id/accept`

Accept a pending order → moves to `in_progress`.

**Request body:** None.

**Response:**
```json
{ "success": true, "message": "Order accepted" }
```

---

### `POST /api/spare-parts/vendor/orders/:id/reject`

Reject a pending order → moves to `cancelled` + auto-refunds wallet.

**Request body:**
```json
{ "reason": "Product out of stock" }
```

**Response:**
```json
{ "success": true, "message": "Order rejected and customer refunded" }
```

---

### `PUT /api/spare-parts/vendor/orders/:id/ready`

Mark order as packed and ready for rider pickup → moves to `ready_for_pickup` → automatically triggers rider dispatch.

**Request body:** None.

**Response:**
```json
{ "success": true, "message": "Order marked as ready for pickup" }
```

---

# PART 3 — ORDER STATUS MACHINE

```
Customer places order
        ↓
   [pending]               ← vendor has 10 minutes to respond
        ↓
  [in_progress]            ← vendor accepts → POST /vendor/orders/:id/accept
        ↓
[ready_for_pickup]         ← vendor packs → PUT /vendor/orders/:id/ready
        ↓
[searching_rider]          ← system finds a nearby rider automatically
        ↓
[rider_accepted]           ← rider accepts the delivery
        ↓
[heading_to_store]         ← rider en route to store
        ↓
   [shipped]               ← rider picks up from store
        ↓
[heading_to_customer]      ← rider en route to customer
        ↓
   [arrived]               ← rider at customer location
        ↓
  [delivered]              ← rider confirms delivery → payouts triggered
        ↓
   (terminal)


Any non-terminal → [cancelled]  (by customer, vendor, rider, or system)
```

**Auto-cancellation:** If vendor doesn't accept within 10 minutes, order is automatically cancelled and customer is refunded.

---

# PART 4 — STATUS & ENUM REFERENCE

**Order status values:**

| Value | Who sets it | Meaning |
|-------|------------|---------|
| `pending` | system | Order placed, waiting for vendor |
| `in_progress` | vendor | Vendor accepted, packing |
| `ready_for_pickup` | vendor | Packed, waiting for rider |
| `searching_rider` | system | Looking for a nearby rider |
| `rider_accepted` | rider | Rider accepted delivery |
| `heading_to_store` | rider | Rider going to store |
| `shipped` | rider | Rider picked up order from store |
| `heading_to_customer` | rider | Rider going to customer |
| `arrived` | rider | Rider at customer location |
| `delivered` | rider | Order delivered — FINAL |
| `cancelled` | any | Cancelled — FINAL |

**Payment method:** `wallet` \| `cash`

**Payment status:**

| Value | Meaning |
|-------|---------|
| `pending` | Cash order — not yet collected |
| `paid` | Wallet deducted at order time |
| `refunded` | Wallet refunded after cancel/reject |
| `settled` | Delivered — vendor+rider credited |
| `completed` | Cash confirmed by rider |

---

# PART 5 — SUGGESTED ADMIN DASHBOARD UI FLOW

```
Spare Parts Section
├── Overview cards
│   ├── GET /api/spare-parts/stores           → total stores count
│   └── vendor stats from /api/admin/vendors?business_type=spare_parts
│
├── Stores page
│   ├── GET /api/spare-parts/stores?page=1    → store list table
│   ├── GET /api/spare-parts/stores/:id       → store detail panel
│   │   ├── Profile tab
│   │   ├── Products tab → GET /api/spare-parts/stores/:id/products
│   │   └── Reviews tab  → GET /api/spare-parts/stores/:id/reviews
│   └── Vendor approval actions (via /api/admin/vendors)
│       ├── Approve  → POST /api/admin/vendors/:id/approve
│       ├── Reject   → POST /api/admin/vendors/:id/reject
│       └── Suspend  → POST /api/admin/vendors/:id/suspend
│
├── Products page
│   └── GET /api/spare-parts/stores/:id/products → filter by category/search
│
└── Categories page
    └── GET /api/spare-parts/categories → list + manage global taxonomy
```

---

# PART 6 — SUGGESTED VENDOR DASHBOARD UI FLOW

```
Vendor Spare Parts Dashboard
├── Home
│   └── GET /vendor/store/statistics → order counts + revenue cards
│
├── Store Settings
│   ├── GET /vendor/store            → profile form
│   ├── PUT /vendor/store            → save changes
│   └── PUT /vendor/store/status     → open/close toggle
│
├── Products
│   ├── GET /vendor/products         → products table
│   ├── POST /vendor/products        → add product form
│   │   └── GET /vendor/upload-url  → upload images first
│   ├── PUT /vendor/products/:id    → edit product
│   ├── PUT /vendor/products/:id/availability → toggle available
│   └── DELETE /vendor/products/:id → deactivate
│
├── Categories
│   ├── GET /vendor/categories       → list global + custom
│   ├── POST /vendor/categories      → create custom category
│   ├── PUT /vendor/categories/:id   → edit custom category
│   └── DELETE /vendor/categories/:id → delete custom category
│
└── Orders
    ├── GET /vendor/orders?status=pending   → new orders (badge count)
    ├── GET /vendor/orders?status=in_progress
    ├── GET /vendor/orders/:id              → order detail
    ├── POST /vendor/orders/:id/accept      → Accept button
    ├── POST /vendor/orders/:id/reject      → Reject button (with reason)
    └── PUT  /vendor/orders/:id/ready       → Mark Ready button
```

---

# PART 7 — ERROR RESPONSES

All errors:
```json
{
  "success": false,
  "error": "Error message here"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Bad request / validation error |
| `401` | No token / expired token |
| `403` | No spare parts store / store not approved |
| `404` | Resource not found |
| `409` | Conflict (e.g. already reviewed) |
| `500` | Server error |
