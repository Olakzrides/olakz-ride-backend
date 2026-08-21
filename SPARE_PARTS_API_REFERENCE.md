# Spare Parts API Reference

**Base URL:** `https://olakzride.duckdns.org`
**Service port (direct):** `3009`

---

> This document is updated at the end of each implementation phase.
> Only endpoints that are actually built and live are listed here.
> Last updated: Phase 1

---

## Authentication

Most endpoints require a JWT Bearer token in the Authorization header:
```
Authorization: Bearer {token}
```

Internal endpoints require the internal API key header instead:
```
x-internal-api-key: olakz-internal-api-key-2026-secure
```

---

## Phase 1 — Foundation

### 1. Health Check

**`GET /api/spare-parts/health`**

No authentication required.

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/health
```

**Response `200`**
```json
{
  "success": true,
  "service": "spare-parts-service",
  "status": "healthy",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 2. Provision Vendor Store (Internal)

**`POST /api/internal/spare-parts/vendor/provision`**

Called automatically by platform-service when admin approves a `spare_parts` vendor.
You can also call it manually to provision a store for testing.

Requires `x-internal-api-key` header.
Idempotent — safe to call multiple times for the same `owner_id`.

**Request**
```
POST https://olakzride.duckdns.org/api/internal/spare-parts/vendor/provision
x-internal-api-key: olakz-internal-api-key-2026-secure
Content-Type: application/json
```

**Request Body**
```json
{
  "owner_id": "uuid-of-the-vendor-user",
  "vendor_id": "uuid-from-platform-service-vendors-table",
  "business_name": "AutoParts Hub",
  "address": "14 Apapa Road, Lagos",
  "city": "Lagos",
  "state": "Lagos",
  "phone": "08012345678",
  "email": "info@autopartshub.com",
  "logo_url": "https://..."
}
```

| Field | Required | Notes |
|---|---|---|
| `owner_id` | Yes | UUID of the user who owns the store |
| `business_name` | Yes | Name of the spare parts store |
| `vendor_id` | No | UUID from platform-service vendors table |
| `address` | No | Store address |
| `city` | No | City |
| `state` | No | State |
| `phone` | No | Phone number |
| `email` | No | Email address |
| `logo_url` | No | URL to the store logo |

**Response `201` — Store created**
```json
{
  "success": true,
  "data": {
    "store_id": "uuid-of-the-created-store"
  },
  "message": "Spare parts store provisioned successfully"
}
```

**Response `200` — Store already exists (idempotent)**
```json
{
  "success": true,
  "data": {
    "store_id": "uuid-of-the-existing-store"
  },
  "message": "Already provisioned"
}
```

**Response `400` — Missing required fields**
```json
{
  "success": false,
  "message": "owner_id and business_name are required"
}
```

---

### 3. Sync Vendor Status (Internal)

**`PATCH /api/internal/spare-parts/vendor/status`**

Called by admin-service when a spare_parts vendor is suspended, reactivated, or rejected.
Syncs the vendor status to the store's `is_active` and `is_verified` flags.

Requires `x-internal-api-key` header.

**Request**
```
PATCH https://olakzride.duckdns.org/api/internal/spare-parts/vendor/status
x-internal-api-key: olakz-internal-api-key-2026-secure
Content-Type: application/json
```

**Request Body**
```json
{
  "owner_id": "uuid-of-the-vendor-user",
  "status": "approved"
}
```

| Field | Required | Values |
|---|---|---|
| `owner_id` | Yes | UUID of the vendor user |
| `status` | Yes | `approved` \| `suspended` \| `rejected` \| `inactive` |

**Status mapping:**
- `approved` → `is_active: true`, `is_verified: true`
- `suspended` / `rejected` / `inactive` → `is_active: false`, `is_verified: false`

**Response `200`**
```json
{
  "success": true
}
```

**Response `400` — Invalid status**
```json
{
  "success": false,
  "message": "status must be one of: approved, suspended, rejected, inactive"
}
```

---

### 4. Get Order by ID (Internal)

**`GET /api/internal/spare-parts/orders/:orderId`**

Allows other services (e.g. admin-service) to look up a spare parts order.

Requires `x-internal-api-key` header.

**Request**
```
GET https://olakzride.duckdns.org/api/internal/spare-parts/orders/{orderId}
x-internal-api-key: olakz-internal-api-key-2026-secure
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "uuid-of-the-order",
    "customer_id": "uuid",
    "store_id": "uuid",
    "rider_id": "uuid or null",
    "status": "pending",
    "total_amount": "5000.00",
    "payment_method": "wallet",
    "payment_status": "paid"
  }
}
```

**Response `404`**
```json
{
  "success": false,
  "message": "Order not found"
}
```

---

## Phase 2 — Public Browsing + Vendor Management

> Last updated: Phase 2 complete
> All endpoints below are live. Base URL: `https://olakzride.duckdns.org`

---

### PUBLIC ENDPOINTS (No authentication required)

---

### 5. List Categories

**`GET /api/spare-parts/categories`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/categories
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "uuid",
        "name": "Tyres",
        "description": "Car and truck tyres of all sizes",
        "icon_url": null,
        "is_active": true,
        "sort_order": 3,
        "created_at": "2026-08-21T00:00:00.000Z",
        "updated_at": "2026-08-21T00:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 6. List Stores

**`GET /api/spare-parts/stores`**

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `lat` | number | No | Customer latitude for distance filtering |
| `lng` | number | No | Customer longitude for distance filtering |
| `radius` | number | No | Search radius in km (default: 15) |
| `category_id` | uuid | No | Filter stores by category |
| `is_open` | boolean | No | Filter by open status (`true` or `false`) |
| `rating_min` | number | No | Minimum average rating (e.g. `4.0`) |
| `limit` | number | No | Page size (default: 20) |
| `page` | number | No | Page number (default: 1) |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/stores?lat=6.6226&lng=3.5020&is_open=true&limit=10
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "id": "uuid",
        "owner_id": "uuid",
        "name": "AutoParts Hub",
        "description": "Quality spare parts",
        "logo_url": "https://...",
        "banner_url": "https://...",
        "address": "14 Apapa Road",
        "city": "Lagos",
        "state": "Lagos",
        "latitude": "6.45306000",
        "longitude": "3.39583000",
        "phone": "08012345678",
        "email": "info@autopartshub.com",
        "is_active": true,
        "is_open": true,
        "is_verified": true,
        "average_rating": "4.80",
        "total_ratings": 113,
        "total_orders": 312,
        "operating_hours": {},
        "store_categories": [
          { "category": { "id": "uuid", "name": "Tyres" } }
        ]
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 7. Get Store Detail

**`GET /api/spare-parts/stores/:id`**

Returns full store profile + featured products (top 8 by rating) per category.

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/stores/{store_id}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "uuid",
      "name": "AutoParts Hub",
      "city": "Lagos",
      "average_rating": "4.80",
      "is_open": true,
      "store_categories": [...],
      "featured_products": {
        "{category_id}": [
          {
            "id": "uuid",
            "name": "TMA-Truck Tyres 225/70",
            "price": "200000.00",
            "images": ["https://..."],
            "specs": { "Size": "225/70 R19.5", "Brand": "TMA" },
            "average_rating": "4.80",
            "is_available": true
          }
        ]
      }
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

**Response `404`**
```json
{ "success": false, "error": "Store not found", "timestamp": "..." }
```

---

### 8. Get Store Products

**`GET /api/spare-parts/stores/:id/products`**

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `category_id` | uuid | No | Filter by category |
| `limit` | number | No | Page size (default: 20) |
| `page` | number | No | Page number (default: 1) |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/stores/{store_id}/products?category_id={uuid}&limit=20&page=1
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "products": [...],
    "total": 45,
    "page": 1,
    "limit": 20
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 9. Get Store Reviews

**`GET /api/spare-parts/stores/:id/reviews`**

**Query Parameters:** `limit` (default 20), `page` (default 1)

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/stores/{store_id}/reviews
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "customer_id": "uuid",
        "store_rating": 5,
        "comment": "Great product, fast delivery!",
        "created_at": "2026-08-21T00:00:00.000Z",
        "product_reviews": [
          { "product": { "id": "uuid", "name": "TMA Tyres" }, "product_rating": 5 }
        ]
      }
    ],
    "total": 113,
    "page": 1,
    "limit": 20
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 10. Get Product Detail

**`GET /api/spare-parts/products/:id`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/products/{product_id}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "product": {
      "id": "uuid",
      "name": "TMA-Truck Tyres 225/70",
      "description": "Heavy-duty truck tyre engineered for heavy trucks.",
      "specs": {
        "Size": "225/70 R19.5",
        "Load Index": "130/128",
        "Brand": "TMA",
        "Type": "Radial"
      },
      "price": "200000.00",
      "images": ["https://..."],
      "is_active": true,
      "is_available": true,
      "stock_quantity": null,
      "average_rating": "4.80",
      "total_ratings": 113,
      "store": {
        "id": "uuid",
        "name": "AutoParts Hub",
        "city": "Lagos",
        "average_rating": "4.80",
        "logo_url": "https://..."
      },
      "category": { "id": "uuid", "name": "Tyres" }
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

**Response `404`**
```json
{ "success": false, "error": "Product not found", "timestamp": "..." }
```

---

### 11. Get Similar Products

**`GET /api/spare-parts/products/:id/similar`**

Returns up to 10 products from the same store and same category, ordered by rating.

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/products/{product_id}/similar
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "products": [...]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 12. Get Product Reviews

**`GET /api/spare-parts/products/:id/reviews`**

**Query Parameters:** `limit` (default 20), `page` (default 1)

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/products/{product_id}/reviews
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "product_rating": 5,
        "review": {
          "id": "uuid",
          "customer_id": "uuid",
          "store_rating": 5,
          "comment": "Fits perfectly. Would recommend.",
          "created_at": "2026-08-21T00:00:00.000Z"
        }
      }
    ],
    "total": 113,
    "page": 1,
    "limit": 20
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 13. Search

**`GET /api/spare-parts/search`**

Searches both store names and product names/descriptions.

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | **Yes** | Search term |
| `category_id` | uuid | No | Filter products by category |
| `lat` | number | No | Not used for filtering, reserved |
| `lng` | number | No | Not used for filtering, reserved |
| `limit` | number | No | Max results per type (default: 20) |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/search?q=tyre&category_id={uuid}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "stores": [...],
    "products": [
      {
        "id": "uuid",
        "name": "TMA-Truck Tyres 225/70",
        "price": "200000.00",
        "store": { "id": "uuid", "name": "AutoParts Hub", "city": "Lagos" }
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

**Response `400`** — missing `q`
```json
{ "success": false, "error": "q (search query) is required", "timestamp": "..." }
```

---

### 14. Get Delivery Options

**`GET /api/spare-parts/delivery-options`**

Returns delivery fee estimate per vehicle type for a store → customer delivery address.

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `store_id` | uuid | **Yes** | The spare parts store ID |
| `delivery_lat` | number | **Yes** | Customer delivery latitude |
| `delivery_lng` | number | **Yes** | Customer delivery longitude |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/delivery-options?store_id={uuid}&delivery_lat=6.6226&delivery_lng=3.5020
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "delivery_options": [
      {
        "vehicle_type": "motorcycle",
        "display_name": "Motorcycle",
        "delivery_fee": 800,
        "service_fee": 200,
        "total_fee": 1000,
        "estimated_distance_km": 5.2,
        "currency_code": "NGN"
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### VENDOR ENDPOINTS (JWT required + approved spare_parts store)

All vendor endpoints require:
```
Authorization: Bearer {vendor_jwt_token}
```

---

### 15. Get Upload URL

**`GET /api/spare-parts/vendor/upload-url`**

Get a pre-signed Supabase Storage URL to upload a product image or store logo/banner.
Call this first, upload the file directly to `signed_url`, then use `public_url` in your create/update request.

**Query Parameters**

| Param | Type | Required | Values |
|---|---|---|---|
| `file_type` | string | **Yes** | `product_image`, `store_logo`, `store_banner` |
| `file_name` | string | **Yes** | Original filename e.g. `tyre.jpg` |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/vendor/upload-url?file_type=product_image&file_name=tyre.jpg
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "signed_url": "https://[supabase]/storage/v1/object/upload/sign/spare-parts/...",
    "public_url": "https://[supabase]/storage/v1/object/public/spare-parts/...",
    "file_path": "{owner_id}/product_image/{uuid}.jpg",
    "file_type": "product_image",
    "file_name": "tyre.jpg"
  },
  "message": "Upload URL generated",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 16. Get Store Profile (Vendor)

**`GET /api/spare-parts/vendor/store`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/vendor/store
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "uuid",
      "name": "AutoParts Hub",
      "description": "Quality spare parts",
      "logo_url": "https://...",
      "banner_url": "https://...",
      "address": "14 Apapa Road",
      "city": "Lagos",
      "state": "Lagos",
      "latitude": "6.45306000",
      "longitude": "3.39583000",
      "phone": "08012345678",
      "email": "info@autopartshub.com",
      "is_open": false,
      "is_verified": true,
      "operating_hours": {},
      "store_categories": [
        { "category": { "id": "uuid", "name": "Tyres" } }
      ]
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 17. Update Store Profile

**`PUT /api/spare-parts/vendor/store`**

All fields are optional — only send what you want to update.

**Request**
```
PUT https://olakzride.duckdns.org/api/spare-parts/vendor/store
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "AutoParts Hub",
  "description": "Quality spare parts for all vehicles",
  "logo_url": "https://...",
  "banner_url": "https://...",
  "address": "14 Apapa Road, Lagos Island",
  "city": "Lagos",
  "state": "Lagos",
  "latitude": 6.45306,
  "longitude": 3.39583,
  "phone": "08012345678",
  "email": "info@autopartshub.com",
  "operating_hours": {
    "monday": { "open": "08:00", "close": "18:00" },
    "saturday": { "open": "09:00", "close": "15:00" }
  },
  "category_ids": ["uuid-tyres", "uuid-brakes"]
}
```

Note: `category_ids` does a **full replace** — all existing category assignments are removed and replaced with the provided list.

**Response `200`**
```json
{
  "success": true,
  "data": { "store": { ... } },
  "message": "Store profile updated",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 18. Set Store Open/Closed Status

**`PUT /api/spare-parts/vendor/store/status`**

**Request**
```
PUT https://olakzride.duckdns.org/api/spare-parts/vendor/store/status
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{ "is_open": true }
```

**Response `200`**
```json
{
  "success": true,
  "data": null,
  "message": "Store is now open",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 19. Get Store Statistics

**`GET /api/spare-parts/vendor/store/statistics`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/vendor/store/statistics
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "statistics": {
      "total_orders": 312,
      "average_rating": 4.8,
      "total_ratings": 113,
      "total_revenue": 4500000.00,
      "month_orders": 24,
      "month_revenue": 380000.00,
      "pending_orders": 3
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 20. List Vendor Products

**`GET /api/spare-parts/vendor/products`**

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `category_id` | uuid | No | Filter by category |
| `is_active` | boolean | No | Filter by active status (`true` or `false`) |
| `limit` | number | No | Page size (default: 20) |
| `page` | number | No | Page number (default: 1) |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/vendor/products?limit=20&page=1
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "TMA-Truck Tyres 225/70",
        "description": "Heavy-duty truck tyre",
        "specs": { "Size": "225/70 R19.5", "Brand": "TMA", "Type": "Radial" },
        "price": "200000.00",
        "images": ["https://..."],
        "is_active": true,
        "is_available": true,
        "stock_quantity": null,
        "average_rating": "4.80",
        "total_ratings": 113,
        "category": { "id": "uuid", "name": "Tyres" }
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 21. Create Product

**`POST /api/spare-parts/vendor/products`**

**Request**
```
POST https://olakzride.duckdns.org/api/spare-parts/vendor/products
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "TMA-Truck Tyres 225/70",
  "description": "Heavy-duty truck tyre engineered for heavy trucks and trailers.",
  "category_id": "uuid-tyres-category",
  "price": 200000,
  "images": ["https://...", "https://..."],
  "specs": {
    "Size": "225/70 R19.5",
    "Load Index": "130/128",
    "Brand": "TMA",
    "Type": "Radial"
  },
  "stock_quantity": 50
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | **Yes** | Product name |
| `price` | **Yes** | Must be a positive number |
| `description` | No | Product description |
| `category_id` | No | UUID of spare_parts_category |
| `images` | No | Array of public image URLs |
| `specs` | No | JSON object of key-value attributes |
| `stock_quantity` | No | Integer stock count |

**Response `201`**
```json
{
  "success": true,
  "data": {
    "product": { "id": "uuid", "name": "TMA-Truck Tyres 225/70", ... }
  },
  "message": "Product created",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 22. Update Product

**`PUT /api/spare-parts/vendor/products/:id`**

All fields optional — only send what you want to change.

**Request**
```
PUT https://olakzride.duckdns.org/api/spare-parts/vendor/products/{product_id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "name": "Updated Name",
  "price": 180000,
  "description": "Updated description",
  "category_id": "uuid",
  "images": ["https://..."],
  "specs": { "Brand": "TMA", "Type": "Radial" },
  "stock_quantity": 30,
  "is_active": true,
  "is_available": true
}
```

**Response `200`**
```json
{
  "success": true,
  "data": { "product": { ... } },
  "message": "Product updated",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 23. Delete Product

**`DELETE /api/spare-parts/vendor/products/:id`**

**Request**
```
DELETE https://olakzride.duckdns.org/api/spare-parts/vendor/products/{product_id}
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": null,
  "message": "Product deleted",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 24. Toggle Product Availability

**`PUT /api/spare-parts/vendor/products/:id/availability`**

Mark a product as available or temporarily unavailable without deleting it.

**Request**
```
PUT https://olakzride.duckdns.org/api/spare-parts/vendor/products/{product_id}/availability
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{ "is_available": false }
```

**Response `200`**
```json
{
  "success": true,
  "data": { "product": { ... } },
  "message": "Product is now unavailable",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

## Phase 3 — Cart, Checkout & Orders

> Last updated: Phase 3 complete

---

### CUSTOMER ENDPOINTS (JWT required)

All endpoints below require:
```
Authorization: Bearer {customer_jwt_token}
```

---

### CART

---

### 25. Get Cart

**`GET /api/spare-parts/cart`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/cart
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "uuid",
      "user_id": "uuid",
      "store_id": "uuid",
      "store": { "id": "uuid", "name": "AutoParts Hub", "logo_url": "https://..." },
      "items": [
        {
          "id": "uuid",
          "product_id": "uuid",
          "quantity": 2,
          "unit_price": "200000.00",
          "product": {
            "id": "uuid",
            "name": "TMA-Truck Tyres 225/70",
            "price": "200000.00",
            "images": ["https://..."],
            "is_available": true,
            "specs": { "Brand": "TMA" }
          }
        }
      ],
      "subtotal": 400000
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

Note: Returns `{ "cart": null }` if cart is empty.

---

### 26. Add Item to Cart

**`POST /api/spare-parts/cart/add`**

Adding an item from a different store clears the existing cart automatically.

**Request**
```
POST https://olakzride.duckdns.org/api/spare-parts/cart/add
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "product_id": "uuid",
  "quantity": 2
}
```

**Response `200` — Item added**
```json
{
  "success": true,
  "data": {
    "cart_item": { "id": "uuid", "product_id": "uuid", "quantity": 2, "unit_price": "200000.00" },
    "cart_cleared": false,
    "previous_store": null
  },
  "message": "Item added to cart",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

**Response `200` — Cart from previous store was cleared**
```json
{
  "success": true,
  "data": {
    "cart_item": { ... },
    "cart_cleared": true,
    "previous_store": "Prime Auto Parts"
  },
  "message": "Previous cart from \"Prime Auto Parts\" was cleared",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 27. Update Cart Item

**`PUT /api/spare-parts/cart/update`**

Setting `quantity` to `0` removes the item entirely.

**Request**
```
PUT https://olakzride.duckdns.org/api/spare-parts/cart/update
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{ "cart_item_id": "uuid", "quantity": 3 }
```

**Response `200`**
```json
{
  "success": true,
  "data": { "cart_item": { "id": "uuid", "quantity": 3 } },
  "message": "Cart updated",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 28. Remove Cart Item

**`DELETE /api/spare-parts/cart/remove`**

**Request**
```
DELETE https://olakzride.duckdns.org/api/spare-parts/cart/remove
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{ "cart_item_id": "uuid" }
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Item removed from cart", "timestamp": "..." }
```

---

### 29. Clear Cart

**`DELETE /api/spare-parts/cart`**

**Request**
```
DELETE https://olakzride.duckdns.org/api/spare-parts/cart
Authorization: Bearer {token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Cart cleared", "timestamp": "..." }
```

---

### ORDERS

---

### 30. Estimate Order Total

**`POST /api/spare-parts/payment/estimate`**

Get a fee breakdown before placing an order. No payment is made.

**Request**
```
POST https://olakzride.duckdns.org/api/spare-parts/payment/estimate
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "store_id": "uuid",
  "items": [
    { "product_id": "uuid", "quantity": 2 }
  ],
  "delivery_address": {
    "address": "14 Bode Thomas Street, Surulere, Lagos",
    "lat": 6.5095,
    "lng": 3.3568
  },
  "vehicle_type": "motorcycle"
}
```

| Field | Required | Notes |
|---|---|---|
| `store_id` | **Yes** | |
| `items` | **Yes** | Array of `{product_id, quantity}` |
| `delivery_address` | **Yes** | `{address, lat, lng}` |
| `vehicle_type` | No | Default: `motorcycle` |

**Response `200`**
```json
{
  "success": true,
  "data": {
    "subtotal": 400000,
    "delivery_fee": 800,
    "service_fee": 200,
    "total_fees": 1000,
    "total_amount": 401000,
    "distance_km": 5.2,
    "distance_text": "5.2 km",
    "currency_code": "NGN"
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 31. Place Order

**`POST /api/spare-parts/orders`**

**Request**
```
POST https://olakzride.duckdns.org/api/spare-parts/orders
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "store_id": "uuid",
  "items": [
    { "product_id": "uuid", "quantity": 2, "special_instructions": "Handle with care" }
  ],
  "delivery_address": {
    "address": "14 Bode Thomas Street, Surulere, Lagos",
    "lat": 6.5095,
    "lng": 3.3568,
    "label": "Home"
  },
  "payment_method": "wallet",
  "special_instructions": "Call before delivery",
  "vehicle_type": "motorcycle"
}
```

| Field | Required | Values |
|---|---|---|
| `store_id` | **Yes** | |
| `items` | **Yes** | Array of `{product_id, quantity, special_instructions?}` |
| `delivery_address` | **Yes** | `{address, lat, lng, label?}` |
| `payment_method` | **Yes** | `wallet` or `cash` |
| `special_instructions` | No | Order-level note |
| `vehicle_type` | No | Default: `motorcycle` |

**Wallet payment:** Deducts immediately. If insufficient balance returns `400`.
**Cash payment:** No upfront charge. Driver collects cash on delivery.

**Response `201`**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "status": "pending",
      "payment_method": "wallet",
      "payment_status": "paid",
      "subtotal": "400000.00",
      "delivery_fee": "800.00",
      "service_fee": "200.00",
      "total_amount": "401000.00",
      "delivery_address": { "address": "...", "lat": 6.5095, "lng": 3.3568, "label": "Home" },
      "order_items": [
        { "product_name": "TMA-Truck Tyres 225/70", "quantity": 2, "product_price": "200000.00", "subtotal": "400000.00" }
      ],
      "fare_breakdown": {
        "subtotal": 400000,
        "delivery_fee": 800,
        "service_fee": 200,
        "total_fees": 1000,
        "total_amount": 401000,
        "distance_km": 5.2,
        "distance_text": "5.2 km",
        "currency_code": "NGN"
      },
      "created_at": "2026-08-21T00:00:00.000Z"
    }
  },
  "message": "Order placed successfully",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

**Response `400` — Insufficient wallet balance**
```json
{ "success": false, "error": "Insufficient wallet balance. Required: ₦401000.00, Available: ₦50000.00", "timestamp": "..." }
```

Note: Order auto-cancels after 10 minutes if vendor does not respond. Wallet orders are refunded automatically.

---

### 32. Get Order Detail

**`GET /api/spare-parts/orders/:id`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/orders/{order_id}
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "status": "in_progress",
      "payment_method": "wallet",
      "total_amount": "401000.00",
      "delivery_address": { "address": "...", "lat": 6.5095, "lng": 3.3568 },
      "store": { "id": "uuid", "name": "AutoParts Hub", "phone": "08012345678", "address": "..." },
      "order_items": [
        { "product_name": "TMA-Truck Tyres 225/70", "quantity": 2, "product_price": "200000.00", "product_image": "https://..." }
      ],
      "status_history": [
        { "status": "pending", "previous_status": null, "created_at": "..." },
        { "status": "in_progress", "previous_status": "pending", "created_at": "..." }
      ],
      "rider": null
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 33. Get Order History

**`GET /api/spare-parts/orders/history`**

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `status` | string | No | Filter by status |
| `limit` | number | No | Page size (default: 10) |
| `page` | number | No | Page number (default: 1) |

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/orders/history?limit=10&page=1
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "orders": [...],
    "total": 24,
    "page": 1,
    "limit": 10,
    "totalPages": 3
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 34. Cancel Order

**`POST /api/spare-parts/orders/:id/cancel`**

Allowed from statuses: `pending`, `in_progress`, `searching_rider`.
Wallet orders are refunded automatically.

**Request**
```
POST https://olakzride.duckdns.org/api/spare-parts/orders/{order_id}/cancel
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{ "reason": "Changed my mind" }
```

**Response `200`**
```json
{
  "success": true,
  "data": { "success": true, "message": "Order cancelled successfully" },
  "message": "Order cancelled",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 35. Get Order Tracking

**`GET /api/spare-parts/orders/:id/tracking`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/orders/{order_id}/tracking
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "status": "shipped",
    "status_history": [
      { "status": "pending", "previous_status": null, "created_at": "..." },
      { "status": "in_progress", "previous_status": "pending", "created_at": "..." }
    ],
    "rider_location": {
      "latitude": "6.5095",
      "longitude": "3.3568",
      "heading": "180.00",
      "created_at": "2026-08-21T00:00:00.000Z"
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 36. Get Order Receipt

**`GET /api/spare-parts/orders/:id/receipt`**

**Request**
```
GET https://olakzride.duckdns.org/api/spare-parts/orders/{order_id}/receipt
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "order_id": "uuid",
    "store": { "id": "uuid", "name": "AutoParts Hub", "address": "...", "phone": "..." },
    "items": [
      { "product_name": "TMA-Truck Tyres 225/70", "quantity": 2, "product_price": "200000.00", "subtotal": "400000.00" }
    ],
    "subtotal": 400000,
    "delivery_fee": 800,
    "service_fee": 200,
    "total_amount": 401000,
    "payment_method": "wallet",
    "payment_status": "paid",
    "status": "delivered",
    "created_at": "2026-08-21T00:00:00.000Z",
    "delivered_at": "2026-08-21T01:00:00.000Z"
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 37. Submit Review

**`POST /api/spare-parts/orders/:id/review`**

Only available after order status is `delivered`. One review per order.

**Request**
```
POST https://olakzride.duckdns.org/api/spare-parts/orders/{order_id}/review
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "store_rating": 5,
  "comment": "Great quality, fast delivery!",
  "product_ratings": [
    { "product_id": "uuid", "rating": 5 },
    { "product_id": "uuid", "rating": 4 }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `store_rating` | **Yes** | Integer 1–5 |
| `comment` | No | Text review |
| `product_ratings` | No | Array of `{product_id, rating}` — rating 1–5 |

**Response `201`**
```json
{
  "success": true,
  "data": { "review": { "id": "uuid", "store_rating": 5, "comment": "...", "product_reviews": [...] } },
  "message": "Review submitted successfully",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### SAVED ADDRESSES

Addresses are shared with the marketplace — a customer's saved addresses appear in both services.

---

### 38. List Addresses

**`GET /api/spare-parts/addresses`**

```
GET https://olakzride.duckdns.org/api/spare-parts/addresses
Authorization: Bearer {token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "id": "uuid",
        "label": "Home",
        "address": "14, Bode Thomas Street, Surulere, Lagos",
        "city": "Lagos",
        "state": "Lagos",
        "latitude": "6.50950000",
        "longitude": "3.35680000",
        "is_default": true
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 39. Create Address

**`POST /api/spare-parts/addresses`**

```
POST https://olakzride.duckdns.org/api/spare-parts/addresses
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{
  "label": "Office",
  "address": "3rd Floor Marina Court, Lagos Island",
  "city": "Lagos",
  "state": "Lagos",
  "latitude": 6.4541,
  "longitude": 3.3947,
  "is_default": false
}
```

| Field | Required | Notes |
|---|---|---|
| `label` | **Yes** | e.g. Home, Office, Warehouse |
| `address` | **Yes** | Full address string |
| `city` | No | |
| `state` | No | |
| `latitude` | No | |
| `longitude` | No | |
| `is_default` | No | If true, unsets all other defaults |

**Response `201`**
```json
{
  "success": true,
  "data": { "address": { "id": "uuid", "label": "Office", ... } },
  "message": "Address saved",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 40. Update Address

**`PUT /api/spare-parts/addresses/:id`**

All fields optional.

```
PUT https://olakzride.duckdns.org/api/spare-parts/addresses/{address_id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body**
```json
{ "label": "Home", "is_default": true }
```

**Response `200`**
```json
{
  "success": true,
  "data": { "address": { ... } },
  "message": "Address updated",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 41. Delete Address

```
DELETE https://olakzride.duckdns.org/api/spare-parts/addresses/{address_id}
Authorization: Bearer {token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Address deleted", "timestamp": "..." }
```

---

### VENDOR ORDER MANAGEMENT ENDPOINTS (JWT + approved store required)

---

### 42. List Vendor Orders

**`GET /api/spare-parts/vendor/orders`**

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `status` | string | No | Filter: `pending`, `in_progress`, `ready_for_pickup`, `cancelled`, `delivered` |
| `limit` | number | No | Page size (default: 20) |
| `page` | number | No | Page number (default: 1) |

```
GET https://olakzride.duckdns.org/api/spare-parts/vendor/orders?status=pending
Authorization: Bearer {vendor_token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "orders": [...],
    "total": 8,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 43. Get Vendor Order Detail

```
GET https://olakzride.duckdns.org/api/spare-parts/vendor/orders/{order_id}
Authorization: Bearer {vendor_token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "status": "pending",
      "total_amount": "401000.00",
      "delivery_address": { "address": "...", "lat": 6.5, "lng": 3.3 },
      "order_items": [...],
      "status_history": [...]
    }
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 44. Accept Order

**`POST /api/spare-parts/vendor/orders/:id/accept`**

Moves order from `pending` → `in_progress`.

```
POST https://olakzride.duckdns.org/api/spare-parts/vendor/orders/{order_id}/accept
Authorization: Bearer {vendor_token}
```

**Response `200`**
```json
{ "success": true, "data": { "success": true, "message": "Order accepted" }, "message": "Order accepted", "timestamp": "..." }
```

---

### 45. Reject Order

**`POST /api/spare-parts/vendor/orders/:id/reject`**

Moves order to `cancelled`. Wallet orders are refunded automatically.

```
POST https://olakzride.duckdns.org/api/spare-parts/vendor/orders/{order_id}/reject
Authorization: Bearer {vendor_token}
Content-Type: application/json
```

**Request Body**
```json
{ "reason": "Product out of stock" }
```

**Response `200`**
```json
{ "success": true, "data": { "success": true, "message": "Order rejected and customer refunded" }, "message": "Order rejected", "timestamp": "..." }
```

---

### 46. Mark Order Ready

**`PUT /api/spare-parts/vendor/orders/:id/ready`**

Moves order from `in_progress` → `ready_for_pickup`.
Rider dispatch triggers automatically in Phase 4.

```
PUT https://olakzride.duckdns.org/api/spare-parts/vendor/orders/{order_id}/ready
Authorization: Bearer {vendor_token}
```

**Response `200`**
```json
{ "success": true, "data": { "success": true, "message": "Order marked as ready for pickup" }, "message": "Order marked as ready for pickup", "timestamp": "..." }
```

---

## Phase 4 — Rider Delivery Lifecycle

> Last updated: Phase 4 complete — all phases done

---

### RIDER ENDPOINTS (JWT required — driver account)

All rider endpoints require a driver's JWT token:
```
Authorization: Bearer {driver_jwt_token}
```

The driver must have an approved `drivers` profile in core-logistics.

---

### 47. Get Available Orders

**`GET /api/spare-parts/rider/available`**

Returns all spare parts orders currently in `searching_rider` status that haven't excluded this driver.

```
GET https://olakzride.duckdns.org/api/spare-parts/rider/available
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "searching_rider",
        "delivery_fee": "800.00",
        "total_amount": "401000.00",
        "delivery_address": { "address": "14 Bode Thomas, Surulere", "lat": 6.5095, "lng": 3.3568 },
        "vehicle_type": "motorcycle",
        "store": { "id": "uuid", "name": "AutoParts Hub", "address": "...", "latitude": "6.45", "longitude": "3.39" },
        "customer": { "name": "John Doe", "phone": "08012345678" }
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 48. Get Active Orders

**`GET /api/spare-parts/rider/active`**

Returns this rider's orders currently in progress (accepted through arrived).

```
GET https://olakzride.duckdns.org/api/spare-parts/rider/active
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "heading_to_store",
        "store": { "id": "uuid", "name": "AutoParts Hub", "address": "...", "phone": "..." },
        "order_items": [...],
        "customer": { "name": "John Doe", "phone": "08012345678" }
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 49. Get Delivery History

**`GET /api/spare-parts/rider/history`**

**Query Parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `status` | string | No | Filter by status. Default: `delivered` and `cancelled` |
| `date_from` | ISO date | No | e.g. `2026-08-01` |
| `date_to` | ISO date | No | e.g. `2026-08-31` |
| `limit` | number | No | Default: 20 |
| `page` | number | No | Default: 1 |

```
GET https://olakzride.duckdns.org/api/spare-parts/rider/history?limit=20&page=1
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{
  "success": true,
  "data": { "orders": [...], "total": 45, "page": 1, "limit": 20 },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 50. Get Earnings

**`GET /api/spare-parts/rider/earnings`**

**Query Parameters:** `date_from`, `date_to` (both optional ISO dates)

```
GET https://olakzride.duckdns.org/api/spare-parts/rider/earnings
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "total_deliveries": 24,
    "total_earned": 19200,
    "earnings": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "delivery_fee": "800.00",
        "total_earned": "800.00",
        "status": "paid",
        "created_at": "2026-08-21T00:00:00.000Z"
      }
    ]
  },
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

---

### 51. Update Location

**`POST /api/spare-parts/rider/location`**

Send rider GPS position while delivering. Customer can track in real-time.

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/location
Authorization: Bearer {driver_token}
Content-Type: application/json
```

**Request Body**
```json
{
  "order_id": "uuid",
  "lat": 6.5095,
  "lng": 3.3568,
  "heading": 180.0,
  "speed": 25.5
}
```

| Field | Required |
|---|---|
| `order_id` | **Yes** |
| `lat` | **Yes** |
| `lng` | **Yes** |
| `heading` | No |
| `speed` | No |

**Response `200`**
```json
{ "success": true, "data": null, "message": "Location updated", "timestamp": "..." }
```

---

### 52. Accept Order

**`POST /api/spare-parts/rider/:id/accept`**

Accept a delivery from the available list. Atomically assigns this rider — only one rider can win.

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/accept
Authorization: Bearer {driver_token}
Content-Type: application/json
```

**Request Body** (optional)
```json
{ "estimated_arrival_minutes": 10 }
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Order accepted", "timestamp": "..." }
```

**Response `400` — Order no longer available**
```json
{ "success": false, "error": "Order is no longer available (status: rider_accepted)", "timestamp": "..." }
```

---

### 53. Reject Order

**`POST /api/spare-parts/rider/:id/reject`**

Decline the request. Adds rider to `excluded_rider_ids` so they won't be re-notified.

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/reject
Authorization: Bearer {driver_token}
Content-Type: application/json
```

**Request Body** (optional)
```json
{ "reason": "Too far" }
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Order rejected", "timestamp": "..." }
```

---

### 54. Cancel Order (Rider)

**`POST /api/spare-parts/rider/:id/cancel`**

Cancel after accepting. Automatically re-queues rider search for a replacement.

Allowed from: `rider_accepted`, `heading_to_store`, `shipped`, `heading_to_customer`, `arrived`.

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/cancel
Authorization: Bearer {driver_token}
Content-Type: application/json
```

**Request Body**
```json
{ "reason": "Vehicle breakdown" }
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Order cancelled — searching for another rider", "timestamp": "..." }
```

---

### 55. Heading to Store

**`POST /api/spare-parts/rider/:id/heading-to-store`**

Status: `rider_accepted` → `heading_to_store`

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/heading-to-store
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Marked as heading to store", "timestamp": "..." }
```

---

### 56. Picked Up

**`POST /api/spare-parts/rider/:id/picked-up`**

Status: `rider_accepted` or `heading_to_store` → `shipped`

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/picked-up
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Pickup confirmed", "timestamp": "..." }
```

---

### 57. Heading to Customer

**`POST /api/spare-parts/rider/:id/heading-to-customer`**

Status: `shipped` → `heading_to_customer`

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/heading-to-customer
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Marked as heading to customer", "timestamp": "..." }
```

---

### 58. Arrived

**`POST /api/spare-parts/rider/:id/arrived`**

Status: `shipped` or `heading_to_customer` → `arrived`

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/arrived
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Arrived at delivery address", "timestamp": "..." }
```

---

### 59. Delivered

**`POST /api/spare-parts/rider/:id/delivered`**

Status: `arrived` → `delivered`

Triggers payouts automatically:
- **Wallet orders:** vendor credited `subtotal`, rider credited `delivery_fee`
- **Cash orders:** rider credited `delivery_fee` only (vendor credit happens after confirm-cash)

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/delivered
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Order delivered successfully", "timestamp": "..." }
```

---

### 60. Confirm Cash Payment

**`POST /api/spare-parts/rider/:id/confirm-cash`**

Cash orders only. Call after `delivered` to confirm cash was received from customer.
Triggers vendor wallet credit for cash orders.

```
POST https://olakzride.duckdns.org/api/spare-parts/rider/{order_id}/confirm-cash
Authorization: Bearer {driver_token}
```

**Response `200`**
```json
{ "success": true, "data": null, "message": "Cash payment confirmed", "timestamp": "..." }
```

---

## Order Status Reference

| Status | Set by | Description |
|---|---|---|
| `pending` | System | Order placed, awaiting vendor response |
| `in_progress` | Vendor | Vendor accepted, preparing order |
| `ready_for_pickup` | Vendor | Order packed, rider search starts |
| `searching_rider` | System | Finding available rider |
| `rider_accepted` | Rider | Rider accepted, en route to store |
| `heading_to_store` | Rider | Rider heading to store |
| `shipped` | Rider | Rider picked up order from store |
| `heading_to_customer` | Rider | Rider heading to customer |
| `arrived` | Rider | Rider at customer's location |
| `delivered` | Rider | Order delivered, payouts processed |
| `cancelled` | Customer/Vendor/System | Order cancelled |

## Payout Summary

| Payment | Vendor gets | Rider gets | Platform keeps |
|---|---|---|---|
| Wallet | `subtotal` on delivery | `delivery_fee` on delivery | `service_fee + rounding_fee` |
| Cash | `subtotal` after confirm-cash | `delivery_fee` on delivery | `service_fee + rounding_fee` (tracked) |

---

## Error Responses

All endpoints return errors in this shape:

```json
{
  "success": false,
  "error": "Error message here",
  "timestamp": "2026-08-21T00:00:00.000Z"
}
```

| Status | Meaning |
|---|---|
| `400` | Bad request — missing or invalid fields |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Resource not found |
| `500` | Server error |
