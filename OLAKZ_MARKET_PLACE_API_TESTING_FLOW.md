# Olakz Marketplace API Integration Guide

Base URL: `https://olakzride.duckdns.org`

All authenticated requests require:
```
Authorization: Bearer <jwt_token>
```

---

## 1. Categories (Public — No Auth)

```
GET /api/marketplace/categories
```

Response `200`:
```json
{
  "success": true,
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

## 2. Vendor Onboarding

### 2.1 Register as Marketplace Vendor

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

Response `201`:
```json
{
  "success": true,
  "message": "Registration submitted successfully",
  "data": {
    "vendor": {
      "id": "uuid",
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

### 2.2 Check Registration Status

```
GET /api/vendor/register/status
Authorization: Bearer <vendor_token>
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "status": {
      "verification_status": "pending",
      "rejection_reason": null,
      "business_name": "Sure Gadgets"
    }
  }
}
```

Possible `verification_status` values: `pending`, `approved`, `rejected`

Once approved by admin, the vendor can access all `/api/marketplace/vendor/*` endpoints.

---

## 3. Browse Stores & Products (Public — No Auth)

### 3.1 List Stores

```
GET /api/marketplace/stores
```

Query params (all optional):
```
lat=6.5244
lng=3.3792
radius=15
category_id=uuid
is_open=true
rating_min=4.0
limit=20
page=1
```

Response `200`:
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

### 3.2 Get Store Details

```
GET /api/marketplace/stores/:store_id
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "uuid",
      "name": "Sure Gadgets",
      "address": "Allen Avenue, Ikeja Lagos",
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

---

### 3.3 Get Store Products

```
GET /api/marketplace/stores/:store_id/products
```

Query params (optional): `category_id=uuid`, `limit=20`, `page=1`

Response `200`:
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

### 3.4 Get Product Details

```
GET /api/marketplace/products/:product_id
```

Response `200`:
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

### 3.5 Similar Products

```
GET /api/marketplace/products/:product_id/similar
```

Returns up to 8 products from the same store in the same category.

Response `200`:
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

---

### 3.6 Search

```
GET /api/marketplace/search?query=iphone&lat=6.5244&lng=3.3792&limit=10
```

Response `200`:
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

### 3.7 Store Reviews (Public)

```
GET /api/marketplace/stores/:store_id/reviews
```

Query params (optional): `limit=20`, `page=1`

Response `200`:
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

### 3.8 Product Reviews (Public)

```
GET /api/marketplace/products/:product_id/reviews
```

Query params (optional): `limit=20`, `page=1`

Response `200`:
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

## 4. Cart (Auth Required)

### 4.1 Add Item

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

Response `200`:
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "cartItem": {
      "id": "uuid",
      "product_id": "uuid",
      "quantity": 1,
      "unit_price": "850000.00"
    },
    "cart_cleared": false,
    "previous_store": null
  }
}
```

Note: If adding from a different store, `cart_cleared: true` and `previous_store: "Old Store Name"` — the cart is automatically cleared.

---

### 4.2 Get Cart

```
GET /api/marketplace/cart
Authorization: Bearer <customer_token>
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "uuid",
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

Empty cart:
```json
{ "success": true, "data": { "cart": null, "message": "Cart is empty" } }
```

---

### 4.3 Update Cart Item

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

---

### 4.4 Remove Item

```
DELETE /api/marketplace/cart/remove?cart_item_id=uuid-of-cart-item
Authorization: Bearer <customer_token>
```

---

### 4.5 Clear Cart

```
DELETE /api/marketplace/cart
Authorization: Bearer <customer_token>
```

---

## 5. Saved Addresses (Auth Required)

### 5.1 Add Address

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

Response `201`:
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

### 5.2 List Addresses

```
GET /api/marketplace/addresses
Authorization: Bearer <customer_token>
```

---

### 5.3 Update Address

```
PUT /api/marketplace/addresses/:address_id
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request (all optional):
```json
{ "label": "Office", "address": "1 Broad Street, Lagos Island" }
```

---

### 5.4 Delete Address

```
DELETE /api/marketplace/addresses/:address_id
Authorization: Bearer <customer_token>
```

---

## 6. Orders (Auth Required)

### 6.1 Estimate Order Total

```
POST /api/marketplace/payment/estimate
Authorization: Bearer <customer_token>
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

Response `200`:
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

### 6.2 Place Order

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

Response `201`:
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "order": {
      "id": "uuid",
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
      }
    }
  }
}
```

Common errors:
```json
{ "success": false, "message": "Insufficient wallet balance. Required: ₦850500.00, Available: ₦500.00" }
{ "success": false, "message": "Store is currently closed" }
{ "success": false, "message": "Store location is not configured. Please contact support." }
{ "success": false, "message": "Only wallet payment is supported" }
```

---

### 6.3 Get Order Details

```
GET /api/marketplace/orders/:order_id
Authorization: Bearer <customer_token>
```

Response `200`:
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
        { "status": "pending", "changed_by_role": "customer", "created_at": "2026-04-02T10:00:00Z" }
      ]
    }
  }
}
```

---

### 6.4 Order History

```
GET /api/marketplace/orders/history
Authorization: Bearer <customer_token>
```

Query params (optional): `status=pending`, `limit=10`, `page=1`

Response `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "pending",
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

### 6.5 Cancel Order

```
POST /api/marketplace/orders/:order_id/cancel
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{ "reason": "Changed my mind" }
```

Response `200`:
```json
{
  "success": true,
  "message": "Order cancelled",
  "data": { "success": true, "message": "Order cancelled and refund processed" }
}
```

---

### 6.6 Submit Review

Can only be submitted after order status is `delivered`. One review per order.

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

Response `201`:
```json
{
  "success": true,
  "message": "Review submitted",
  "data": {
    "review": {
      "id": "uuid",
      "store_rating": 5,
      "comment": "Great products, fast delivery!"
    }
  }
}
```

Errors:
```json
{ "success": false, "message": "Can only review delivered orders" }
{ "success": false, "message": "Review already submitted for this order" }
```

---

### 6.7 Order Tracking

```
GET /api/marketplace/orders/:order_id/tracking
Authorization: Bearer <customer_token>
```

Response `200`:
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

---

### 6.8 Order Receipt

```
GET /api/marketplace/orders/:order_id/receipt
Authorization: Bearer <customer_token>
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "receipt": {
      "order_id": "OLKABCD1234",
      "date": "2026-04-03T10:00:00.000Z",
      "items": [
        { "name": "iPhone 13", "quantity": 1, "price": 850000 }
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

---

## 7. Wishlist (Auth Required)

### 7.1 Add to Wishlist

Idempotent — no error if already wishlisted.

```
POST /api/marketplace/wishlist
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request:
```json
{ "product_id": "uuid-of-product" }
```

---

### 7.2 Get Wishlist

```
GET /api/marketplace/wishlist
Authorization: Bearer <customer_token>
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
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

---

### 7.3 Remove from Wishlist

```
DELETE /api/marketplace/wishlist/:product_id
Authorization: Bearer <customer_token>
```

---

## 8. Vendor Store Management (Auth Required — Approved Vendor)

Vendor must be approved before accessing any `/api/marketplace/vendor/*` endpoint. Unapproved vendors get `403`.

### 8.1 Get Store Profile

```
GET /api/marketplace/vendor/store
Authorization: Bearer <vendor_token>
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "store": {
      "id": "uuid",
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

### 8.2 Update Store Profile

```
PUT /api/marketplace/vendor/store
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request (all optional):
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
  "category_ids": ["uuid-of-category"]
}
```

Note: `latitude` and `longitude` must be set for delivery fare calculation and rider matching. Orders will fail if coordinates are `0, 0`.

---

### 8.3 Toggle Store Open/Closed

```
PUT /api/marketplace/vendor/store/status
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{ "is_open": true }
```

---

### 8.4 Store Statistics

```
GET /api/marketplace/vendor/store/statistics
Authorization: Bearer <vendor_token>
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "statistics": {
      "total_orders": 45,
      "average_rating": "4.80",
      "total_ratings": 12,
      "total_revenue": 34000000,
      "month_orders": 15,
      "month_revenue": 12750000,
      "pending_orders": 2
    }
  }
}
```

---

## 9. Vendor Product Management (Auth Required — Approved Vendor)

### 9.1 Create Product

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
  "category_id": "uuid-of-category",
  "images": ["https://supabase-url/..."],
  "stock_quantity": 5
}
```

Response `201`:
```json
{
  "success": true,
  "message": "Product created",
  "data": {
    "product": {
      "id": "uuid",
      "name": "iPhone 13",
      "price": "850000.00",
      "is_active": true,
      "is_available": true,
      "stock_quantity": 5
    }
  }
}
```

---

### 9.2 List Products

```
GET /api/marketplace/vendor/products
Authorization: Bearer <vendor_token>
```

Query params (optional): `category_id=uuid`, `is_active=true`, `limit=20`, `page=1`

---

### 9.3 Update Product

```
PUT /api/marketplace/vendor/products/:product_id
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request (all optional):
```json
{
  "price": 800000,
  "description": "Updated description",
  "stock_quantity": 3
}
```

---

### 9.4 Toggle Availability

```
PUT /api/marketplace/vendor/products/:product_id/availability
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request:
```json
{ "is_available": false }
```

---

### 9.5 Delete Product

```
DELETE /api/marketplace/vendor/products/:product_id
Authorization: Bearer <vendor_token>
```

---

## 10. Vendor Order Management (Auth Required — Approved Vendor)

### 10.1 Get Orders

```
GET /api/marketplace/vendor/orders
Authorization: Bearer <vendor_token>
```

Query params (optional): `status=pending`, `date_from=2026-04-01`, `date_to=2026-04-30`, `limit=20`, `page=1`

Response `200`:
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

Response `200`:
```json
{ "success": true, "message": "Order accepted", "data": null }
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

Response `200`:
```json
{ "success": true, "message": "Order rejected and customer refunded", "data": null }
```

---

### 10.4 Mark Ready for Pickup

After marking ready, the system automatically starts searching for a rider.

```
PUT /api/marketplace/vendor/orders/:order_id/ready
Authorization: Bearer <vendor_token>
```

No request body needed.

Response `200`:
```json
{ "success": true, "message": "Order marked as ready for pickup", "data": null }
```

---

## 11. Vendor Analytics & Earnings (Auth Required — Approved Vendor)

### 11.1 Analytics Dashboard

```
GET /api/marketplace/vendor/analytics/dashboard
Authorization: Bearer <vendor_token>
```

Response `200`:
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

### 11.2 Orders by Date

```
GET /api/marketplace/vendor/analytics/orders
Authorization: Bearer <vendor_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

---

### 11.3 Earnings

```
GET /api/marketplace/vendor/earnings
Authorization: Bearer <vendor_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

Note: Vendor keeps the product subtotal. Olakz keeps the delivery fee.

---

## 12. Rider Endpoints (Auth Required — Driver Account)

Rider endpoints require the authenticated user to have a driver profile in the `drivers` table. If not found, returns `404 Driver profile not found`.

### 12.1 Get Available Orders

```
GET /api/marketplace/rider/available
Authorization: Bearer <driver_token>
```

Response `200`:
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
          "lng": 3.4219
        },
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

---

### 12.2 Accept Order

```
POST /api/marketplace/rider/:order_id/accept
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request (optional):
```json
{ "estimated_arrival_minutes": 15 }
```

Response `200`:
```json
{ "success": true, "message": "Order accepted", "data": null }
```

Error — already taken `400`:
```json
{ "success": false, "message": "Order is no longer available for pickup" }
```

---

### 12.3 Reject Order

```
POST /api/marketplace/rider/:order_id/reject
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request (optional):
```json
{ "reason": "Too far from my location" }
```

---

### 12.4 Cancel After Accepting

```
POST /api/marketplace/rider/:order_id/cancel
Authorization: Bearer <driver_token>
Content-Type: application/json
```

Request:
```json
{ "reason": "Vehicle breakdown" }
```

System re-initiates rider search after cancellation.

---

### 12.5 Get Active Deliveries

```
GET /api/marketplace/rider/active
Authorization: Bearer <driver_token>
```

Returns orders in `rider_accepted`, `shipped`, or `arrived` status.

---

### 12.6 Confirm Pickup from Vendor

Order must be in `rider_accepted` status.

```
POST /api/marketplace/rider/:order_id/picked-up
Authorization: Bearer <driver_token>
```

No request body needed. Transitions order to `shipped`.

---

### 12.7 Arrived at Customer

Order must be in `shipped` status.

```
POST /api/marketplace/rider/:order_id/arrived
Authorization: Bearer <driver_token>
```

No request body needed. Transitions order to `arrived`.

---

### 12.8 Mark Delivered

```
POST /api/marketplace/rider/:order_id/delivered
Authorization: Bearer <driver_token>
```

No request body needed. Transitions order to `delivered`.

---

### 12.9 Update Location

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

Broadcasts live location to customer via Socket.IO.

---

### 12.10 Delivery History

```
GET /api/marketplace/rider/history
Authorization: Bearer <driver_token>
```

Query params (optional): `status=delivered`, `date_from=2026-04-01`, `date_to=2026-04-30`, `limit=20`, `page=1`

---

### 12.11 Rider Earnings

```
GET /api/marketplace/rider/earnings
Authorization: Bearer <driver_token>
```

Query params (optional): `date_from=2026-04-01`, `date_to=2026-04-30`

Response `200`:
```json
{
  "success": true,
  "data": {
    "total_deliveries": 15,
    "total_earned": 6750,
    "earnings": [
      {
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

## 13. Real-time Socket.IO Events

Connect to: `https://olakzride.duckdns.org`

All namespaces require the JWT token in the handshake:
```js
const socket = io('https://olakzride.duckdns.org/marketplace-orders', {
  auth: { token: '<jwt_token>' }
});
```

### Customer namespace `/marketplace-orders`

| Event | When |
|---|---|
| `marketplace:order:status_update` | Any order status change |
| `marketplace:order:rider_location` | Live rider location while in transit |
| `marketplace:order:rider_assigned` | A rider has accepted the order |

### Vendor namespace `/marketplace-vendor`

| Event | When |
|---|---|
| `marketplace:order:delivered` | Order marked delivered |
| `marketplace:order:rider_assigned` | Rider assigned to an order |
| `marketplace:order:rider_dropped` | Rider cancelled after accepting — re-searching |

### Rider namespace `/marketplace-riders`

| Event | When |
|---|---|
| `marketplace:delivery:new_request` | New order available for pickup (broadcast) |
| `marketplace:delivery:request_expired` | Batch round timed out — no action needed |

---

## Order Status Flow

```
pending
  → in_progress       (vendor accepts)
  → ready_for_pickup  (vendor marks packed — auto-triggers rider search)
  → searching_rider   (system searching for rider)
  → rider_accepted    (rider accepts)
  → shipped           (rider picks up from vendor)
  → arrived           (rider arrives at customer)
  → delivered         (rider marks delivered)

OR:
  → cancelled         (customer cancels — allowed from: pending, in_progress, searching_rider)
  → courier_not_found (no rider accepted after 3 × 10 min rounds — auto-refund to customer)
```

---

## Important Notes

- Only `wallet` payment is supported. Card payment is not implemented.
- Store must have `latitude` and `longitude` set (not `0, 0`) for orders to work — delivery fare and rider matching depend on it.
- Vendor must be approved before accessing any vendor endpoints. Unapproved vendors get `403`.
- Rider must exist in the `drivers` table — rider endpoints return `404` if driver profile is not found.
- Cart is per-store. Adding a product from a different store automatically clears the existing cart.
- Reviews can only be submitted on `delivered` orders. One review per order.

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
{ "success": false, "message": "Internal server error" }
```
