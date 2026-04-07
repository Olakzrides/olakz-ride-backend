# Olakz Marketplace API Testing Flow — Phase 1

Base URL (via gateway): `http://localhost:3000`
Direct marketplace service: `http://localhost:3006`

All authenticated requests require:
```
Authorization: Bearer <jwt_token>
```

---

## Prerequisites

1. Run migration in Supabase SQL editor:
   `services/marketplace-service/prisma/migrations/20260401_phase1_marketplace_core/migration.sql`
2. Start marketplace-service: `cd services/marketplace-service && npm run dev`
3. Have a valid JWT token (customer account)
4. Have a second JWT token (vendor account — must be approved marketplace vendor)
5. Have a third JWT token (admin account)

---

## 1. Health Check

```
GET /api/marketplace/health
```

Success `200`:
```json
{
  "status": "healthy",
  "service": "marketplace-service",
  "version": "1.0.0",
  "uptime": 12,
  "timestamp": "2026-04-02T10:00:00.000Z"
}
```

---

## 2. Categories (Public)

```
GET /api/marketplace/categories
```

Success `200`:
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "categories": [
      { "id": "uuid", "name": "Phones", "icon_url": null, "is_active": true, "sort_order": 1 },
      { "id": "uuid", "name": "Electronics", "icon_url": null, "is_active": true, "sort_order": 2 },
      { "id": "uuid", "name": "Fashion", "icon_url": null, "is_active": true, "sort_order": 3 }
    ]
  }
}
```

---

## 3. Vendor Onboarding (platform-service)

### 3.1 Register as Marketplace Vendor

```
POST /api/vendor/register
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{
  "business_name": "Sure Gadgets",
  "business_type": "marketplace",
  "email": "sure@gadgets.com",
  "phone": "+2348012345678",
  "city": "Lagos",
  "state": "Lagos",
  "address": "Allen Avenue, Ikeja Lagos"
}
```

Success `201`:
```json
{
  "success": true,
  "message": "Registration submitted successfully",
  "data": {
    "vendor": {
      "id": "uuid",
      "user_id": "uuid",
      "business_name": "Sure Gadgets",
      "business_type": "marketplace",
      "verification_status": "pending"
    }
  }
}
```

Error — already registered `400`:
```json
{ "success": false, "message": "Registration already submitted and pending review" }
```

---

### 3.2 Admin Approves Vendor

```
PUT /api/vendor/admin/vendors/:vendor_id/approve
Authorization: Bearer <admin_token>
```

Success `200`:
```json
{
  "success": true,
  "message": "Vendor approved",
  "data": {
    "vendor": {
      "id": "uuid",
      "verification_status": "approved"
    }
  }
}
```

On approval, `marketplace_stores` record is auto-created via internal call to marketplace-service.

---

## 4. Vendor Store Management

### 4.1 Get Store Profile

```
GET /api/marketplace/vendor/store
Authorization: Bearer <vendor_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "uuid",
      "owner_id": "uuid",
      "name": "Sure Gadgets",
      "description": null,
      "logo_url": null,
      "address": "Allen Avenue, Ikeja Lagos",
      "city": "Lagos",
      "state": "Lagos",
      "latitude": "0",
      "longitude": "0",
      "is_active": true,
      "is_open": false,
      "is_verified": true,
      "average_rating": "0.00",
      "total_orders": 0
    }
  }
}
```

---

### 4.2 Update Store Profile (Set Coordinates)

```
PUT /api/marketplace/vendor/store
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{
  "name": "Sure Gadgets",
  "description": "UK used laptops and phones",
  "latitude": 6.6018,
  "longitude": 3.3515,
  "address": "Allen Avenue, Ikeja Lagos",
  "city": "Lagos",
  "state": "Lagos",
  "phone": "+2348012345678",
  "category_ids": ["uuid-of-electronics-category", "uuid-of-phones-category"]
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Store profile updated",
  "data": {
    "store": {
      "id": "uuid",
      "name": "Sure Gadgets",
      "latitude": "6.60180000",
      "longitude": "3.35150000"
    }
  }
}
```

Error — store not found `404`:
```json
{ "success": false, "message": "Store not found" }
```

---

### 4.3 Toggle Store Open/Closed

```
PUT /api/marketplace/vendor/store/status
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{ "is_open": true }
```

Success `200`:
```json
{ "success": true, "message": "Store is now open", "data": null }
```

---

### 4.4 Get Store Statistics

```
GET /api/marketplace/vendor/store/statistics
Authorization: Bearer <vendor_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "statistics": {
      "total_orders": 0,
      "average_rating": "0.00",
      "total_ratings": 0,
      "total_revenue": 0,
      "month_orders": 0,
      "month_revenue": 0,
      "pending_orders": 0
    }
  }
}
```

---

## 5. Vendor Product Management

### 5.1 Create Product

```
POST /api/marketplace/vendor/products
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{
  "name": "iPhone 13",
  "description": "UK used iPhone 13, 256GB, excellent condition",
  "price": 850000,
  "category_id": "uuid-of-phones-category",
  "images": ["https://supabase-url/..."],
  "stock_quantity": 5
}
```

Success `201`:
```json
{
  "success": true,
  "message": "Product created",
  "data": {
    "product": {
      "id": "uuid",
      "store_id": "uuid",
      "name": "iPhone 13",
      "price": "850000.00",
      "is_active": true,
      "is_available": true,
      "stock_quantity": 5
    }
  }
}
```

Error — missing fields `400`:
```json
{ "success": false, "message": "name and price are required" }
```

---

### 5.2 List Products

```
GET /api/marketplace/vendor/products
Authorization: Bearer <vendor_token>
```

Query params (optional): `category_id`, `is_active`, `limit`, `page`

Success `200`:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "iPhone 13",
        "price": "850000.00",
        "is_active": true,
        "is_available": true,
        "average_rating": "0.00",
        "category": { "id": "uuid", "name": "Phones" }
      }
    ]
  }
}
```

---

### 5.3 Update Product

```
PUT /api/marketplace/vendor/products/:product_id
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{
  "price": 800000,
  "description": "Updated description",
  "stock_quantity": 3
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Product updated",
  "data": { "product": { "id": "uuid", "price": "800000.00" } }
}
```

---

### 5.4 Toggle Product Availability

```
PUT /api/marketplace/vendor/products/:product_id/availability
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{ "is_available": false }
```

Success `200`:
```json
{
  "success": true,
  "message": "Availability updated",
  "data": { "product": { "id": "uuid", "is_available": false } }
}
```

---

### 5.5 Delete Product

```
DELETE /api/marketplace/vendor/products/:product_id
Authorization: Bearer <vendor_token>
```

Success `200`:
```json
{ "success": true, "message": "Product deleted", "data": null }
```

---

## 6. Browse (Public — No Auth)

### 6.1 List Stores

```
GET /api/marketplace/stores
```

Query params (optional): `lat=6.5244`, `lng=3.3792`, `radius=15`, `category_id=uuid`, `is_open=true`, `rating_min=4.0`, `limit=20`, `page=1`

Success `200`:
```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "id": "uuid",
        "name": "Sure Gadgets",
        "description": "UK used laptops and phones",
        "logo_url": null,
        "address": "Allen Avenue, Ikeja Lagos",
        "latitude": "6.60180000",
        "longitude": "3.35150000",
        "is_open": true,
        "is_verified": true,
        "average_rating": "0.00",
        "total_ratings": 0
      }
    ]
  }
}
```

---

### 6.2 Get Store Detail

```
GET /api/marketplace/stores/:store_id
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "uuid",
      "name": "Sure Gadgets",
      "address": "Allen Avenue, Ikeja Lagos",
      "latitude": "6.60180000",
      "longitude": "3.35150000",
      "is_open": true,
      "average_rating": "0.00",
      "store_categories": [
        { "category": { "id": "uuid", "name": "Phones" } }
      ],
      "featured_products": {
        "uuid-category-id": [
          { "id": "uuid", "name": "iPhone 13", "price": "850000.00" }
        ]
      }
    }
  }
}
```

Error `404`:
```json
{ "success": false, "message": "Store not found" }
```

---

### 6.3 Get Store Products

```
GET /api/marketplace/stores/:store_id/products
```

Query params (optional): `category_id`, `limit`, `page`

Success `200`:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "iPhone 13",
        "price": "850000.00",
        "images": [],
        "is_available": true,
        "average_rating": "0.00",
        "category": { "id": "uuid", "name": "Phones" }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

---

### 6.4 Get Product Detail

```
GET /api/marketplace/products/:product_id
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "product": {
      "id": "uuid",
      "name": "iPhone 13",
      "description": "UK used iPhone 13, 256GB, excellent condition",
      "price": "850000.00",
      "images": [],
      "is_available": true,
      "stock_quantity": 5,
      "average_rating": "0.00",
      "store": { "id": "uuid", "name": "Sure Gadgets" },
      "category": { "id": "uuid", "name": "Phones" }
    }
  }
}
```

---

### 6.5 Search

```
GET /api/marketplace/search?query=iphone&lat=6.5244&lng=3.3792&limit=10
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "stores": [
      { "id": "uuid", "name": "Sure Gadgets", "is_open": true }
    ],
    "products": [
      {
        "id": "uuid",
        "name": "iPhone 13",
        "price": "850000.00",
        "store": { "id": "uuid", "name": "Sure Gadgets" }
      }
    ]
  }
}
```

---

## 7. Cart (Auth Required)

### 7.1 Add Item to Cart

```
POST /api/marketplace/cart/add
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{
  "product_id": "uuid-of-product",
  "quantity": 1
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "cartItem": {
      "id": "uuid",
      "cart_id": "uuid",
      "product_id": "uuid",
      "quantity": 1,
      "unit_price": "850000.00"
    },
    "cart_cleared": false,
    "previous_store": null
  }
}
```

Note: If adding from a different store, `cart_cleared: true` and `previous_store: "Old Store Name"`.

Error — product not found `404`:
```json
{ "success": false, "message": "Product not found" }
```

Error — product unavailable `400`:
```json
{ "success": false, "message": "Product \"iPhone 13\" is not available" }
```

---

### 7.2 Get Cart

```
GET /api/marketplace/cart
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "uuid",
      "user_id": "uuid",
      "store_id": "uuid",
      "store": { "id": "uuid", "name": "Sure Gadgets", "logo_url": null },
      "items": [
        {
          "id": "uuid",
          "product_id": "uuid",
          "quantity": 1,
          "unit_price": "850000.00",
          "product": { "id": "uuid", "name": "iPhone 13", "price": "850000.00", "images": [] }
        }
      ],
      "subtotal": 850000
    }
  }
}
```

Empty cart `200`:
```json
{ "success": true, "data": { "cart": null, "message": "Cart is empty" } }
```

---

### 7.3 Update Cart Item

```
PUT /api/marketplace/cart/update
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{
  "cart_item_id": "uuid-of-cart-item",
  "quantity": 2
}
```

Success `200`:
```json
{
  "success": true,
  "message": "Cart updated",
  "data": { "cart_item": { "id": "uuid", "quantity": 2 } }
}
```

---

### 7.4 Remove Item from Cart

```
DELETE /api/marketplace/cart/remove?cart_item_id=uuid-of-cart-item
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{ "success": true, "message": "Item removed from cart", "data": null }
```

---

### 7.5 Clear Cart

```
DELETE /api/marketplace/cart
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{ "success": true, "message": "Cart cleared", "data": null }
```

---

## 8. Saved Addresses (Auth Required)

### 8.1 Add Address

```
POST /api/marketplace/addresses
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{
  "label": "Home",
  "address": "45 Admiralty Way, Lekki Phase 1",
  "city": "Lagos",
  "state": "Lagos",
  "latitude": 6.4281,
  "longitude": 3.4219,
  "is_default": true
}
```

Success `201`:
```json
{
  "success": true,
  "message": "Address saved",
  "data": {
    "address": {
      "id": "uuid",
      "label": "Home",
      "address": "45 Admiralty Way, Lekki Phase 1",
      "is_default": true
    }
  }
}
```

---

### 8.2 List Addresses

```
GET /api/marketplace/addresses
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "addresses": [
      {
        "id": "uuid",
        "label": "Home",
        "address": "45 Admiralty Way, Lekki Phase 1",
        "city": "Lagos",
        "latitude": "6.42810000",
        "longitude": "3.42190000",
        "is_default": true
      }
    ]
  }
}
```

---

### 8.3 Update Address

```
PUT /api/marketplace/addresses/:address_id
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{ "label": "Office", "address": "1 Broad Street, Lagos Island" }
```

Success `200`:
```json
{
  "success": true,
  "message": "Address updated",
  "data": { "address": { "id": "uuid", "label": "Office" } }
}
```

---

### 8.4 Delete Address

```
DELETE /api/marketplace/addresses/:address_id
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{ "success": true, "message": "Address deleted", "data": null }
```

---

## 9. Orders (Auth Required)

### 9.1 Estimate Order Total

```
POST /api/marketplace/payment/estimate
Content-Type: application/json
```

Request:
```json
{
  "store_id": "uuid-of-store",
  "items": [
    { "product_id": "uuid-of-product", "quantity": 1 }
  ],
  "delivery_address": {
    "lat": 6.4281,
    "lng": 3.4219
  }
}
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "subtotal": 850000,
    "delivery_fee": 450,
    "service_fee": 50,
    "total_amount": 850500,
    "distance_km": 3.0,
    "distance_text": "3.0 km",
    "currency_code": "NGN"
  }
}
```

---

### 9.2 Place Order

```
POST /api/marketplace/orders
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{
  "store_id": "uuid-of-store",
  "items": [
    {
      "product_id": "uuid-of-product",
      "quantity": 1,
      "special_instructions": "Handle with care"
    }
  ],
  "delivery_address": {
    "address": "45 Admiralty Way, Lekki Phase 1",
    "lat": 6.4281,
    "lng": 3.4219,
    "label": "Home"
  },
  "payment_method": "wallet",
  "special_instructions": "Call on arrival"
}
```

Success `201`:
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "order": {
      "id": "uuid",
      "customer_id": "uuid",
      "store_id": "uuid",
      "status": "pending",
      "payment_method": "wallet",
      "payment_status": "paid",
      "subtotal": "850000.00",
      "delivery_fee": "450.00",
      "service_fee": "50.00",
      "total_amount": "850500.00",
      "wallet_balance_before": "1000000.00",
      "wallet_balance_after": "149500.00",
      "delivery_address": {
        "address": "45 Admiralty Way, Lekki Phase 1",
        "lat": 6.4281,
        "lng": 3.4219,
        "label": "Home"
      },
      "fare_breakdown": {
        "subtotal": 850000,
        "delivery_fee": 450,
        "service_fee": 50,
        "total_amount": 850500,
        "distance_km": 3.0,
        "distance_text": "3.0 km",
        "currency_code": "NGN"
      }
    }
  }
}
```

Error — empty items `400`:
```json
{ "success": false, "message": "Order must contain at least one item" }
```

Error — store closed `400`:
```json
{ "success": false, "message": "Store is currently closed" }
```

Error — store location not set `400`:
```json
{ "success": false, "message": "Store location is not configured. Please contact support." }
```

Error — insufficient balance `400`:
```json
{ "success": false, "message": "Insufficient wallet balance. Required: ₦850500.00, Available: ₦500.00" }
```

Error — card payment `400`:
```json
{ "success": false, "message": "Only wallet payment is supported" }
```

---

### 9.3 Get Order Details

```
GET /api/marketplace/orders/:order_id
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "status": "pending",
      "payment_status": "paid",
      "total_amount": "850500.00",
      "store": { "id": "uuid", "name": "Sure Gadgets", "phone": "+2348012345678" },
      "order_items": [
        {
          "id": "uuid",
          "product_name": "iPhone 13",
          "product_price": "850000.00",
          "quantity": 1,
          "subtotal": "850000.00"
        }
      ],
      "status_history": [
        { "status": "pending", "previous_status": null, "changed_by_role": "customer", "created_at": "2026-04-02T10:00:00Z" }
      ]
    }
  }
}
```

---

### 9.4 Order History

```
GET /api/marketplace/orders/history
Authorization: Bearer <customer_token>
```

Query params (optional): `status=pending`, `limit=10`, `page=1`

Success `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "pending",
        "payment_status": "paid",
        "total_amount": "850500.00",
        "created_at": "2026-04-02T10:00:00Z",
        "store": { "id": "uuid", "name": "Sure Gadgets", "logo_url": null },
        "order_items": [
          { "id": "uuid", "product_name": "iPhone 13", "quantity": 1, "product_price": "850000.00" }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 9.5 Cancel Order
`
```
POST /api/marketplace/orders/:order_id/cancel
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{ "reason": "Changed my mind" }
```

Success `200`:
```json
{
  "success": true,
  "message": "Order cancelled",
  "data": { "success": true, "message": "Order cancelled and refund processed" }
}
```

Error — cannot cancel `400`:
```json
{ "success": false, "message": "Cannot cancel order in status: ready_for_pickup" }
```

---

## 10. Vendor Order Management

### 10.1 Get Vendor Orders

```
GET /api/marketplace/vendor/orders
Authorization: Bearer <vendor_token>
```

Query params (optional): `status=pending`, `date_from`, `date_to`, `limit`, `page`

Success `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "pending",
        "payment_status": "paid",
        "total_amount": "850500.00",
        "delivery_address": { "address": "45 Admiralty Way", "lat": 6.4281, "lng": 3.4219 },
        "order_items": [
          { "product_name": "iPhone 13", "quantity": 1, "product_price": "850000.00", "subtotal": "850000.00" }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 10.2 Accept Order

```
POST /api/marketplace/vendor/orders/:order_id/accept
Authorization: Bearer <vendor_token>
```

No request body needed.

Success `200`:
```json
{ "success": true, "message": "Order accepted", "data": null }
```

Error — wrong status `400`:
```json
{ "success": false, "message": "Cannot accept order in status: in_progress" }
```

---

### 10.3 Reject Order

```
POST /api/marketplace/vendor/orders/:order_id/reject
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{ "rejection_reason": "Item out of stock" }
```

Success `200`:
```json
{ "success": true, "message": "Order rejected and customer refunded", "data": null }
```

---

### 10.4 Mark Order Ready for Pickup

```
PUT /api/marketplace/vendor/orders/:order_id/ready
Authorization: Bearer <vendor_token>
```

No request body needed.

Success `200`:
```json
{ "success": true, "message": "Order marked as ready for pickup", "data": null }
```

Error — wrong status `400`:
```json
{ "success": false, "message": "Cannot mark ready from status: pending" }
```

---

## Phase 1 Testing Flow (Recommended Order)

1. Run Phase 1 migration in Supabase SQL editor
2. `GET /api/marketplace/health` — confirm service is up
3. `GET /api/marketplace/categories` — confirm seeded categories
4. `POST /api/vendor/register` (platform-service) with `business_type: "marketplace"`
5. `PUT /api/vendor/admin/vendors/:id/approve` (admin) — marketplace_stores auto-created
6. `PUT /api/marketplace/vendor/store` — set lat/lng and categories
7. `PUT /api/marketplace/vendor/store/status` body `{ "is_open": true }`
8. `POST /api/marketplace/vendor/products` — create a product
9. `GET /api/marketplace/stores` — confirm store appears
10. `GET /api/marketplace/stores/:id` — confirm store detail + featured products
11. `GET /api/marketplace/products/:id` — confirm product detail
12. `GET /api/marketplace/search?query=iphone` — confirm search works
13. `POST /api/marketplace/cart/add` — add product to cart (customer token)
14. `GET /api/marketplace/cart` — confirm cart state
15. `POST /api/marketplace/payment/estimate` — check fare calculation
16. `POST /api/marketplace/orders` — place order (wallet)
17. `GET /api/marketplace/vendor/orders` — vendor sees new order
18. `POST /api/marketplace/vendor/orders/:id/accept` — vendor accepts → status: in_progress
19. `GET /api/marketplace/orders/:id` — customer sees status = in_progress
20. `PUT /api/marketplace/vendor/orders/:id/ready` — vendor marks packed → status: ready_for_pickup
21. Test cancel: place a fresh order, then `POST /api/marketplace/orders/:id/cancel`
22. Test vendor reject: place a fresh order, vendor rejects → confirm customer refunded
23. Test 10-min expiry: place order, do NOT accept, wait 10 min → confirm auto-cancel + refund

---

## Common Error Responses

`401 Unauthorized`:
```json
{ "success": false, "message": "Missing or invalid authorization header" }
```

`403 Forbidden` (vendor not approved):
```json
{ "success": false, "message": "Vendor account not approved for marketplace" }
```

`404 Not Found`:
```json
{ "success": false, "message": "Store not found" }
```

`400 Bad Request`:
```json
{ "success": false, "message": "store_id, items and delivery_address are required" }
```

`500 Internal Server Error`:
```json
{ "success": false, "message": "Internal server error", "error": { "code": "INTERNAL_SERVER_ERROR" } }
```


---

---

# Olakz Marketplace API Testing Flow — Phase 2 (Rider Matching, Delivery & Real-time Tracking)

---

## Phase 2 Prerequisites

1. Run Phase 2 migration in Supabase SQL editor:
   `services/marketplace-service/prisma/migrations/20260403_phase2_delivery/migration.sql`
2. Restart marketplace-service after migration
3. Have a valid JWT token for a **driver** account (same driver pool as core-logistics)
4. The driver must exist in the `drivers` table in Supabase

---

## 11. Rider Endpoints (Auth Required — Driver Account)

### 11.1 Get Available Orders

Lists orders currently in `searching_rider` status that the rider has not been excluded from.

```
GET /api/marketplace/rider/available
Authorization: Bearer <driver_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "searching_rider",
        "delivery_fee": "450.00",
        "total_amount": "850500.00",
        "delivery_address": {
          "address": "45 Admiralty Way, Lekki Phase 1",
          "lat": 6.4281,
          "lng": 3.4219,
          "label": "Home"
        },
        "created_at": "2026-04-03T10:00:00.000Z",
        "store": {
          "id": "uuid",
          "name": "Sure Gadgets",
          "address": "Allen Avenue, Ikeja Lagos",
          "latitude": "6.60180000",
          "longitude": "3.35150000"
        }
      }
    ]
  }
}
```

Empty `200`:
```json
{ "success": true, "data": { "orders": [] } }
```

Error — driver not found `404`:
```json
{ "success": false, "message": "Driver profile not found" }
```

---

### 11.2 Accept Order

Rider accepts an order that is in `searching_rider` status.

```
POST /api/marketplace/rider/:order_id/accept
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request (optional):
```json
{
  "estimated_arrival_minutes": 15
}
```

Success `200`:
```json
{ "success": true, "message": "Order accepted", "data": null }
```

Error — order no longer available `400`:
```json
{ "success": false, "message": "Order is no longer available for pickup" }
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

### 11.3 Reject Order

Rider rejects an order (adds rider to excluded list, matching continues with other riders).

```
POST /api/marketplace/rider/:order_id/reject
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request (optional):
```json
{
  "reason": "Too far from my location"
}
```

Success `200`:
```json
{ "success": true, "message": "Order rejected", "data": null }
```

---

### 11.4 Cancel After Accepting

Rider cancels an order they already accepted. System re-initiates rider search.

```
POST /api/marketplace/rider/:order_id/cancel
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request:
```json
{
  "reason": "Vehicle breakdown"
}
```

Success `200`:
```json
{ "success": true, "message": "Order cancelled — searching for another rider", "data": null }
```

Error — reason missing `400`:
```json
{ "success": false, "message": "reason is required" }
```

Error — cannot cancel `400`:
```json
{ "success": false, "message": "Cannot cancel order in status: delivered" }
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

### 11.5 Get Active Deliveries

Lists orders currently assigned to the rider in `rider_accepted`, `shipped`, or `arrived` status.

```
GET /api/marketplace/rider/active
Authorization: Bearer <driver_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "shipped",
        "delivery_fee": "450.00",
        "total_amount": "850500.00",
        "delivery_address": {
          "address": "45 Admiralty Way, Lekki Phase 1",
          "lat": 6.4281,
          "lng": 3.4219
        },
        "store": {
          "id": "uuid",
          "name": "Sure Gadgets",
          "address": "Allen Avenue, Ikeja Lagos",
          "phone": "+2348012345678"
        },
        "order_items": [
          { "product_name": "iPhone 13", "quantity": 1, "product_price": "850000.00" }
        ]
      }
    ]
  }
}
```

---

### 11.6 Confirm Pickup from Vendor

Rider confirms they have collected the order from the vendor store. Order must be in `rider_accepted` status. Transitions to `shipped`.

```
POST /api/marketplace/rider/:order_id/picked-up
Authorization: Bearer <driver_token>
```

No request body needed.

Success `200`:
```json
{ "success": true, "message": "Pickup confirmed", "data": null }
```

Error — wrong status `400`:
```json
{ "success": false, "message": "Cannot mark picked-up from status: pending" }
```

Error — not your order `403`:
```json
{ "success": false, "message": "Unauthorized — not your order" }
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

### 11.7 Arrived at Customer

Rider marks they have arrived at the customer's delivery address. Order must be in `shipped` status.

```
POST /api/marketplace/rider/:order_id/arrived
Authorization: Bearer <driver_token>
```

No request body needed.

Success `200`:
```json
{ "success": true, "message": "Arrived at delivery address", "data": null }
```

Error — wrong status `400`:
```json
{ "success": false, "message": "Cannot mark arrived from status: pending" }
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

### 11.8 Mark Delivered

Rider marks the order as delivered. Order must be in `arrived` status.

```
POST /api/marketplace/rider/:order_id/delivered
Authorization: Bearer <driver_token>
```

No request body needed.

Success `200`:
```json
{ "success": true, "message": "Order delivered successfully", "data": null }
```

Error — wrong status `400`:
```json
{ "success": false, "message": "Cannot mark delivered from status: shipped" }
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

### 11.9 Update Real-time Location

Rider sends their current GPS coordinates while on a delivery. Broadcasts to customer via Socket.IO.

```
POST /api/marketplace/rider/location
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request:
```json
{
  "order_id": "uuid-of-order",
  "lat": 6.5244,
  "lng": 3.3792,
  "heading": 180,
  "speed": 40
}
```

Success `200`:
```json
{ "success": true, "message": "Location updated", "data": null }
```

Error — missing fields `400`:
```json
{ "success": false, "message": "order_id, lat and lng are required" }
```

---

## 12. Customer Tracking & Receipt

### 12.1 Get Order Tracking

Returns current order status, status history, assigned rider info, and latest rider GPS location.

```
GET /api/marketplace/orders/:order_id/tracking
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "tracking": {
      "order_id": "uuid",
      "status": "shipped",
      "status_history": [
        { "status": "pending", "timestamp": "2026-04-03T10:00:00.000Z" },
        { "status": "in_progress", "timestamp": "2026-04-03T10:02:00.000Z" },
        { "status": "ready_for_pickup", "timestamp": "2026-04-03T10:15:00.000Z" },
        { "status": "searching_rider", "timestamp": "2026-04-03T10:15:05.000Z" },
        { "status": "shipped", "timestamp": "2026-04-03T10:22:00.000Z" }
      ],
      "rider": {
        "id": "uuid",
        "user_id": "uuid",
        "rating": "4.80",
        "vehicles": [
          {
            "manufacturer": "Honda",
            "model": "CB 125",
            "color": "Red",
            "plate_number": "LAG-123-XY"
          }
        ]
      },
      "rider_location": {
        "lat": 6.5244,
        "lng": 3.3792,
        "updated_at": "2026-04-03T10:25:00.000Z"
      }
    }
  }
}
```

No rider assigned yet `200`:
```json
{
  "success": true,
  "data": {
    "tracking": {
      "order_id": "uuid",
      "status": "searching_rider",
      "status_history": [...],
      "rider": null,
      "rider_location": null
    }
  }
}
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

### 12.2 Get E-Receipt

Returns a formatted receipt for a completed or in-progress order.

```
GET /api/marketplace/orders/:order_id/receipt
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "receipt": {
      "order_id": "OLKABCD1234",
      "date": "2026-04-03T10:00:00.000Z",
      "items": [
        {
          "name": "iPhone 13",
          "quantity": 1,
          "price": 850000
        }
      ],
      "subtotal": 850000,
      "delivery_fee": 450,
      "service_fee": 50,
      "total_amount": 850500,
      "payment_method": "wallet",
      "delivery_address": {
        "address": "45 Admiralty Way, Lekki Phase 1",
        "lat": 6.4281,
        "lng": 3.4219,
        "label": "Home"
      }
    }
  }
}
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

---

## 13. Socket.IO Real-time Events (Phase 2)

Base URL: `http://localhost:3006`

### Namespaces

| Namespace | Who connects | Purpose |
|---|---|---|
| `/marketplace-orders` | Customers | Order status updates, rider location |
| `/marketplace-vendor` | Vendors | New orders, order updates |
| `/marketplace-riders` | Riders/Drivers | New order assignments |

### Customer Events (subscribe on `/marketplace-orders`)

```js
const socket = io('http://localhost:3006/marketplace-orders', {
  auth: { token: '<jwt_token>' }
});

// Order status changed
socket.on('marketplace:order:status_update', (data) => {
  // data: { order_id, status, message }
});

// Rider location update (while order is in transit)
socket.on('marketplace:order:rider_location', (data) => {
  // data: { order_id, lat, lng, heading, updated_at }
});
```

### Vendor Events (subscribe on `/marketplace-vendor`)

```js
const socket = io('http://localhost:3006/marketplace-vendor', {
  auth: { token: '<vendor_jwt_token>' }
});

// New order placed
socket.on('marketplace:order:new', (data) => {
  // data: { order_id, customer_id, total_amount, items }
});

// Order delivered
socket.on('marketplace:order:delivered', (data) => {
  // data: { order_id }
});
```

### Rider Events (subscribe on `/marketplace-riders`)

```js
const socket = io('http://localhost:3006/marketplace-riders', {
  auth: { token: '<driver_jwt_token>' }
});

// New order available for pickup
socket.on('marketplace:rider:new_order', (data) => {
  // data: { order_id, store, delivery_address, delivery_fee, total_amount }
});
```

---

## Phase 2 Testing Flow (Recommended Order)

1. Run Phase 2 migration in Supabase SQL editor
2. Restart marketplace-service
3. Complete Phase 1 flow up to step 20 (vendor marks order `ready_for_pickup`)
   - At this point, `markReady` auto-triggers rider search → status becomes `searching_rider`
4. `GET /api/marketplace/rider/available` (driver token) — confirm order appears
5. `POST /api/marketplace/rider/:id/accept` — driver accepts order → status becomes `rider_accepted`
6. `GET /api/marketplace/rider/active` — confirm order appears in active deliveries
7. `GET /api/marketplace/orders/:id/tracking` (customer token) — confirm rider info populated
8. `POST /api/marketplace/rider/location` — send a few location updates
9. `GET /api/marketplace/orders/:id/tracking` — confirm `rider_location` updated
10. `POST /api/marketplace/rider/:id/picked-up` — rider picks up from vendor → status: `shipped`
11. `POST /api/marketplace/rider/:id/arrived` — rider arrives at customer → status: `arrived`
12. `GET /api/marketplace/orders/:id/tracking` — confirm status = `arrived`
13. `POST /api/marketplace/rider/:id/delivered` — mark delivered → status: `delivered`
14. `GET /api/marketplace/orders/:id/receipt` — confirm e-receipt generated
15. Test reject flow: place new order → vendor marks ready → `POST /api/marketplace/rider/:id/reject` → confirm order still in `searching_rider`
16. Test cancel flow: accept an order → `POST /api/marketplace/rider/:id/cancel` → confirm system re-searches for rider
17. Test matching timeout: place order → vendor marks ready → do NOT accept → wait 30 min → confirm order auto-cancelled and customer refunded

---

## Order Status Flow (Full Phase 1 + Phase 2)

```
pending
  → in_progress       (vendor accepts)
  → ready_for_pickup  (vendor marks packed)
  → searching_rider   (auto-triggered by markReady)
  → rider_accepted    (rider accepts the order)
  → shipped           (rider picks up from vendor — POST /rider/:id/picked-up)
  → arrived           (rider arrives at customer)
  → delivered         (rider marks delivered)

OR:
  → cancelled         (customer cancels from: pending, in_progress, searching_rider)
  → courier_not_found (no rider accepted after 3 × 10 min rounds — auto-refund)
```

Note: `riderCancel` is allowed from `rider_accepted`, `shipped`, or `arrived`.


---

---

# Olakz Marketplace API Testing Flow — Phase 3 (Reviews, Wishlist, Analytics & Admin)

---

## Phase 3 Prerequisites

1. Run Phase 3 migration in Supabase SQL editor:
   `services/marketplace-service/prisma/migrations/20260405_phase3_reviews_analytics/migration.sql`
2. Restart marketplace-service after migration
3. Complete a full Phase 2 order through to `delivered` status before testing reviews

---

## 14. Reviews (Public Read / Auth Write)

### 14.1 Submit Order Review

Customer submits a review after order is delivered. One review per order (unique constraint).

```
POST /api/marketplace/orders/:order_id/review
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{
  "store_rating": 5,
  "comment": "Great products, fast delivery!",
  "product_ratings": [
    { "product_id": "uuid-of-product", "rating": 5 }
  ]
}
```

Success `201`:
```json
{
  "success": true,
  "message": "Review submitted",
  "data": {
    "review": {
      "id": "uuid",
      "order_id": "uuid",
      "store_id": "uuid",
      "store_rating": 5,
      "comment": "Great products, fast delivery!",
      "created_at": "2026-04-05T10:00:00.000Z"
    }
  }
}
```

Error — order not delivered `400`:
```json
{ "success": false, "message": "Can only review delivered orders" }
```

Error — already reviewed `400`:
```json
{ "success": false, "message": "Review already submitted for this order" }
```

Error — order not found `404`:
```json
{ "success": false, "message": "Order not found" }
```

Error — not your order `403`:
```json
{ "success": false, "message": "Unauthorized" }
```

---

### 14.2 Get Store Reviews (Public)

```
GET /api/marketplace/stores/:store_id/reviews
```

Query params (optional): `limit=20`, `page=1`

Success `200`:
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "store_rating": 5,
        "comment": "Great products, fast delivery!",
        "customer_id": "uuid",
        "created_at": "2026-04-05T10:00:00.000Z",
        "product_reviews": [
          {
            "product_rating": 5,
            "product": { "name": "iPhone 13" }
          }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 14.3 Get Product Reviews (Public)

```
GET /api/marketplace/products/:product_id/reviews
```

Query params (optional): `limit=20`, `page=1`

Success `200`:
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "uuid",
        "product_rating": 5,
        "review": {
          "store_rating": 5,
          "comment": "Great products!",
          "customer_id": "uuid",
          "created_at": "2026-04-05T10:00:00.000Z"
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

## 15. Similar Products (Public)

```
GET /api/marketplace/products/:product_id/similar
```

Returns up to 8 products from the same store in the same category, excluding the current product.

Success `200`:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "iPhone 14",
        "price": "950000.00",
        "images": [],
        "is_available": true,
        "average_rating": "4.50",
        "category": { "id": "uuid", "name": "Phones" }
      }
    ]
  }
}
```

Empty (no similar products) `200`:
```json
{ "success": true, "data": { "products": [] } }
```

---

## 16. Wishlist (Auth Required — Customer)

### 16.1 Add to Wishlist

Idempotent — no error if product already wishlisted.

```
POST /api/marketplace/wishlist
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{ "product_id": "uuid-of-product" }
```

Success `200`:
```json
{ "success": true, "message": "Added to wishlist", "data": null }
```

Error — product not found `404`:
```json
{ "success": false, "message": "Product not found" }
```

Error — missing field `400`:
```json
{ "success": false, "message": "product_id is required" }
```

---

### 16.2 Get Wishlist

```
GET /api/marketplace/wishlist
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "product_id": "uuid",
        "created_at": "2026-04-05T10:00:00.000Z",
        "product": {
          "id": "uuid",
          "name": "iPhone 13",
          "price": "850000.00",
          "images": [],
          "is_available": true,
          "average_rating": "5.00",
          "store": { "id": "uuid", "name": "Sure Gadgets", "logo_url": null }
        }
      }
    ]
  }
}
```

Empty `200`:
```json
{ "success": true, "data": { "items": [] } }
```

---

### 16.3 Remove from Wishlist

```
DELETE /api/marketplace/wishlist/:product_id
Authorization: Bearer <customer_token>
```

Success `200`:
```json
{ "success": true, "message": "Removed from wishlist", "data": null }
```

---

## 17. Vendor Analytics (Auth Required — Approved Vendor)

### 17.1 Analytics Dashboard

```
GET /api/marketplace/vendor/analytics/dashboard
Authorization: Bearer <vendor_token>
```

Success `200`:
```json
{
  "success": true,
  "data": {
    "store_name": "Sure Gadgets",
    "average_rating": "4.80",
    "total_ratings": 12,
    "today": { "orders": 3, "revenue": 2550000 },
    "this_month": {
      "orders": 45,
      "revenue": 38250000,
      "completed": 40,
      "cancelled": 5
    },
    "last_month": { "orders": 38, "revenue": 32300000 },
    "pending_orders": 2
  }
}
```

---

### 17.2 Orders by Date

```
GET /api/marketplace/vendor/analytics/orders
Authorization: Bearer <vendor_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

Success `200`:
```json
{
  "success": true,
  "data": {
    "by_date": [
      { "date": "2026-04-01", "orders": 5, "revenue": 4250000 },
      { "date": "2026-04-02", "orders": 3, "revenue": 2550000 },
      { "date": "2026-04-03", "orders": 7, "revenue": 5950000 }
    ]
  }
}
```

---

### 17.3 Vendor Earnings

```
GET /api/marketplace/vendor/earnings
Authorization: Bearer <vendor_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

Success `200`:
```json
{
  "success": true,
  "data": {
    "total_orders": 40,
    "vendor_earnings": 34000000,
    "delivery_fees": 18000,
    "total_revenue": 34000000
  }
}
```

Note: Vendor keeps the `subtotal` (product value). Olakz keeps the `delivery_fee`.

---

## 18. Rider History & Earnings (Auth Required — Driver Account)

### 18.1 Rider Delivery History

```
GET /api/marketplace/rider/history
Authorization: Bearer <driver_token>
```

Query params (optional): `status=delivered`, `date_from=2026-04-01`, `date_to=2026-04-30`, `limit=20`, `page=1`

Success `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "delivered",
        "delivery_fee": "450.00",
        "total_amount": "850500.00",
        "delivered_at": "2026-04-05T11:30:00.000Z",
        "store": { "id": "uuid", "name": "Sure Gadgets" },
        "order_items": [
          { "product_name": "iPhone 13", "quantity": 1, "product_price": "850000.00" }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

---

### 18.2 Rider Earnings

```
GET /api/marketplace/rider/earnings
Authorization: Bearer <driver_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

Success `200`:
```json
{
  "success": true,
  "data": {
    "total_deliveries": 15,
    "total_earned": 6750,
    "earnings": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "delivery_fee": "450.00",
        "total_earned": "450.00",
        "status": "pending",
        "created_at": "2026-04-05T11:30:00.000Z"
      }
    ]
  }
}
```

---

## 19. Admin Endpoints (Auth Required — Admin/Super Admin)

All admin endpoints require a JWT token with role `admin` or `super_admin`.

### 19.1 List All Stores

```
GET /api/marketplace/admin/stores
Authorization: Bearer <admin_token>
```

Query params (optional): `status=active|inactive`, `category_id=uuid`, `page=1`, `limit=20`

Success `200`:
```json
{
  "success": true,
  "data": {
    "stores": [
      {
        "id": "uuid",
        "name": "Sure Gadgets",
        "owner_id": "uuid",
        "is_active": true,
        "is_open": true,
        "is_verified": true,
        "average_rating": "4.80",
        "total_orders": 45,
        "city": "Lagos",
        "created_at": "2026-04-01T00:00:00.000Z",
        "store_categories": [
          { "category": { "name": "Phones" } }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 19.2 List All Orders

```
GET /api/marketplace/admin/orders
Authorization: Bearer <admin_token>
```

Query params (optional): `status=delivered`, `store_id=uuid`, `date_from=2026-04-01`, `date_to=2026-04-30`, `page=1`, `limit=20`

Success `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "delivered",
        "payment_status": "paid",
        "total_amount": "850500.00",
        "created_at": "2026-04-05T10:00:00.000Z",
        "store": { "id": "uuid", "name": "Sure Gadgets" },
        "order_items": [
          { "product_name": "iPhone 13", "quantity": 1, "product_price": "850000.00" }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 19.3 Activate / Deactivate Store

```
PUT /api/marketplace/admin/stores/:store_id/status
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Request:
```json
{ "is_active": false }
```

Success `200`:
```json
{ "success": true, "message": "Store deactivated", "data": null }
```

Activate:
```json
{ "is_active": true }
```

Success `200`:
```json
{ "success": true, "message": "Store activated", "data": null }
```

Error — store not found `404`:
```json
{ "success": false, "message": "Store not found" }
```

Error — missing field `400`:
```json
{ "success": false, "message": "is_active is required" }
```

---

### 19.4 Platform Analytics

```
GET /api/marketplace/admin/analytics
Authorization: Bearer <admin_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

Success `200`:
```json
{
  "success": true,
  "data": {
    "total_orders": 150,
    "total_revenue": 127500000,
    "total_stores": 8,
    "active_stores": 7,
    "by_date": [
      { "date": "2026-04-01", "orders": 12, "revenue": 10200000 },
      { "date": "2026-04-02", "orders": 9, "revenue": 7650000 }
    ]
  }
}
```

---

## Phase 3 Testing Flow (Recommended Order)

1. Run Phase 3 migration in Supabase SQL editor
2. Restart marketplace-service
3. Complete a full Phase 1 + Phase 2 order through to `delivered`
4. `POST /api/marketplace/orders/:id/review` — submit review with store + product ratings
5. `GET /api/marketplace/stores/:id/reviews` — confirm review appears publicly
6. `GET /api/marketplace/products/:id/reviews` — confirm product rating updated
7. `GET /api/marketplace/stores/:id` — confirm `average_rating` updated on store
8. `GET /api/marketplace/products/:id` — confirm `average_rating` updated on product
9. `POST /api/marketplace/wishlist` — add product to wishlist
10. `GET /api/marketplace/wishlist` — confirm wishlist with product + store info
11. `POST /api/marketplace/wishlist` (same product) — confirm idempotent, no error
12. `GET /api/marketplace/products/:id/similar` — confirm similar products returned
13. `DELETE /api/marketplace/wishlist/:product_id` — remove from wishlist
14. `GET /api/marketplace/wishlist` — confirm empty
15. `GET /api/marketplace/vendor/analytics/dashboard` — vendor sees stats
16. `GET /api/marketplace/vendor/analytics/orders?date_from=2026-04-01` — orders by date
17. `GET /api/marketplace/vendor/earnings` — vendor earnings summary
18. `GET /api/marketplace/rider/history` — rider sees completed deliveries
19. `GET /api/marketplace/rider/earnings` — rider sees earnings
20. `GET /api/marketplace/admin/stores` — admin sees all stores
21. `GET /api/marketplace/admin/orders?status=delivered` — admin sees delivered orders
22. `PUT /api/marketplace/admin/stores/:id/status` body `{ "is_active": false }` — deactivate store
23. `GET /api/marketplace/stores` — confirm deactivated store no longer appears
24. `PUT /api/marketplace/admin/stores/:id/status` body `{ "is_active": true }` — reactivate
25. `GET /api/marketplace/admin/analytics` — platform-wide stats
26. Test review guard: try to review an order in `pending` status → confirm `400` error
27. Test duplicate review: submit review twice on same order → confirm `400` error
