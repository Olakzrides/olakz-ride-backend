# OLAKZ Food API Testing Guide

Base URL (via gateway): `http://localhost:3000`
Direct food service: `http://localhost:3005`

All authenticated requests require:
```
Authorization: Bearer <jwt_token>
```

---

## Phase 1 — Core Ordering Flow

### Prerequisites

1. Run migration in Supabase SQL editor: `services/food-service/prisma/migrations/20260316_phase1_food_core/migration.sql`
2. Start food service: `cd services/food-service && npm run dev`
3. Have a valid JWT token from auth-service (customer account)
4. Have a second JWT token for a vendor account
5. Ensure wallet has sufficient balance for order tests

---

## 1. Health Check

```
GET /api/food/health
```

Expected response `200`:
```json
{
  "status": "healthy",
  "service": "food-service",
  "version": "1.0.0",
  "uptime": 12,
  "timestamp": "2026-03-17T10:00:00.000Z"
}
```

---

## 2. Restaurant & Menu Browse (Public — No Auth)

### 2.1 List Restaurants

```
GET /api/food/restaurants
```

Query params (all optional):
```
lat=6.5244
lng=3.3792
radius=10
cuisine_type=Nigerian
is_open=true
rating_min=4.0
limit=20
page=1
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "restaurants": [
      {
        "id": "uuid",
        "name": "Mama's Kitchen",
        "description": "Authentic Nigerian food",
        "cuisine_types": ["Nigerian"],
        "logo_url": null,
        "address": "123 Lagos Street",
        "latitude": "6.5244",
        "longitude": "3.3792",
        "is_open": true,
        "is_verified": true,
        "average_rating": "4.50",
        "total_ratings": 120,
        "estimated_prep_time_minutes": 20
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

---

### 2.2 Get Restaurant Details + Menu

```
GET /api/food/restaurants/:restaurant_id
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Mama's Kitchen",
    "cuisine_types": ["Nigerian"],
    "address": "123 Lagos Street",
    "latitude": "6.5244",
    "longitude": "3.3792",
    "phone": "+2348012345678",
    "is_open": true,
    "average_rating": "4.50",
    "estimated_prep_time_minutes": 20,
    "operating_hours": {
      "monday": { "open": "08:00", "close": "22:00", "is_closed": false }
    },
    "menu_categories": [
      {
        "id": "uuid",
        "name": "Rice Dishes",
        "sort_order": 1,
        "items": [
          {
            "id": "uuid",
            "name": "Jollof Rice",
            "price": "1500.00",
            "is_available": true,
            "images": []
          }
        ]
      }
    ]
  }
}
```

---

### 2.3 Get Full Menu by Category

```
GET /api/food/restaurants/:restaurant_id/menu
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "menu": [
      {
        "id": "uuid",
        "name": "Rice Dishes",
        "items": [
          {
            "id": "uuid",
            "name": "Jollof Rice",
            "description": "Smoky party jollof",
            "price": "1500.00",
            "images": [],
            "is_available": true,
            "tags": ["popular"],
            "item_extras": []
          }
        ]
      }
    ]
  }
}
```

---

### 2.4 Get All Food Categories

```
GET /api/food/categories
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "categories": [
      { "id": "uuid", "name": "Nigerian", "sort_order": 1, "is_active": true },
      { "id": "uuid", "name": "Fast Food", "sort_order": 2, "is_active": true },
      { "id": "uuid", "name": "Chinese", "sort_order": 3, "is_active": true }
    ]
  }
}
```

---

### 2.5 Get Item Details

```
GET /api/food/items/:item_id
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Jollof Rice",
    "description": "Smoky party jollof",
    "price": "1500.00",
    "images": [],
    "is_available": true,
    "preparation_time_minutes": 15,
    "tags": ["popular"],
    "item_extras": [
      {
        "extra": {
          "id": "uuid",
          "name": "Extra Chicken",
          "price": "500.00"
        },
        "is_required": false
      }
    ]
  }
}
```

---

### 2.6 Search Restaurants & Items

```
GET /api/food/search?query=jollof&lat=6.5244&lng=3.3792&limit=10
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "restaurants": [
      {
        "id": "uuid",
        "name": "Mama's Kitchen",
        "cuisine_types": ["Nigerian"],
        "average_rating": "4.50",
        "is_open": true
      }
    ],
    "items": [
      {
        "id": "uuid",
        "name": "Jollof Rice",
        "price": "1500.00",
        "restaurant_id": "uuid",
        "restaurant_name": "Mama's Kitchen"
      }
    ]
  }
}
```

---

## 3. Cart (Requires Auth)

### 3.1 Add Item to Cart

```
POST /api/food/cart/add
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request body:
```json
{
  "item_id": "uuid-of-menu-item",
  "quantity": 2,
  "extras": ["uuid-of-extra-1"],
  "special_instructions": "No pepper please"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "cart_item": {
      "id": "uuid",
      "cart_id": "uuid",
      "item_id": "uuid",
      "quantity": 2,
      "selected_extras": ["uuid-of-extra-1"],
      "special_instructions": "No pepper please",
      "unit_price": "1500.00"
    }
  }
}
```

Note: Adding an item from a different restaurant auto-clears the existing cart.

---

### 3.2 Get Cart

```
GET /api/food/cart
Authorization: Bearer <customer_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "cart": {
      "id": "uuid",
      "user_id": "uuid",
      "restaurant_id": "uuid",
      "restaurant": {
        "id": "uuid",
        "name": "Mama's Kitchen",
        "logo_url": null,
        "estimated_prep_time_minutes": 20
      },
      "items": [
        {
          "id": "uuid",
          "item_id": "uuid",
          "quantity": 2,
          "unit_price": "1500.00",
          "selected_extras": ["uuid"],
          "special_instructions": "No pepper please",
          "item": {
            "id": "uuid",
            "name": "Jollof Rice",
            "price": "1500.00",
            "images": []
          }
        }
      ]
    }
  }
}
```

Empty cart response:
```json
{
  "success": true,
  "data": {
    "cart": null,
    "message": "Cart is empty"
  }
}
```

---

### 3.3 Update Cart Item

```
PUT /api/food/cart/update
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request body:
```json
{
  "cart_item_id": "uuid-of-cart-item",
  "quantity": 3
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Cart updated",
  "data": {
    "cart_item": {
      "id": "uuid",
      "quantity": 3,
      "unit_price": "1500.00"
    }
  }
}
```

---

### 3.4 Remove Item from Cart

```
DELETE /api/food/cart/remove?cart_item_id=uuid-of-cart-item
Authorization: Bearer <customer_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Item removed from cart",
  "data": null
}
```

---

### 3.5 Clear Cart

```
DELETE /api/food/cart
Authorization: Bearer <customer_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Cart cleared",
  "data": null
}
```

---

## 4. Orders

### 4.1 Estimate Order Total (Public)

```
POST /api/food/payment/estimate
Content-Type: application/json
```

Request body:
```json
{
  "restaurant_id": "uuid-of-restaurant",
  "items": [
    {
      "item_id": "uuid-of-item",
      "quantity": 2,
      "extras": ["uuid-of-extra"]
    }
  ],
  "delivery_address": {
    "lat": 6.4281,
    "lng": 3.4219
  }
}
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "subtotal": 3000,
    "delivery_fee": 450,
    "service_fee": 50,
    "rounding_fee": 0,
    "total_amount": 3500,
    "distance_km": 4.5,
    "distance_text": "4.5 km",
    "estimated_delivery_minutes": 18,
    "currency_code": "NGN"
  }
}
```

---

### 4.2 Place Order

```
POST /api/food/order
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request body:
```json
{
  "restaurant_id": "uuid-of-restaurant",
  "items": [
    {
      "item_id": "uuid-of-item",
      "quantity": 2,
      "extras": ["uuid-of-extra"],
      "special_instructions": "Extra spicy"
    }
  ],
  "delivery_address": {
    "address": "45 Admiralty Way, Lekki Phase 1",
    "lat": 6.4281,
    "lng": 3.4219,
    "instructions": "Call on arrival"
  },
  "payment_method": "wallet",
  "special_instructions": "Ring the doorbell"
}
```

Expected response `201`:
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": {
    "order": {
      "id": "uuid",
      "customer_id": "uuid",
      "restaurant_id": "uuid",
      "status": "pending",
      "payment_method": "wallet",
      "payment_status": "paid",
      "subtotal": "3000.00",
      "delivery_fee": "450.00",
      "service_fee": "50.00",
      "rounding_fee": "0.00",
      "total_amount": "3500.00",
      "delivery_address": {
        "address": "45 Admiralty Way, Lekki Phase 1",
        "lat": 6.4281,
        "lng": 3.4219,
        "instructions": "Call on arrival"
      },
      "wallet_balance_before": "10000.00",
      "wallet_balance_after": "6500.00",
      "estimated_prep_time_minutes": 20,
      "created_at": "2026-03-17T10:00:00.000Z",
      "order_items": [
        {
          "item_id": "uuid",
          "item_name": "Jollof Rice",
          "item_price": "1500.00",
          "quantity": 2,
          "selected_extras": [{ "id": "uuid", "name": "Extra Chicken", "price": "500.00" }],
          "subtotal": "4000.00"
        }
      ],
      "fare_breakdown": {
        "subtotal": 3000,
        "delivery_fee": 450,
        "service_fee": 50,
        "rounding_fee": 0,
        "total_amount": 3500,
        "distance_km": 4.5,
        "distance_text": "4.5 km",
        "currency_code": "NGN"
      }
    }
  }
}
```

Error — insufficient balance `400`:
```json
{
  "success": false,
  "message": "Insufficient wallet balance. Required: ₦3500.00, Available: ₦2000.00"
}
```

Error — restaurant closed `400`:
```json
{
  "success": false,
  "message": "Restaurant is currently closed"
}
```

Error — card payment `400`:
```json
{
  "success": false,
  "message": "Card payment not yet implemented"
}
```

---

### 4.3 Get Order Details

```
GET /api/food/orders/:order_id
Authorization: Bearer <customer_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "status": "pending",
      "payment_status": "paid",
      "total_amount": "3500.00",
      "delivery_address": { "address": "45 Admiralty Way", "lat": 6.4281, "lng": 3.4219 },
      "created_at": "2026-03-17T10:00:00.000Z",
      "restaurant": {
        "id": "uuid",
        "name": "Mama's Kitchen",
        "logo_url": null,
        "phone": "+2348012345678",
        "address": "123 Lagos Street"
      },
      "order_items": [
        {
          "id": "uuid",
          "item_name": "Jollof Rice",
          "item_price": "1500.00",
          "quantity": 2,
          "subtotal": "3000.00"
        }
      ]
    }
  }
}
```

---

### 4.4 Order History

```
GET /api/food/orders/history
Authorization: Bearer <customer_token>
```

Query params (all optional):
```
status=pending
limit=10
page=1
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "delivered",
        "payment_status": "paid",
        "total_amount": "3500.00",
        "created_at": "2026-03-17T10:00:00.000Z",
        "restaurant": { "id": "uuid", "name": "Mama's Kitchen", "logo_url": null },
        "order_items": [
          { "id": "uuid", "item_name": "Jollof Rice", "quantity": 2, "item_price": "1500.00" }
        ]
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 4.5 Cancel Order

```
POST /api/food/orders/:order_id/cancel
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request body:
```json
{
  "reason": "Changed my mind"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order cancelled",
  "data": {
    "success": true,
    "message": "Order cancelled and refund processed"
  }
}
```

Error — order already preparing `400`:
```json
{
  "success": false,
  "message": "Cannot cancel order in status: preparing"
}
```

---

## 5. Vendor Order Management (Requires Auth — Vendor Account)

Vendor must have a restaurant registered under their user ID (`owner_id` in `food_restaurants`).

### 5.1 Get Vendor Orders

```
GET /api/vendor/orders
Authorization: Bearer <vendor_token>
```

Query params (all optional):
```
status=pending
date_from=2026-03-01
date_to=2026-03-17
limit=20
page=1
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "customer_id": "uuid",
        "status": "pending",
        "payment_status": "paid",
        "total_amount": "3500.00",
        "delivery_address": { "address": "45 Admiralty Way", "lat": 6.4281, "lng": 3.4219 },
        "special_instructions": "Ring the doorbell",
        "estimated_prep_time_minutes": 20,
        "created_at": "2026-03-17T10:00:00.000Z",
        "order_items": [
          { "item_name": "Jollof Rice", "quantity": 2, "item_price": "1500.00", "subtotal": "3000.00" }
        ]
      }
    ],
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 5.2 Get Single Vendor Order

```
GET /api/vendor/orders/:order_id
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "status": "pending",
      "total_amount": "3500.00",
      "order_items": [
        {
          "item_name": "Jollof Rice",
          "quantity": 2,
          "item_price": "1500.00",
          "selected_extras": [],
          "special_instructions": "Extra spicy",
          "subtotal": "3000.00"
        }
      ]
    }
  }
}
```

---

### 5.3 Accept Order

```
POST /api/vendor/orders/:order_id/accept
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "estimated_preparation_time": 25
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order accepted",
  "data": null
}
```

Error — order not in pending status `400`:
```json
{
  "success": false,
  "message": "Cannot accept order in status: accepted"
}
```

---

### 5.4 Reject Order

```
POST /api/vendor/orders/:order_id/reject
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "rejection_reason": "Out of stock for this item"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order rejected and customer refunded",
  "data": null
}
```

---

### 5.5 Update Order Status

```
PUT /api/vendor/orders/:order_id/status
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Valid status transitions:
- `accepted` → `preparing`
- `preparing` → `ready_for_pickup`

Request body:
```json
{
  "status": "preparing",
  "estimated_preparation_time": 15
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order status updated to preparing",
  "data": null
}
```

Error — invalid transition `400`:
```json
{
  "success": false,
  "message": "Cannot transition order from pending to ready_for_pickup"
}
```

---

### 5.6 Update Preparation Time

```
PUT /api/vendor/orders/:order_id/preparation-time
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "estimated_minutes": 30
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Prep time updated",
  "data": null
}
```

---

## Phase 1 Testing Flow (Recommended Order)

1. `GET /api/food/health` — confirm service is up
2. `GET /api/food/categories` — see seeded categories
3. Insert a test restaurant directly in Supabase (or via admin API in Phase 4)
4. `GET /api/food/restaurants` — confirm restaurant appears
5. Insert test menu items directly in Supabase
6. `GET /api/food/restaurants/:id/menu` — confirm menu loads
7. `POST /api/food/cart/add` — add item (customer token)
8. `GET /api/food/cart` — confirm cart state
9. `POST /api/food/payment/estimate` — check fare calculation
10. `POST /api/food/order` — place order (wallet)
11. `GET /api/vendor/orders` — vendor sees new order (vendor token)
12. `POST /api/vendor/orders/:id/accept` — vendor accepts
13. `GET /api/food/orders/:id` — customer sees status = accepted
14. `PUT /api/vendor/orders/:id/status` — vendor moves to preparing
15. `POST /api/food/orders/:id/cancel` — test cancel on pending order (use a fresh order)

---

## Phase 2 — Real-time & Courier Assignment

### Prerequisites

1. Run migration in Supabase SQL editor: `services/food-service/prisma/migrations/20260317_phase2_realtime_courier/migration.sql`
2. Have a courier account with an approved driver profile in the `drivers` table (same Supabase DB as core-logistics)
3. Courier must have an active vehicle in `driver_vehicles` and be online in `driver_availability`
4. Socket.IO client for testing real-time events (e.g. Postman WebSocket or a simple HTML test client)

---

## 6. Courier — Food Delivery (Requires Auth — Courier/Driver Account)

### 6.1 Get Available Food Deliveries

```
GET /api/food/courier/available
Authorization: Bearer <courier_token>
```

Query params (optional):
```
lat=6.5244
lng=3.3792
radius=15
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "searching_courier",
        "delivery_fee": "450.00",
        "total_amount": "3500.00",
        "delivery_address": { "address": "45 Admiralty Way", "lat": 6.4281, "lng": 3.4219 },
        "created_at": "2026-03-17T10:00:00.000Z",
        "restaurant": {
          "id": "uuid",
          "name": "Mama's Kitchen",
          "address": "123 Lagos Street",
          "latitude": "6.5244",
          "longitude": "3.3792"
        }
      }
    ]
  }
}
```

Note: Orders where this courier is in `excluded_courier_ids` will not appear.

---

### 6.2 Accept Food Delivery

```
POST /api/food/courier/:order_id/accept
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "estimated_arrival_time": 10
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Delivery accepted",
  "data": null
}
```

Error — order already taken `400`:
```json
{
  "success": false,
  "message": "Order is no longer available (status: accepted)"
}
```

Socket events emitted on accept:
- Customer (`/food-orders`): `food:order:courier_assigned` — `{ order_id, courier_id, estimated_arrival_minutes, courier: { rating, vehicle } }`
- Vendor (`/vendor-orders`): `food:order:courier_assigned` — `{ order_id, courier_id, estimated_arrival_minutes }`

---

### 6.3 Reject Food Delivery

```
POST /api/food/courier/:order_id/reject
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "reason": "Too far from my location"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Delivery rejected",
  "data": null
}
```

Note: Rejection is logged only. The 30-second timeout handles re-broadcasting to the next batch.

---

### 6.4 Cancel Delivery After Acceptance (Re-queuing)

```
POST /api/food/courier/:order_id/cancel
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "reason": "Vehicle breakdown"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Delivery cancelled — searching for another courier",
  "data": null
}
```

What happens after cancel:
1. Assignment record updated to `cancelled` with reason
2. Courier added to `excluded_courier_ids` on the order
3. Order status reverts to `searching_courier`
4. Matching service re-runs immediately (excluding this courier)
5. After 3 failed rounds → order status becomes `courier_not_found`

Socket events emitted:
- Customer (`/food-orders`): `food:order:status_update` — `{ order_id, status: "searching_courier", message: "Finding another courier for your order" }`
- Vendor (`/vendor-orders`): `food:order:courier_dropped` — `{ order_id, reason, message: "Courier cancelled — searching for another" }`

---

### 6.5 Get Active Deliveries

```
GET /api/food/courier/active
Authorization: Bearer <courier_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "status": "accepted",
        "delivery_fee": "450.00",
        "total_amount": "3500.00",
        "delivery_address": { "address": "45 Admiralty Way", "lat": 6.4281, "lng": 3.4219 },
        "accepted_at": "2026-03-17T10:05:00.000Z",
        "restaurant": {
          "id": "uuid",
          "name": "Mama's Kitchen",
          "address": "123 Lagos Street",
          "phone": "+2348012345678",
          "latitude": "6.5244",
          "longitude": "3.3792"
        }
      }
    ]
  }
}
```

---

## 7. Vendor Pickup (Requires Auth)

### 7.1 Create Pickup Request (Vendor)

Normally auto-created when vendor marks order `ready_for_pickup`. Can also be created manually.

```
POST /api/vendor-pickup/request
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "order_id": "uuid-of-order",
  "special_instructions": "Fragile items — handle with care"
}
```

Expected response `201`:
```json
{
  "success": true,
  "message": "Pickup request created",
  "data": {
    "pickup": {
      "id": "uuid",
      "order_id": "uuid",
      "vendor_id": "uuid",
      "restaurant_id": "uuid",
      "status": "pending",
      "pickup_code": "847291",
      "special_instructions": "Fragile items — handle with care",
      "created_at": "2026-03-17T10:10:00.000Z"
    }
  }
}
```

Note: `pickup_code` is shown to the vendor and must be given to the courier at pickup.

---

### 7.2 Get Vendor Pickup Requests

```
GET /api/vendor-pickup/vendor/requests
Authorization: Bearer <vendor_token>
```

Query params (optional):
```
status=pending
date_from=2026-03-01
date_to=2026-03-17
limit=20
page=1
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "pickups": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "status": "pending",
        "pickup_code": "847291",
        "created_at": "2026-03-17T10:10:00.000Z",
        "order": {
          "id": "uuid",
          "status": "ready_for_pickup",
          "total_amount": "3500.00",
          "delivery_address": { "address": "45 Admiralty Way" },
          "order_items": [{ "item_name": "Jollof Rice", "quantity": 2 }]
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

---

### 7.3 Get Single Pickup

```
GET /api/vendor-pickup/:pickup_id
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "pickup": {
      "id": "uuid",
      "order_id": "uuid",
      "courier_id": null,
      "status": "pending",
      "pickup_code": "847291",
      "special_instructions": null,
      "courier_arrived_at": null,
      "picked_up_at": null,
      "created_at": "2026-03-17T10:10:00.000Z",
      "order": { "id": "uuid", "status": "ready_for_pickup", "total_amount": "3500.00" }
    }
  }
}
```

---

### 7.4 Mark Pickup Ready (Vendor)

```
PUT /api/vendor-pickup/:pickup_id/ready
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "special_instructions": "Bag is sealed — do not open"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Pickup marked as ready",
  "data": null
}
```

Socket event emitted to courier (`/courier-deliveries`): `food:delivery:ready_for_pickup` — `{ order_id, pickup_id, pickup_code, special_instructions }`

---

### 7.5 Cancel Pickup (Vendor)

```
POST /api/vendor-pickup/:pickup_id/cancel
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "reason": "Order was cancelled by customer"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Pickup cancelled",
  "data": null
}
```

---

### 7.6 Get Available Pickups (Courier)

```
GET /api/vendor-pickup/available
Authorization: Bearer <courier_token>
```

Query params (optional):
```
lat=6.5244
lng=3.3792
radius=15
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "pickups": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "status": "pending",
        "special_instructions": null,
        "created_at": "2026-03-17T10:10:00.000Z",
        "restaurant": {
          "id": "uuid",
          "name": "Mama's Kitchen",
          "address": "123 Lagos Street",
          "latitude": "6.5244",
          "longitude": "3.3792"
        },
        "order": {
          "id": "uuid",
          "delivery_address": { "address": "45 Admiralty Way" },
          "delivery_fee": "450.00"
        }
      }
    ]
  }
}
```

---

### 7.7 Accept Pickup (Courier)

```
POST /api/vendor-pickup/accept
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "pickup_id": "uuid-of-pickup",
  "estimated_arrival_time": 8
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Pickup accepted",
  "data": null
}
```

Socket event emitted to pickup room (`/vendor-pickups`): `vendor_pickup:courier_assigned` — `{ pickup_id, courier_id, estimated_arrival_minutes }`

---

### 7.8 Update Pickup Status (Courier)

Valid transitions: `courier_assigned` → `courier_arrived` → `picked_up`

```
PUT /api/vendor-pickup/:pickup_id/status
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "status": "courier_arrived",
  "notes": "Waiting at the entrance"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Pickup status updated to courier_arrived",
  "data": null
}
```

Socket events emitted to pickup room:
- On `courier_arrived`: `vendor_pickup:courier_arrived`
- On `picked_up`: `vendor_pickup:package_picked_up`

Error — invalid transition `400`:
```json
{
  "success": false,
  "message": "Cannot transition pickup from pending to courier_arrived"
}
```

---

### 7.9 Verify Pickup Code (Courier)

Courier enters the 6-digit code given by the vendor. On success, pickup auto-advances to `picked_up`.

```
POST /api/vendor-pickup/:pickup_id/verify-code
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "pickup_code": "847291"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Pickup code verified",
  "data": { "verified": true }
}
```

Error — wrong code `400`:
```json
{
  "success": false,
  "message": "Invalid pickup code"
}
```

---

### 7.10 Update Courier Location During Pickup

```
POST /api/vendor-pickup/:pickup_id/location
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "lat": 6.5244,
  "lng": 3.3792
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Location updated",
  "data": null
}
```

Socket event emitted to pickup room: `vendor_pickup:courier_location` — `{ pickup_id, lat, lng, updated_at }`

---

## Phase 2 Socket Events Reference

Connect to food-service directly: `http://localhost:3005`

All namespaces require auth token in handshake:
```js
const socket = io('http://localhost:3005/food-orders', {
  auth: { token: '<jwt_token>' }
});
```

### Customer namespace `/food-orders`

| Event | When |
|---|---|
| `food:order:new_request` | Order placed confirmation |
| `food:order:status_update` | Any status change |
| `food:order:courier_assigned` | Courier accepted the order |
| `food:order:courier_location` | Live courier location update |

### Vendor namespace `/vendor-orders`

| Event | When |
|---|---|
| `food:order:new_request` | New order placed |
| `food:order:cancelled` | Customer cancelled |
| `food:order:courier_assigned` | Courier assigned |
| `food:order:courier_dropped` | Courier cancelled after accepting |

### Courier namespace `/courier-deliveries`

| Event | When |
|---|---|
| `food:delivery:new_request` | New food delivery available (broadcast) |
| `food:delivery:request_expired` | 30s timeout — no response needed |
| `food:delivery:accepted_by_another` | Another courier took it |
| `food:delivery:ready_for_pickup` | Vendor marked order ready |

### Vendor-Courier namespace `/vendor-pickups`

| Event | When |
|---|---|
| `vendor_pickup:courier_assigned` | Courier accepted pickup |
| `vendor_pickup:courier_arrived` | Courier arrived at vendor |
| `vendor_pickup:package_picked_up` | Package collected |
| `vendor_pickup:courier_location` | Live courier location |

---

## Phase 2 Testing Flow (Recommended Order)

1. Run Phase 2 migration in Supabase SQL editor
2. Connect courier socket to `/courier-deliveries` with courier JWT
3. Connect customer socket to `/food-orders` with customer JWT
4. Connect vendor socket to `/vendor-orders` with vendor JWT
5. `POST /api/food/order` — customer places order
6. Vendor receives `food:order:new_request` socket event
7. `POST /api/vendor/orders/:id/accept` — vendor accepts → courier search starts
8. Courier receives `food:delivery:new_request` socket event
9. `GET /api/food/courier/available` — courier sees the order
10. `POST /api/food/courier/:id/accept` — courier accepts
11. Customer receives `food:order:courier_assigned` socket event
12. `PUT /api/vendor/orders/:id/status` — vendor moves to `ready_for_pickup`
13. Pickup record auto-created, courier receives `food:delivery:ready_for_pickup`
14. `GET /api/vendor-pickup/vendor/requests` — vendor sees pickup
15. `POST /api/vendor-pickup/accept` — courier accepts pickup
16. `PUT /api/vendor-pickup/:id/status` body `{ "status": "courier_arrived" }`
17. `POST /api/vendor-pickup/:id/verify-code` — courier enters pickup code
18. Test re-queuing: accept an order, then `POST /api/food/courier/:id/cancel`
19. Verify customer gets `searching_courier` socket event, vendor gets `courier_dropped`

---

## Phase 3 — Delivery Execution, Ratings & History

### Prerequisites

1. Run migration in Supabase SQL editor: `services/food-service/prisma/migrations/20260318_phase3_delivery_execution/migration.sql`
2. Have an active order in `accepted` or `ready_for_pickup` status with a courier assigned
3. Customer's `delivery_code` is returned in the order details response

---

## 8. Courier Delivery Execution (Requires Auth — Courier Account)

Full flow: `accepted` → `arrived_vendor` → verify pickup code → `picked_up` → `arrived_delivery` → verify delivery code → `delivered`

### 8.1 Arrived at Restaurant

```
POST /api/food/courier/:order_id/arrived-vendor
Authorization: Bearer <courier_token>
```

No request body needed.

Expected response `200`:
```json
{
  "success": true,
  "message": "Arrived at restaurant",
  "data": null
}
```

Socket event emitted to customer (`/food-orders`): `food:order:status_update` — `{ order_id, status: "arrived_vendor", message: "Courier has arrived at the restaurant" }`

---

### 8.2 Verify Pickup Code (Vendor gives code to courier)

```
POST /api/food/courier/:order_id/verify-pickup
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "pickup_code": "847291"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Pickup code verified",
  "data": { "verified": true }
}
```

Error — wrong code `400`:
```json
{
  "success": false,
  "message": "Invalid pickup code"
}
```

---

### 8.3 Confirm Picked Up

```
POST /api/food/courier/:order_id/picked-up
Authorization: Bearer <courier_token>
Content-Type: multipart/form-data
```

Request body (photo optional):
```
photo: <image file>   (optional — jpeg/png/webp, max 5MB)
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order picked up",
  "data": null
}
```

Socket event emitted to customer: `food:order:status_update` — `{ order_id, status: "picked_up", message: "Courier has picked up your order and is on the way" }`

---

### 8.4 Update Real-time Location

Call this repeatedly while courier is en route.

```
POST /api/food/courier/location
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "order_id": "uuid-of-order",
  "lat": 6.5100,
  "lng": 3.3600,
  "heading": 180,
  "speed": 30
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Location updated",
  "data": null
}
```

Socket event emitted to customer: `food:order:courier_location` — `{ order_id, lat, lng, heading, updated_at }`

---

### 8.5 Arrived at Delivery Address

```
POST /api/food/courier/:order_id/arrived-delivery
Authorization: Bearer <courier_token>
```

No request body needed.

Expected response `200`:
```json
{
  "success": true,
  "message": "Arrived at delivery address",
  "data": null
}
```

Push notification sent to customer: "Your courier is at your location."

---

### 8.6 Verify Delivery Code (Customer shows code to courier)

The `delivery_code` is a 4-digit code visible to the customer in their order details.

```
POST /api/food/courier/:order_id/verify-delivery
Authorization: Bearer <courier_token>
Content-Type: application/json
```

Request body:
```json
{
  "delivery_code": "4821"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Delivery code verified",
  "data": { "verified": true }
}
```

Error — wrong code `400`:
```json
{
  "success": false,
  "message": "Invalid delivery code"
}
```

---

### 8.7 Mark Delivered

```
POST /api/food/courier/:order_id/delivered
Authorization: Bearer <courier_token>
Content-Type: multipart/form-data
```

Request body (photo optional):
```
photo: <image file>   (optional)
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order delivered successfully",
  "data": null
}
```

What happens on delivery:
- Order status → `delivered`
- Courier earnings record created in `food_courier_earnings`
- Customer receives push notification + socket event
- Vendor receives socket event

---

### 8.8 Upload Photo (standalone)

```
POST /api/food/courier/:order_id/upload-photo
Authorization: Bearer <courier_token>
Content-Type: multipart/form-data
```

Request body:
```
photo: <image file>
photo_type: pickup   (or "delivery")
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Photo uploaded",
  "data": { "url": "https://supabase-signed-url..." }
}
```

---

## 9. Ratings (Requires Auth — Customer Account)

### 9.1 Rate Order

Can only rate after order status is `delivered`. One rating per order.

```
POST /api/food/orders/:order_id/rate
Authorization: Bearer <customer_token>
Content-Type: application/json
```

Request body:
```json
{
  "restaurant_rating": 5,
  "delivery_rating": 4,
  "comment": "Food was great, delivery was a bit slow"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Rating submitted",
  "data": null
}
```

Error — order not delivered `400`:
```json
{
  "success": false,
  "message": "Can only rate delivered orders"
}
```

Error — already rated `400`:
```json
{
  "success": false,
  "message": "Order already rated"
}
```

---

## 10. Courier History & Earnings (Requires Auth — Courier Account)

### 10.1 Delivery History

```
GET /api/food/courier/history
Authorization: Bearer <courier_token>
```

Query params (optional):
```
status=delivered
date_from=2026-03-01
date_to=2026-03-31
limit=20
page=1
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "status": "delivered",
        "delivery_fee": "450.00",
        "total_amount": "3500.00",
        "delivery_address": { "address": "45 Admiralty Way" },
        "created_at": "2026-03-17T10:00:00.000Z",
        "picked_up_at": "2026-03-17T10:25:00.000Z",
        "delivered_at": "2026-03-17T10:45:00.000Z",
        "restaurant": { "id": "uuid", "name": "Mama's Kitchen", "address": "123 Lagos Street" }
      }
    ],
    "total": 12,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### 10.2 Earnings Report

```
GET /api/food/courier/earnings
Authorization: Bearer <courier_token>
```

Query params (optional):
```
date_from=2026-03-01
date_to=2026-03-31
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "earnings": [
      {
        "id": "uuid",
        "order_id": "uuid",
        "delivery_fee": "450.00",
        "tip_amount": "0.00",
        "total_earned": "450.00",
        "status": "pending",
        "earned_at": "2026-03-17T10:45:00.000Z"
      }
    ],
    "summary": {
      "total_earned": "5400.00",
      "total_deliveries": 12,
      "pending_payout": "5400.00",
      "currency": "NGN"
    }
  }
}
```

---

## Phase 3 Testing Flow (Recommended Order)

1. Run Phase 3 migration in Supabase SQL editor
2. Place an order and have vendor accept it (Phase 1 flow)
3. Have courier accept the delivery (Phase 2 flow) — note the `delivery_code` from order details
4. `POST /api/food/courier/:id/arrived-vendor` — courier arrives at restaurant
5. `POST /api/vendor-pickup/:id/ready` — vendor marks order ready (get `pickup_code` from response)
6. `POST /api/food/courier/:id/verify-pickup` — courier enters `pickup_code`
7. `POST /api/food/courier/:id/picked-up` — courier confirms pickup (optionally with photo)
8. `POST /api/food/courier/location` — send a few location updates, verify customer socket receives `food:order:courier_location`
9. `POST /api/food/courier/:id/arrived-delivery` — courier arrives at customer
10. `POST /api/food/courier/:id/verify-delivery` — courier enters `delivery_code` from customer
11. `POST /api/food/courier/:id/delivered` — mark delivered (optionally with photo)
12. `GET /api/food/orders/:id` — customer sees status = `delivered`
13. `POST /api/food/orders/:id/rate` — customer rates the order
14. `GET /api/food/courier/earnings` — courier sees earnings record
15. `GET /api/food/courier/history` — courier sees delivery in history

---

## Common Error Responses

`401 Unauthorized` — missing or invalid token:
```json
{ "success": false, "message": "Unauthorized" }
```

`404 Not Found`:
```json
{ "success": false, "message": "Restaurant not found" }
```

`400 Bad Request`:
```json
{ "success": false, "message": "restaurant_id is required" }
```

`500 Internal Server Error`:
```json
{ "success": false, "message": "Internal server error" }
```


---

## Phase 4 — Vendor Management, Admin & Analytics

### Prerequisites

1. Run migrations in Supabase SQL editor (in order):
   - `services/platform-service/prisma/migrations/20260318_create_vendors_table/migration.sql`
   - `services/food-service/prisma/migrations/20260318_phase4_vendor_link/migration.sql`
2. Start platform-service: `cd services/platform-service && npm run dev`
3. Have a valid JWT token for a vendor account (any user can register as a vendor)
4. Have a valid JWT token for an admin account (role must include `admin` or `super_admin`)
5. Vendor must be approved before accessing `/api/vendor/profile`, menu, or store endpoints

---

## 11. Vendor Onboarding (platform-service — port 3004)

### 11.1 Submit Vendor Registration

```
POST /api/vendor/register
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "business_name": "Mama's Kitchen",
  "business_type": "restaurant",
  "email": "mama@kitchen.com",
  "phone": "+2348012345678",
  "gender": "female",
  "city": "Lagos",
  "state": "Lagos",
  "address": "123 Broad Street, Lagos Island",
  "service_type": "food_delivery"
}
```

Valid `business_type` values: `restaurant`, `marketplace`, `carwash`, `mechanics`

Expected response `201`:
```json
{
  "success": true,
  "message": "Registration submitted successfully",
  "data": {
    "vendor": {
      "id": "uuid",
      "user_id": "uuid",
      "business_name": "Mama's Kitchen",
      "business_type": "restaurant",
      "email": "mama@kitchen.com",
      "phone": "+2348012345678",
      "verification_status": "pending",
      "created_at": "2026-03-18T10:00:00.000Z"
    }
  }
}
```

Error — already registered `400`:
```json
{
  "success": false,
  "message": "Registration already submitted and pending review"
}
```

---

### 11.2 Get Signed Upload URL (for documents/images)

```
GET /api/vendor/register/upload-url?file_type=logo&file_name=logo.jpg
Authorization: Bearer <vendor_token>
```

Valid `file_type` values: `logo`, `profile_picture`, `nin`, `cac_document`, `store_image`

Expected response `200`:
```json
{
  "success": true,
  "message": "Upload URL generated",
  "data": {
    "signed_url": "https://supabase-storage-url/vendor-documents/...",
    "file_type": "logo",
    "file_name": "logo.jpg"
  }
}
```

Frontend flow: Use `signed_url` to PUT the file directly to Supabase storage, then save the resulting URL via 11.3.

---

### 11.3 Submit Document URLs

```
PUT /api/vendor/register/documents
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all fields optional — submit whichever you have):
```json
{
  "logo_url": "https://supabase-url/vendor-documents/uuid/logo/file.jpg",
  "profile_picture_url": "https://supabase-url/vendor-documents/uuid/profile_picture/file.jpg",
  "nin_number": "12345678901",
  "cac_document_url": "https://supabase-url/vendor-documents/uuid/cac_document/file.pdf",
  "store_images": [
    "https://supabase-url/vendor-documents/uuid/store_image/img1.jpg",
    "https://supabase-url/vendor-documents/uuid/store_image/img2.jpg"
  ]
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Documents submitted successfully",
  "data": {
    "vendor": {
      "id": "uuid",
      "verification_status": "pending",
      "logo_url": "https://...",
      "nin_number": "12345678901"
    }
  }
}
```

---

### 11.4 Check Registration Status

```
GET /api/vendor/register/status
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Status retrieved",
  "data": {
    "status": {
      "id": "uuid",
      "verification_status": "pending",
      "rejection_reason": null,
      "business_name": "Mama's Kitchen",
      "business_type": "restaurant",
      "has_documents": true,
      "created_at": "2026-03-18T10:00:00.000Z",
      "updated_at": "2026-03-18T10:05:00.000Z"
    }
  }
}
```

Possible `verification_status` values: `pending`, `approved`, `rejected`

---

## 12. Admin — Vendor Registration Management (platform-service)

### 12.1 List All Vendors (Admin)

```
GET /api/vendor/admin/vendors
Authorization: Bearer <admin_token>
```

Query params (optional):
```
status=pending
business_type=restaurant
page=1
limit=20
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Vendors retrieved",
  "data": {
    "vendors": [
      {
        "id": "uuid",
        "user_id": "uuid",
        "business_name": "Mama's Kitchen",
        "business_type": "restaurant",
        "email": "mama@kitchen.com",
        "phone": "+2348012345678",
        "verification_status": "pending",
        "has_documents": true,
        "created_at": "2026-03-18T10:00:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20
  }
}
```

---

### 12.2 Approve Vendor (Admin)

```
PUT /api/vendor/admin/vendors/:vendor_id/approve
Authorization: Bearer <admin_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Vendor approved",
  "data": {
    "vendor": {
      "id": "uuid",
      "verification_status": "approved",
      "approved_at": "2026-03-18T11:00:00.000Z"
    }
  }
}
```

After approval, vendor can access all `/api/vendor/profile`, `/api/vendor/store-*`, and menu endpoints.

---

### 12.3 Reject Vendor (Admin)

```
PUT /api/vendor/admin/vendors/:vendor_id/reject
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Request body:
```json
{
  "reason": "CAC document is expired. Please resubmit with a valid document."
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Vendor rejected",
  "data": {
    "vendor": {
      "id": "uuid",
      "verification_status": "rejected",
      "rejection_reason": "CAC document is expired. Please resubmit with a valid document."
    }
  }
}
```

After rejection, vendor can re-submit via `POST /api/vendor/register` (resets to pending).

---

## 13. Vendor Profile & Store Management (food-service — requires approved vendor)

All endpoints below require:
- `Authorization: Bearer <vendor_token>`
- Vendor must be approved in platform-service (otherwise returns `403`)

### 13.1 Get Vendor Profile

```
GET /api/vendor/profile
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "uuid",
      "name": "Mama's Kitchen",
      "description": "Authentic Nigerian food",
      "cuisine_types": ["Nigerian"],
      "logo_url": null,
      "banner_url": null,
      "phone": "+2348012345678",
      "email": "mama@kitchen.com",
      "address": "123 Broad Street",
      "city": "Lagos",
      "state": "Lagos",
      "latitude": "6.5244",
      "longitude": "3.3792",
      "is_verified": true,
      "average_rating": "4.50",
      "total_ratings": 120,
      "total_orders": 350
    }
  }
}
```

---

### 13.2 Update Vendor Profile

```
PUT /api/vendor/profile
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all fields optional):
```json
{
  "name": "Mama's Kitchen Updated",
  "description": "Best Nigerian food in Lagos",
  "cuisine_types": ["Nigerian", "Continental"],
  "logo_url": "https://supabase-url/food-photos/...",
  "banner_url": "https://supabase-url/food-photos/...",
  "phone": "+2348012345678",
  "email": "mama@kitchen.com",
  "address": "456 Victoria Island",
  "city": "Lagos",
  "state": "Lagos"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Profile updated",
  "data": { "profile": { "id": "uuid", "name": "Mama's Kitchen Updated" } }
}
```

---

### 13.3 Get Store Details

```
GET /api/vendor/store-details
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "store_details": {
      "id": "uuid",
      "is_active": true,
      "is_open": false,
      "auto_accept_orders": false,
      "estimated_prep_time_minutes": 20,
      "operating_hours": {}
    }
  }
}
```

---

### 13.4 Update Store Details

```
PUT /api/vendor/store-details
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all fields optional):
```json
{
  "is_active": true,
  "is_open": true,
  "auto_accept_orders": false,
  "estimated_prep_time_minutes": 25
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Store details updated",
  "data": { "store_details": { "id": "uuid", "is_open": true } }
}
```

---

### 13.5 Get Store Operations

```
GET /api/vendor/store-operations
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "store_operations": {
      "id": "uuid",
      "operating_hours": {
        "monday": { "open": "08:00", "close": "22:00", "is_closed": false },
        "tuesday": { "open": "08:00", "close": "22:00", "is_closed": false },
        "sunday": { "open": "10:00", "close": "20:00", "is_closed": false }
      },
      "auto_accept_orders": false,
      "estimated_prep_time_minutes": 20,
      "is_open": true
    }
  }
}
```

---

### 13.6 Update Store Operations

```
PUT /api/vendor/store-operations
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all fields optional):
```json
{
  "operating_hours": {
    "monday": { "open": "08:00", "close": "22:00", "is_closed": false },
    "sunday": { "open": "10:00", "close": "20:00", "is_closed": false }
  },
  "auto_accept_orders": true,
  "estimated_prep_time_minutes": 15,
  "is_open": true
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Store operations updated",
  "data": { "store_operations": { "id": "uuid", "auto_accept_orders": true } }
}
```

---

### 13.7 Get Vendor Statistics

```
GET /api/vendor/statistics
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "statistics": {
      "total_orders": 350,
      "average_rating": "4.50",
      "total_ratings": 120,
      "total_revenue": 875000.00,
      "month_orders": 42,
      "month_revenue": 105000.00
    }
  }
}
```

---

## 14. Menu Management (food-service — requires approved vendor)

### 14.1 List Menu Categories

```
GET /api/vendor/categories
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "uuid",
        "restaurant_id": "uuid",
        "name": "Rice Dishes",
        "description": "All rice-based meals",
        "image_url": null,
        "is_active": true,
        "sort_order": 1,
        "created_at": "2026-03-18T10:00:00.000Z"
      }
    ]
  }
}
```

---

### 14.2 Create Menu Category

```
POST /api/vendor/categories
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "name": "Rice Dishes",
  "description": "All rice-based meals",
  "image_url": "https://supabase-url/...",
  "sort_order": 1
}
```

Expected response `201`:
```json
{
  "success": true,
  "message": "Category created",
  "data": {
    "category": {
      "id": "uuid",
      "name": "Rice Dishes",
      "sort_order": 1,
      "is_active": true
    }
  }
}
```

---

### 14.3 Update Menu Category

```
PUT /api/vendor/categories/:category_id
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all optional):
```json
{
  "name": "Rice & Pasta",
  "is_active": true,
  "sort_order": 2
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Category updated",
  "data": { "category": { "id": "uuid", "name": "Rice & Pasta" } }
}
```

---

### 14.4 Delete Menu Category

```
DELETE /api/vendor/categories/:category_id
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Category deleted",
  "data": null
}
```

---

### 14.5 List Products

```
GET /api/vendor/products
Authorization: Bearer <vendor_token>
```

Query params (optional):
```
category_id=uuid
is_active=true
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "uuid",
        "name": "Jollof Rice",
        "description": "Smoky party jollof",
        "price": "1500.00",
        "category_id": "uuid",
        "images": [],
        "is_active": true,
        "is_available": true,
        "tags": ["popular"],
        "category": { "id": "uuid", "name": "Rice Dishes" }
      }
    ]
  }
}
```

---

### 14.6 Create Product

```
POST /api/vendor/products
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "name": "Jollof Rice",
  "description": "Smoky party jollof with chicken",
  "price": 1500,
  "category_id": "uuid-of-category",
  "images": ["https://supabase-url/food-photos/..."],
  "is_available": true,
  "preparation_time_minutes": 15,
  "tags": ["popular", "bestseller"]
}
```

Expected response `201`:
```json
{
  "success": true,
  "message": "Product created",
  "data": {
    "product": {
      "id": "uuid",
      "name": "Jollof Rice",
      "price": "1500.00",
      "is_active": true,
      "is_available": true
    }
  }
}
```

---

### 14.7 Update Product

```
PUT /api/vendor/products/:product_id
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all optional):
```json
{
  "name": "Jollof Rice Special",
  "price": 1800,
  "is_active": true,
  "tags": ["popular", "new"]
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Product updated",
  "data": { "product": { "id": "uuid", "name": "Jollof Rice Special", "price": "1800.00" } }
}
```

---

### 14.8 Delete Product

```
DELETE /api/vendor/products/:product_id
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Product deleted",
  "data": null
}
```

---

### 14.9 Toggle Product Availability

```
PUT /api/vendor/products/:product_id/availability
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "is_available": false
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Availability updated",
  "data": { "product": { "id": "uuid", "is_available": false } }
}
```

---

### 14.10 List Extras

```
GET /api/vendor/extras
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "extras": [
      {
        "id": "uuid",
        "name": "Extra Chicken",
        "description": "Add an extra piece of chicken",
        "price": "500.00",
        "is_active": true
      }
    ]
  }
}
```

---

### 14.11 Create Extra

```
POST /api/vendor/extras
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body:
```json
{
  "name": "Extra Chicken",
  "description": "Add an extra piece of chicken",
  "price": 500,
  "image_url": "https://supabase-url/..."
}
```

Expected response `201`:
```json
{
  "success": true,
  "message": "Extra created",
  "data": { "extra": { "id": "uuid", "name": "Extra Chicken", "price": "500.00" } }
}
```

---

### 14.12 Update Extra

```
PUT /api/vendor/extras/:extra_id
Authorization: Bearer <vendor_token>
Content-Type: application/json
```

Request body (all optional):
```json
{
  "name": "Extra Chicken Leg",
  "price": 600,
  "is_active": true
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Extra updated",
  "data": { "extra": { "id": "uuid", "name": "Extra Chicken Leg", "price": "600.00" } }
}
```

---

### 14.13 Delete Extra

```
DELETE /api/vendor/extras/:extra_id
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Extra deleted",
  "data": null
}
```

---

## 15. Analytics (food-service)

### 15.1 Vendor Dashboard

```
GET /api/analytics/vendor/dashboard
Authorization: Bearer <vendor_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "restaurant_id": "uuid",
    "restaurant_name": "Mama's Kitchen",
    "average_rating": "4.50",
    "total_ratings": 120,
    "today": {
      "orders": 8,
      "revenue": 24000.00
    },
    "this_month": {
      "orders": 42,
      "revenue": 105000.00,
      "completed": 38,
      "cancelled": 4
    },
    "last_month": {
      "orders": 35,
      "revenue": 87500.00
    },
    "pending_orders": 2
  }
}
```

---

### 15.2 Courier Earnings (Analytics)

Courier sees their own earnings. Admin can pass `?courier_id=` to see any courier.

```
GET /api/analytics/courier/earnings
Authorization: Bearer <courier_token>
```

Query params (optional):
```
from=2026-03-01
to=2026-03-31
courier_id=uuid   (admin only)
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "courier_id": "uuid",
    "total_orders": 12,
    "total_earnings": 5400.00,
    "orders": [
      {
        "order_id": "uuid",
        "delivery_fee": "450.00",
        "created_at": "2026-03-17T10:45:00.000Z"
      }
    ]
  }
}
```

---

### 15.3 Order Trends (Admin only)

```
GET /api/analytics/orders/trends
Authorization: Bearer <admin_token>
```

Query params (optional):
```
from=2026-03-01
to=2026-03-31
restaurant_id=uuid
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "total_orders": 350,
    "total_revenue": 875000.00,
    "by_date": [
      { "date": "2026-03-01", "orders": 12, "revenue": 30000.00 },
      { "date": "2026-03-02", "orders": 15, "revenue": 37500.00 }
    ]
  }
}
```

---

### 15.4 Customer Behavior (Admin only)

```
GET /api/analytics/customer/behavior
Authorization: Bearer <admin_token>
```

Query params (optional):
```
from=2026-03-01
to=2026-03-31
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "total_customers": 85,
    "avg_orders_per_customer": 4.12,
    "avg_spend_per_customer": 10294.12,
    "payment_methods": {
      "wallet": 280,
      "card": 60,
      "cash": 10
    }
  }
}
```

---

## 16. Admin — Food Service Management

All admin endpoints require `Authorization: Bearer <admin_token>` (role: `admin` or `super_admin`).

### 16.1 Get All Orders (Admin)

```
GET /api/food/admin/orders
Authorization: Bearer <admin_token>
```

Query params (optional):
```
status=pending
restaurant_id=uuid
from=2026-03-01
to=2026-03-31
page=1
limit=20
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "customer_id": "uuid",
        "status": "pending",
        "payment_status": "paid",
        "total_amount": "3500.00",
        "created_at": "2026-03-18T10:00:00.000Z",
        "restaurant": { "id": "uuid", "name": "Mama's Kitchen" },
        "order_items": [{ "item_name": "Jollof Rice", "quantity": 2 }]
      }
    ],
    "total": 350,
    "page": 1,
    "limit": 20
  }
}
```

---

### 16.2 Override Order Status (Admin)

```
PUT /api/food/admin/orders/:order_id/status
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Request body:
```json
{
  "status": "cancelled"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Order status updated",
  "data": { "order": { "id": "uuid", "status": "cancelled" } }
}
```

---

### 16.3 Get All Vendors (Admin)

```
GET /api/food/admin/vendors
Authorization: Bearer <admin_token>
```

Query params (optional):
```
is_verified=true
is_active=true
page=1
limit=20
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "vendors": [
      {
        "id": "uuid",
        "owner_id": "uuid",
        "name": "Mama's Kitchen",
        "city": "Lagos",
        "state": "Lagos",
        "is_active": true,
        "is_verified": true,
        "average_rating": "4.50",
        "total_orders": 350,
        "created_at": "2026-03-18T10:00:00.000Z"
      }
    ],
    "total": 12,
    "page": 1,
    "limit": 20
  }
}
```

---

### 16.4 Approve Vendor (Admin — food-service)

Marks the restaurant as verified and active in food-service.

```
PUT /api/food/admin/vendors/:restaurant_id/approve
Authorization: Bearer <admin_token>
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Vendor approved",
  "data": { "vendor": { "id": "uuid", "is_verified": true, "is_active": true } }
}
```

Note: For full vendor onboarding approval (platform-wide), use `PUT /api/vendor/admin/vendors/:id/approve` (section 12.2).

---

### 16.5 Suspend Vendor (Admin)

```
PUT /api/food/admin/vendors/:restaurant_id/suspend
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Request body (optional):
```json
{
  "reason": "Multiple customer complaints"
}
```

Expected response `200`:
```json
{
  "success": true,
  "message": "Vendor suspended",
  "data": { "vendor": { "id": "uuid", "is_active": false } }
}
```

---

### 16.6 Get All Couriers (Admin)

```
GET /api/food/admin/couriers
Authorization: Bearer <admin_token>
```

Query params (optional):
```
page=1
limit=20
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "couriers": [
      {
        "courier_id": "uuid",
        "total_deliveries": 45,
        "total_earnings": "20250.00"
      }
    ],
    "total": 8,
    "page": 1,
    "limit": 20
  }
}
```

---

### 16.7 Platform Analytics (Admin)

```
GET /api/food/admin/analytics
Authorization: Bearer <admin_token>
```

Expected response `200`:
```json
{
  "success": true,
  "data": {
    "total_orders": 1250,
    "total_restaurants": 18,
    "active_restaurants": 14,
    "this_month": {
      "orders": 350,
      "revenue": 875000.00,
      "completed": 310,
      "cancelled": 40
    }
  }
}
```

---

## Phase 4 Testing Flow (Recommended Order)

1. Run both Phase 4 migrations in Supabase SQL editor
2. Start platform-service: `npm run dev` (port 3004)
3. **Vendor onboarding:**
   - `POST /api/vendor/register` — submit registration (vendor token)
   - `GET /api/vendor/register/upload-url?file_type=logo&file_name=logo.jpg` — get upload URL
   - Upload file directly to Supabase using the signed URL
   - `PUT /api/vendor/register/documents` — submit document URLs
   - `GET /api/vendor/register/status` — confirm status is `pending`
4. **Admin approves:**
   - `GET /api/vendor/admin/vendors?status=pending` — admin sees pending vendors
   - `PUT /api/vendor/admin/vendors/:id/approve` — admin approves
5. **Vendor sets up store (now approved):**
   - `GET /api/vendor/profile` — confirm 403 before approval, 200 after
   - `PUT /api/vendor/profile` — update business info
   - `PUT /api/vendor/store-details` — set `is_open: true`
   - `PUT /api/vendor/store-operations` — set operating hours
6. **Vendor builds menu:**
   - `POST /api/vendor/categories` — create a category
   - `POST /api/vendor/products` — create products under that category
   - `POST /api/vendor/extras` — create add-ons
   - `PUT /api/vendor/products/:id/availability` — toggle availability
7. **Analytics:**
   - `GET /api/analytics/vendor/dashboard` — vendor sees their stats
   - `GET /api/analytics/courier/earnings` — courier sees earnings
   - `GET /api/analytics/orders/trends` — admin sees trends (admin token)
   - `GET /api/analytics/customer/behavior` — admin sees behavior (admin token)
8. **Admin food management:**
   - `GET /api/food/admin/orders` — see all orders
   - `GET /api/food/admin/vendors` — see all restaurants
   - `PUT /api/food/admin/vendors/:id/suspend` — test suspend
   - `GET /api/food/admin/analytics` — platform-wide stats
9. **Rejected vendor re-registration:**
   - `PUT /api/vendor/admin/vendors/:id/reject` with a reason
   - `GET /api/vendor/register/status` — vendor sees `rejected` + reason
   - `POST /api/vendor/register` — vendor re-submits (resets to pending)
