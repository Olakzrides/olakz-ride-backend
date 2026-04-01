# Olakz Marketplace — Implementation Guide

## Overview

A new standalone service `services/marketplace-service` (port 3006) handles all marketplace functionality.
It shares the same Supabase database as other services but owns its own tables prefixed with `marketplace_`.

Gateway base URL: `http://localhost:3000/api/marketplace`
Direct service URL: `http://localhost:3006`

---

## Order Status Flow

```
pending → in_progress → ready_for_pickup → searching_rider → shipped → arrived → delivered
                      ↘ cancelled (vendor reject)
pending/in_progress → cancelled (customer cancel or order expiry)
searching_rider → courier_not_found (no rider after 3 rounds × 10 min)
```

| Status | Triggered By | Meaning |
|---|---|---|
| `pending` | System (order placed) | Awaiting vendor acceptance |
| `in_progress` | Vendor (accept order) | Vendor packing the order |
| `ready_for_pickup` | Vendor (mark packed) | Packed, waiting for Olakz rider |
| `searching_rider` | System (auto after ready) | Matching a rider |
| `shipped` | Rider (confirm pickup from vendor) | Rider has the package, en route |
| `arrived` | Rider (mark arrived at customer) | Rider at customer door |
| `delivered` | Rider (mark delivered) | Order complete |
| `cancelled` | Customer / Vendor / System | Order cancelled with refund |
| `courier_not_found` | System | No rider found after 30 min, auto-refund |

---

## Service Architecture

```
services/marketplace-service/
  src/
    app.ts
    server.ts
    config/
      index.ts
      database.ts
    middleware/
      auth.middleware.ts        — JWT validation (same pattern as food-service)
      vendor.middleware.ts      — isVendorApproved check via platform-service
      admin.middleware.ts       — admin role check
      error.middleware.ts
    controllers/
      store.controller.ts
      product.controller.ts
      cart.controller.ts
      order.controller.ts
      vendor-store.controller.ts
      vendor-order.controller.ts
      rider.controller.ts
      address.controller.ts
      review.controller.ts
      admin.controller.ts
    services/
      store.service.ts
      product.service.ts
      cart.service.ts
      order.service.ts
      vendor-store.service.ts
      vendor-order.service.ts
      marketplace-matching.service.ts
      rider-delivery.service.ts
      wallet.service.ts           — calls core-logistics internal API
      notification.service.ts     — calls core-logistics internal API
      fare.service.ts
      review.service.ts
      analytics.service.ts
    routes/
      public.routes.ts
      customer.routes.ts
      vendor.routes.ts
      rider.routes.ts
      admin.routes.ts
      internal.routes.ts
    utils/
      response.ts
      logger.ts
      maps.ts
  prisma/
    schema.prisma
    migrations/
  package.json
  tsconfig.json
  nodemon.json
  .env
  .env.template
```

---

## Integration Points

| Dependency | Method |
|---|---|
| JWT auth | Same RS256 JWT from auth-service |
| Wallet deduct/credit | `POST /api/internal/wallet/deduct` on core-logistics |
| Push notifications | `POST /api/internal/notifications/send` on core-logistics |
| Driver pool | Shared Supabase tables: `drivers`, `driver_availability`, `driver_location_tracking` |
| Vendor approval check | `GET /api/internal/vendor/status/:userId` on platform-service |
| Vendor provisioning | Called from platform-service on approval |
| Gateway | Add `/api/marketplace` route with 60s timeout |

Internal API key: `olakz-internal-api-key-2026-secure`

---

---

# Phase 1 — Core Marketplace: Stores, Products, Cart & Orders

**Goal:** Customer can browse stores and products, add to cart, place an order, vendor can manage their store and accept/reject/pack orders. No delivery yet.

---

## 1.1 Service Bootstrap

- Initialize TypeScript project in `services/marketplace-service/`
- Copy structure from food-service (package.json, tsconfig.json, nodemon.json)
- Set up Prisma with Supabase DATABASE_URL
- Create `.env` and `.env.template`
- Register in root `package.json` workspaces
- Add to gateway: route `/api/marketplace/*` → `http://localhost:3006` with 60s timeout

---

## 1.2 Database Migration (Phase 1)

Run in Supabase SQL editor: `services/marketplace-service/prisma/migrations/phase1_core/migration.sql`

### Tables to create:

**marketplace_categories**
```
id uuid PK
name varchar(100)
description text nullable
icon_url text nullable
is_active boolean default true
sort_order int default 0
created_at timestamptz
updated_at timestamptz
```

**marketplace_stores**
```
id uuid PK
owner_id uuid UNIQUE          — links to auth user (vendor)
vendor_id uuid nullable        — links to platform vendors table
name varchar(200)
description text nullable
logo_url text nullable
banner_url text nullable
address text
city varchar(100) nullable
state varchar(100) nullable
latitude decimal(10,8)
longitude decimal(11,8)
phone varchar(20) nullable
email varchar(255) nullable
is_active boolean default true
is_open boolean default false
is_verified boolean default false
average_rating decimal(3,2) default 0.00
total_ratings int default 0
total_orders int default 0
operating_hours jsonb default '{}'
created_at timestamptz
updated_at timestamptz
```

**marketplace_store_categories** (many-to-many: store ↔ category)
```
store_id uuid FK → marketplace_stores
category_id uuid FK → marketplace_categories
PRIMARY KEY (store_id, category_id)
```

**marketplace_products**
```
id uuid PK
store_id uuid FK → marketplace_stores
category_id uuid nullable FK → marketplace_categories
name varchar(200)
description text nullable
price decimal(10,2)
images text[] default '{}'
is_active boolean default true
is_available boolean default true
stock_quantity int nullable
average_rating decimal(3,2) default 0.00
total_ratings int default 0
created_at timestamptz
updated_at timestamptz
```

**marketplace_carts**
```
id uuid PK
user_id uuid
store_id uuid FK → marketplace_stores
created_at timestamptz
updated_at timestamptz
UNIQUE(user_id, store_id)
```

**marketplace_cart_items**
```
id uuid PK
cart_id uuid FK → marketplace_carts CASCADE
product_id uuid FK → marketplace_products
quantity int default 1
unit_price decimal(10,2)
created_at timestamptz
updated_at timestamptz
```

**marketplace_saved_addresses**
```
id uuid PK
user_id uuid
label varchar(50)             — e.g. "Home", "Office", "Recipient's Address"
address text
city varchar(100) nullable
state varchar(100) nullable
latitude decimal(10,8) nullable
longitude decimal(11,8) nullable
is_default boolean default false
created_at timestamptz
updated_at timestamptz
```

**marketplace_fare_config**
```
id uuid PK
vehicle_type varchar(50) UNIQUE
price_per_km decimal(10,2)
minimum_delivery_fee decimal(10,2)
service_fee decimal(10,2) default 0
currency_code varchar(10) default 'NGN'
is_active boolean default true
created_at timestamptz
updated_at timestamptz
```

**marketplace_orders**
```
id uuid PK
customer_id uuid
store_id uuid FK → marketplace_stores
rider_id uuid nullable
status varchar(50) default 'pending'
payment_method varchar(20) default 'wallet'
payment_status varchar(20) default 'pending'
subtotal decimal(10,2)
delivery_fee decimal(10,2) default 0
service_fee decimal(10,2) default 0
total_amount decimal(10,2)
delivery_address jsonb              — {address, lat, lng, label}
special_instructions text nullable
wallet_transaction_id text nullable
wallet_balance_before decimal(10,2) nullable
wallet_balance_after decimal(10,2) nullable
cancellation_reason text nullable
cancelled_by varchar(20) nullable
rejection_reason text nullable
excluded_rider_ids uuid[] default '{}'
rider_search_attempts int default 0
accepted_at timestamptz nullable
ready_at timestamptz nullable
shipped_at timestamptz nullable
arrived_at timestamptz nullable
delivered_at timestamptz nullable
cancelled_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
```

**marketplace_order_items**
```
id uuid PK
order_id uuid FK → marketplace_orders CASCADE
product_id uuid
product_name varchar(200)
product_price decimal(10,2)
quantity int default 1
subtotal decimal(10,2)
```

**marketplace_order_status_history**
```
id uuid PK
order_id uuid FK → marketplace_orders CASCADE
status varchar(50)
previous_status varchar(50) nullable
changed_by uuid nullable
changed_by_role varchar(20) nullable
notes text nullable
created_at timestamptz
```

---

## 1.3 Public Endpoints (No Auth)

```
GET  /api/marketplace/health
GET  /api/marketplace/categories
GET  /api/marketplace/stores
     Query: lat, lng, radius, category_id, is_open, rating_min, limit, page
GET  /api/marketplace/stores/:id
     Returns: store info + categories + featured products (first 8 per category)
GET  /api/marketplace/stores/:id/products
     Query: category_id, limit, page
GET  /api/marketplace/products/:id
GET  /api/marketplace/search
     Query: query, lat, lng, limit
     Returns: { stores: [], products: [] }
```

---

## 1.4 Customer Cart Endpoints (Auth Required)

```
POST   /api/marketplace/cart/add
       Body: { product_id, quantity }
       Note: Adding from a different store clears existing cart first

GET    /api/marketplace/cart
       Returns: cart with items, store info, subtotal

PUT    /api/marketplace/cart/update
       Body: { cart_item_id, quantity }

DELETE /api/marketplace/cart/remove?cart_item_id=uuid

DELETE /api/marketplace/cart
```

---

## 1.5 Customer Order Endpoints (Auth Required)

```
POST /api/marketplace/payment/estimate
     Body: { store_id, items: [{product_id, quantity}], delivery_address: {lat, lng} }
     Returns: { subtotal, delivery_fee, service_fee, total_amount, distance_km }

POST /api/marketplace/orders
     Body: { store_id, items: [{product_id, quantity, special_instructions}],
             delivery_address: {address, lat, lng, label}, payment_method: "wallet",
             special_instructions }
     - Validates items not empty
     - Validates store is open and active
     - Validates store has valid lat/lng
     - Deducts wallet immediately
     - Sets 10-minute pending expiry timer (auto-cancel + refund if vendor doesn't accept)
     - Clears customer cart for this store
     - Notifies vendor via socket

GET  /api/marketplace/orders
     Query: status, limit, page
     Returns: order history

GET  /api/marketplace/orders/:id
     Returns: full order detail + status history

POST /api/marketplace/orders/:id/cancel
     Body: { reason }
     Allowed from: pending, in_progress only
     Auto-refunds wallet
```

---

## 1.6 Customer Saved Addresses (Auth Required)

```
GET    /api/marketplace/addresses
POST   /api/marketplace/addresses
       Body: { label, address, city, state, latitude, longitude, is_default }
PUT    /api/marketplace/addresses/:id
DELETE /api/marketplace/addresses/:id
```

---

## 1.7 Vendor Store Management (Auth + Approved Vendor)

Vendor approval check: calls platform-service to verify `business_type: "marketplace"` and `verification_status: "approved"`.

```
GET /api/marketplace/vendor/store
    Returns: store profile

PUT /api/marketplace/vendor/store
    Body: { name, description, logo_url, banner_url, address, city, state,
            latitude, longitude, phone, email, operating_hours, category_ids }
    Note: latitude and longitude are REQUIRED for delivery fare calculation

PUT /api/marketplace/vendor/store/status
    Body: { is_open }
    Toggle store open/closed

GET /api/marketplace/vendor/store/statistics
    Returns: total_orders, total_revenue, month_orders, month_revenue, average_rating
```

---

## 1.8 Vendor Product Management (Auth + Approved Vendor)

```
GET    /api/marketplace/vendor/products
       Query: category_id, is_active, limit, page

POST   /api/marketplace/vendor/products
       Body: { name, description, price, category_id, images[], stock_quantity }

PUT    /api/marketplace/vendor/products/:id
       Body: any product fields

DELETE /api/marketplace/vendor/products/:id

PUT    /api/marketplace/vendor/products/:id/availability
       Body: { is_available }
```

---

## 1.9 Vendor Order Management (Auth + Approved Vendor)

```
GET  /api/marketplace/vendor/orders
     Query: status, date_from, date_to, limit, page

GET  /api/marketplace/vendor/orders/:id

POST /api/marketplace/vendor/orders/:id/accept
     Body: { estimated_prep_time_minutes }
     Transitions: pending → in_progress
     Notifies customer via socket + push

POST /api/marketplace/vendor/orders/:id/reject
     Body: { rejection_reason }
     Transitions: pending → cancelled
     Auto-refunds customer wallet
     Notifies customer via socket + push

PUT  /api/marketplace/vendor/orders/:id/ready
     Transitions: in_progress → ready_for_pickup
     Auto-triggers rider search (marketplace-matching.service.ts)
     Notifies customer via socket + push
```

---

## 1.10 Vendor Onboarding Hook (Internal)

Called by platform-service when a marketplace vendor is approved.

```
POST /api/internal/marketplace/vendor/provision
     Headers: x-internal-api-key: olakz-internal-api-key-2026-secure
     Body: { owner_id, vendor_id, business_name, address, latitude, longitude,
             phone, email, city, state, logo_url }
     Creates marketplace_stores record (idempotent)
```

Also update `platform-service/src/services/vendor-registration.service.ts` to call this endpoint on approval when `business_type === "marketplace"`.

---

## 1.11 Payment Rules

- Wallet payment only in Phase 1
- Deduct full amount at order placement
- Auto-refund on: vendor rejection, customer cancellation, order expiry (10 min pending timeout)
- Track `wallet_balance_before` and `wallet_balance_after` on every order
- Use `payment_status: 'paid'` → `'refunded'` pattern

---

## Phase 1 Testing Flow

1. Run Phase 1 migration in Supabase SQL editor
2. Start marketplace-service: `cd services/marketplace-service && npm run dev`
3. Register a vendor via platform-service with `business_type: "marketplace"`
4. Admin approves vendor → `marketplace_stores` record auto-created
5. `GET /api/marketplace/categories` — confirm categories
6. `GET /api/marketplace/stores` — confirm store appears
7. Vendor creates products via `POST /api/marketplace/vendor/products`
8. `GET /api/marketplace/stores/:id/products` — confirm products load
9. Customer adds to cart: `POST /api/marketplace/cart/add`
10. `GET /api/marketplace/cart` — confirm cart state
11. `POST /api/marketplace/payment/estimate` — check fare
12. `POST /api/marketplace/orders` — place order (wallet)
13. `GET /api/marketplace/vendor/orders` — vendor sees new order
14. `POST /api/marketplace/vendor/orders/:id/accept` — vendor accepts
15. `GET /api/marketplace/orders/:id` — customer sees status = in_progress
16. `PUT /api/marketplace/vendor/orders/:id/ready` — vendor marks packed
17. `GET /api/marketplace/orders/:id` — customer sees status = ready_for_pickup
18. Test 10-min expiry: place order, wait, confirm auto-cancel + refund
19. Test vendor reject: place order, vendor rejects, confirm refund

---

---

# Phase 2 — Rider Matching, Delivery & Real-time Tracking

**Goal:** Olakz rider is dispatched when vendor marks order ready. Rider picks up from vendor, delivers to customer. Customer can track order in real time.

---

## 2.1 Database Migration (Phase 2)

Run: `services/marketplace-service/prisma/migrations/phase2_delivery/migration.sql`

**marketplace_rider_assignments**
```
id uuid PK
order_id uuid FK → marketplace_orders
rider_id uuid
status varchar(50) default 'assigned'   — assigned | cancelled
cancelled_at timestamptz nullable
cancellation_reason text nullable
created_at timestamptz
```

**marketplace_rider_locations**
```
id uuid PK
order_id uuid FK → marketplace_orders
rider_id uuid
latitude decimal(10,8)
longitude decimal(11,8)
heading decimal(5,2) nullable
speed decimal(6,2) nullable
created_at timestamptz
```

**marketplace_rider_earnings**
```
id uuid PK
rider_id uuid
order_id uuid FK → marketplace_orders
delivery_fee decimal(10,2)
total_earned decimal(10,2)
status varchar(20) default 'pending'
created_at timestamptz
```

---

## 2.2 Rider Matching Service (marketplace-matching.service.ts)

Same multi-round pattern as food-service `FoodMatchingService`. Triggered when vendor marks `ready_for_pickup`.

**Constants:**
```
MAX_RIDERS_PER_BATCH = 5
REQUEST_TIMEOUT_MS = 10 * 60 * 1000   (10 minutes per round)
MAX_SEARCH_ROUNDS = 3                  (30 minutes total)
MAX_SEARCH_RADIUS_KM = 15
```

**Flow:**
1. `startRiderSearch(orderId)` — sets status to `searching_rider`, calls `runSearchRound(orderId, round 1)`
2. `runSearchRound` — status guard first (bail if not `searching_rider`), find available drivers, broadcast via socket, set 10-min timeout
3. Timeout fires → re-check status → if still `searching_rider` → run next round
4. Round 4 → `handleRiderNotFound` → status: `courier_not_found`, auto-refund wallet
5. Rider accepts → status: `searching_rider` → `shipped` (no intermediate — rider goes straight to pickup)

**Finding available riders:**
- Query shared `drivers` table (same DB as core-logistics)
- Filter: `status = 'approved'`, `is_online = true`, `is_available = true`, `last_seen_at` within 5 minutes
- Sort by distance from store, then rating
- Exclude `excluded_rider_ids` from order

---

## 2.3 Rider Endpoints (Auth Required — Driver Account)

```
GET  /api/marketplace/rider/available
     Returns: orders in searching_rider state near rider
     Query: lat, lng, radius

POST /api/marketplace/rider/:id/accept
     Body: { estimated_arrival_minutes }
     Transitions: searching_rider → shipped (rider is now responsible for pickup)
     Generates pickup assignment record
     Notifies customer + vendor via socket

POST /api/marketplace/rider/:id/reject
     Body: { reason }
     Logged only — timeout handles re-queue

POST /api/marketplace/rider/:id/cancel
     Body: { reason }
     Allowed from: shipped, arrived
     Adds rider to excluded_rider_ids
     Reverts to searching_rider
     Re-runs matching immediately
     Notifies customer + vendor

GET  /api/marketplace/rider/active
     Returns: orders in shipped, arrived status for this rider

POST /api/marketplace/rider/:id/picked-up
     Rider confirms pickup from vendor
     Transitions: (after accept) → shipped
     Notifies customer: "Your order has been picked up and is on the way"
     Push notification to customer

POST /api/marketplace/rider/:id/arrived
     Rider marks arrived at customer address
     Transitions: shipped → arrived
     Notifies customer: "Your rider is at your location"
     Push notification to customer

POST /api/marketplace/rider/:id/delivered
     Rider marks delivered
     Transitions: arrived → delivered
     Records rider earnings in marketplace_rider_earnings
     Notifies customer + vendor via socket
     Push notification to customer

POST /api/marketplace/rider/location
     Body: { order_id, lat, lng, heading, speed }
     Persists to marketplace_rider_locations
     Forwards to customer via socket
```

---

## 2.4 Real-time Socket Namespaces

Connect to marketplace-service directly: `http://localhost:3006`

All namespaces require auth token in handshake:
```js
const socket = io('http://localhost:3006/marketplace-orders', {
  auth: { token: '<jwt_token>' }
});
```

**Customer namespace `/marketplace-orders`**

| Event | When |
|---|---|
| `marketplace:order:status_update` | Any status change |
| `marketplace:order:rider_assigned` | Rider accepted the order |
| `marketplace:order:rider_location` | Live rider location update |

**Vendor namespace `/marketplace-vendor`**

| Event | When |
|---|---|
| `marketplace:order:new_request` | New order placed |
| `marketplace:order:cancelled` | Order cancelled |
| `marketplace:order:rider_assigned` | Rider assigned to their order |
| `marketplace:order:rider_dropped` | Rider cancelled after accepting |
| `marketplace:order:delivered` | Order delivered |

**Rider namespace `/marketplace-riders`**

| Event | When |
|---|---|
| `marketplace:delivery:new_request` | New marketplace pickup available (broadcast) |
| `marketplace:delivery:request_expired` | 10-min round timeout |

---

## 2.5 Order Tracking Endpoint

```
GET /api/marketplace/orders/:id/tracking
    Returns:
    {
      order_id,
      status,
      status_history: [{ status, timestamp }],
      rider: { id, name, phone, vehicle, rating } nullable,
      rider_location: { lat, lng, updated_at } nullable,
      estimated_delivery_minutes: nullable
    }
```

---

## 2.6 E-Receipt Endpoint

```
GET /api/marketplace/orders/:id/receipt
    Returns:
    {
      order_id,           — displayed as "OLK" + short ID
      date,
      items: [{ name, quantity, price }],
      subtotal,
      delivery_fee,
      service_fee,
      total_amount,
      payment_method,
      delivery_address
    }
```

---

## 2.7 Gateway Update

Add marketplace-service to gateway routes with 60s timeout for order and rider endpoints.

---

## Phase 2 Testing Flow

1. Run Phase 2 migration in Supabase SQL editor
2. Complete a Phase 1 order up to `ready_for_pickup`
3. Confirm rider search starts automatically (check logs)
4. Connect rider socket to `/marketplace-riders`
5. `GET /api/marketplace/rider/available` — rider sees the order
6. `POST /api/marketplace/rider/:id/accept` — rider accepts
7. Customer receives `marketplace:order:rider_assigned` socket event
8. `POST /api/marketplace/rider/:id/picked-up` — rider picks up from vendor
9. Customer receives status update: `shipped`
10. `POST /api/marketplace/rider/location` — send location updates, verify customer socket receives `marketplace:order:rider_location`
11. `POST /api/marketplace/rider/:id/arrived` — rider at customer door
12. Customer receives push notification
13. `POST /api/marketplace/rider/:id/delivered` — mark delivered
14. `GET /api/marketplace/orders/:id` — customer sees status = `delivered`
15. `GET /api/marketplace/orders/:id/tracking` — confirm full status timeline
16. `GET /api/marketplace/orders/:id/receipt` — confirm receipt data
17. Test re-queue: rider accepts, then cancels → confirm order goes back to `searching_rider`
18. Test `courier_not_found`: exhaust all 3 rounds → confirm auto-refund

---

---

# Phase 3 — Reviews, Wishlist, Analytics & Admin

**Goal:** Complete the marketplace with product/store reviews, customer wishlist, vendor analytics dashboard, and admin management endpoints.

---

## 3.1 Database Migration (Phase 3)

Run: `services/marketplace-service/prisma/migrations/phase3_reviews_analytics/migration.sql`

**marketplace_reviews**
```
id uuid PK
order_id uuid UNIQUE FK → marketplace_orders
customer_id uuid
store_id uuid FK → marketplace_stores
store_rating int CHECK (1-5)
comment text nullable
created_at timestamptz
updated_at timestamptz
```

**marketplace_product_reviews**
```
id uuid PK
review_id uuid FK → marketplace_reviews CASCADE
product_id uuid FK → marketplace_products
product_rating int CHECK (1-5)
```

**marketplace_wishlist**
```
id uuid PK
user_id uuid
product_id uuid FK → marketplace_products
created_at timestamptz
UNIQUE(user_id, product_id)
```

---

## 3.2 Reviews & Ratings

```
POST /api/marketplace/orders/:id/review
     Auth: customer
     Body: { store_rating (1-5), comment, product_ratings: [{product_id, rating}] }
     Rules:
       - Order must be in delivered status
       - One review per order (unique constraint)
       - Updates average_rating and total_ratings on marketplace_stores
       - Updates average_rating and total_ratings on each reviewed marketplace_products

GET  /api/marketplace/stores/:id/reviews
     Public
     Query: limit, page
     Returns: paginated reviews with customer name (first name only), rating, comment, date

GET  /api/marketplace/products/:id/reviews
     Public
     Query: limit, page
     Returns: paginated product reviews
```

---

## 3.3 Wishlist

```
POST   /api/marketplace/wishlist
       Auth: customer
       Body: { product_id }
       Idempotent — no error if already wishlisted

DELETE /api/marketplace/wishlist/:product_id
       Auth: customer

GET    /api/marketplace/wishlist
       Auth: customer
       Returns: wishlisted products with store info
```

---

## 3.4 Similar Products

```
GET /api/marketplace/products/:id/similar
    Public
    Returns: up to 8 products from the same store in the same category
    Excludes the current product
```

---

## 3.5 Vendor Analytics

```
GET /api/marketplace/vendor/analytics/dashboard
    Auth: vendor
    Returns:
    {
      store_name,
      average_rating,
      total_ratings,
      today: { orders, revenue },
      this_month: { orders, revenue, completed, cancelled },
      last_month: { orders, revenue },
      pending_orders
    }

GET /api/marketplace/vendor/analytics/orders
    Auth: vendor
    Query: date_from, date_to
    Returns: order count and revenue by date

GET /api/marketplace/vendor/earnings
    Auth: vendor
    Query: date_from, date_to
    Returns: earnings summary (note: vendor earnings = subtotal, Olakz keeps delivery fee)
```

---

## 3.6 Admin Endpoints

All require `Authorization: Bearer <admin_token>` with role `admin` or `super_admin`.

```
GET  /api/marketplace/admin/stores
     Query: status, category_id, page, limit
     Returns: all stores with vendor info

GET  /api/marketplace/admin/orders
     Query: status, store_id, date_from, date_to, page, limit
     Returns: all orders across all stores

PUT  /api/marketplace/admin/stores/:id/status
     Body: { is_active }
     Activate or deactivate a store

GET  /api/marketplace/admin/analytics
     Query: date_from, date_to
     Returns:
     {
       total_orders,
       total_revenue,
       total_stores,
       active_stores,
       by_date: [{ date, orders, revenue }]
     }
```

---

## 3.7 Rider History & Earnings (Rider Endpoints)

```
GET /api/marketplace/rider/history
    Auth: rider
    Query: status, date_from, date_to, limit, page
    Returns: completed marketplace deliveries

GET /api/marketplace/rider/earnings
    Auth: rider
    Query: date_from, date_to
    Returns: earnings summary from marketplace_rider_earnings
```

---

## Phase 3 Testing Flow

1. Run Phase 3 migration in Supabase SQL editor
2. Complete a full Phase 2 order through to `delivered`
3. `POST /api/marketplace/orders/:id/review` — customer submits review
4. `GET /api/marketplace/stores/:id/reviews` — confirm review appears publicly
5. `GET /api/marketplace/products/:id/reviews` — confirm product rating updated
6. `POST /api/marketplace/wishlist` — add product to wishlist
7. `GET /api/marketplace/wishlist` — confirm wishlist
8. `DELETE /api/marketplace/wishlist/:product_id` — remove from wishlist
9. `GET /api/marketplace/products/:id/similar` — confirm similar products
10. `GET /api/marketplace/vendor/analytics/dashboard` — vendor sees stats
11. `GET /api/marketplace/vendor/earnings` — vendor sees earnings
12. `GET /api/marketplace/admin/stores` — admin sees all stores
13. `GET /api/marketplace/admin/orders` — admin sees all orders
14. `PUT /api/marketplace/admin/stores/:id/status` — admin deactivates a store
15. `GET /api/marketplace/admin/analytics` — admin sees platform-wide stats

---

## Notes for Implementation

**Vendor onboarding reminder:**
- Vendor registers via `POST /api/vendor/register` on platform-service with `business_type: "marketplace"`
- Admin approves via `PUT /api/vendor/admin/vendors/:id/approve` on platform-service
- platform-service calls `POST /api/internal/marketplace/vendor/provision` on marketplace-service
- marketplace_stores record is created automatically

**Rider is the same driver pool:**
- Riders are the same `drivers` table used by core-logistics and food-service
- No separate rider registration needed
- The same driver can do rides, food deliveries, and marketplace deliveries

**Single-vendor cart:**
- Adding a product from a different store clears the existing cart
- Return a warning in the response: `{ cart_cleared: true, previous_store: "Store Name" }`

**Pending order expiry:**
- 10-minute setTimeout after order creation
- If still `pending` when timer fires → auto-cancel + refund + socket notification to customer

**Coordinates validation:**
- Reject orders if store `latitude = 0` or `longitude = 0`
- Error: `"Store location is not configured. Please contact support."`

**Rider search guard:**
- First line of `runSearchRound` checks current order status
- If not `searching_rider` → bail out silently (prevents stale chains corrupting active deliveries)
