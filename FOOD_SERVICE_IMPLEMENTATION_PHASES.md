# Food Service — Implementation Phase Guide

## Architecture Overview

- New service: `services/food-service/`
- Port: `3005`
- Database: Supabase (same instance, new tables)
- Auth: JWT (same pattern as `core-logistics`)
- Wallet: Internal API calls to `core-logistics` (`/api/wallet/internal/*`)
- Push notifications: Internal API calls to `core-logistics`
- Location/Maps: Internal API calls to `core-logistics` (`/api/locations/*`) OR direct Google Maps SDK
- Courier pool: Shared with `core-logistics` (same `drivers` table)
- Socket: New Socket.IO server on food-service with 4 namespaces

## Route Prefix Summary

| Audience | Prefix | Example |
|---|---|---|
| Customer | `/api/food/*` | `/api/food/restaurants` |
| Vendor | `/api/vendor/*` | `/api/vendor/orders` |
| Courier (food) | `/api/food/courier/*` | `/api/food/courier/available` |
| Vendor-Courier handoff | `/api/vendor-pickup/*` | `/api/vendor-pickup/:id/ready` |
| Admin | `/api/food/admin/*` | `/api/food/admin/orders` |

## WebSocket Namespaces

| Namespace | Audience |
|---|---|
| `/food-orders` | Customer — order status updates |
| `/vendor-orders` | Vendor — new orders, cancellations |
| `/courier-deliveries` | Courier — new delivery requests, status |
| `/vendor-pickups` | Vendor + Courier — pickup coordination |

---

## Phase 1 — Core Ordering Flow

**Goal:** Customer can browse restaurants, add to cart, place an order (wallet payment), vendor receives and manages it.

**No real-time sockets yet. No courier assignment yet. Polling-based status for now.**

### 1.1 Database Schema (Migration)

Tables to create:
- `food_restaurants` — vendor/restaurant profiles
- `food_categories` — food categories (e.g. Burgers, Pizza)
- `food_menu_categories` — restaurant-specific menu sections
- `food_menu_items` — individual products with price, description, images
- `food_item_extras` — add-ons/extras linked to menu items
- `food_carts` — one active cart per user per restaurant
- `food_cart_items` — items in a cart with quantity and selected extras
- `food_orders` — the main order record
- `food_order_items` — snapshot of items at time of order
- `food_order_status_history` — audit trail of status changes

Key fields on `food_orders`:
- `id`, `customer_id`, `restaurant_id`, `courier_id` (nullable)
- `status`: `pending` → `accepted` → `preparing` → `ready_for_pickup` → `picked_up` → `delivered` | `cancelled` | `rejected`
- `payment_method`: `wallet` | `card` | `cash` 
- `payment_status`: `pending` | `paid` | `refunded`
- `subtotal`, `delivery_fee`, `service_fee`, `total_amount`
- `delivery_address` (JSONB), `special_instructions`
- `estimated_prep_time`, `estimated_delivery_time`
- `wallet_balance_before`, `wallet_balance_after`
- `wallet_transaction_id`

### 1.2 Service Bootstrap

Files to create:
```
services/food-service/
  package.json
  tsconfig.json
  nodemon.json
  .env.template
  prisma/
    schema.prisma
    migrations/
      20260316_phase1_food_core/migration.sql
  src/
    app.ts
    server.ts
    config/
      index.ts
    middleware/
      auth.middleware.ts
      error.middleware.ts
    utils/
      logger.ts
      response.ts
      database.ts
```

### 1.3 Customer APIs — Phase 1

```
GET  /api/food/restaurants              — list restaurants (lat, lng, radius, cuisine_type, is_open)
GET  /api/food/restaurants/:id          — restaurant details + menu
GET  /api/food/restaurants/:id/menu     — full menu by category
GET  /api/food/categories               — all food categories
GET  /api/food/items/:id                — item details with extras
GET  /api/food/search                   — search restaurants + items (query, lat, lng)
```

```
POST   /api/food/cart/add               — add item to cart { item_id, quantity, extras[], special_instructions }
PUT    /api/food/cart/update            — update cart item { cart_item_id, quantity }
DELETE /api/food/cart/remove            — remove item { cart_item_id }
GET    /api/food/cart                   — get current cart
DELETE /api/food/cart                   — clear cart
```

```
POST /api/food/payment/estimate         — estimate total { restaurant_id, items[], delivery_address }
POST /api/food/order                    — place order { restaurant_id, items[], delivery_address, payment_method, special_instructions }
GET  /api/food/orders/history           — order history (status, limit, page)
GET  /api/food/orders/:id               — order details
POST /api/food/orders/:id/cancel        — cancel order { reason }
```

### 1.4 Vendor APIs — Phase 1

```
GET  /api/vendor/orders                 — list orders (status, date_from, date_to, limit, page)
GET  /api/vendor/orders/:id             — order details
POST /api/vendor/orders/:id/accept      — accept order { estimated_preparation_time }
POST /api/vendor/orders/:id/reject      — reject order { rejection_reason }
PUT  /api/vendor/orders/:id/status      — update status { status, estimated_preparation_time }
PUT  /api/vendor/orders/:id/preparation-time — update prep time { estimated_minutes }
```

### 1.5 Payment Flow (Phase 1)

- Wallet only (card throws "not yet implemented")
- On `POST /api/food/order`:
  1. Validate cart items still available
  2. Calculate total (subtotal + delivery_fee + service_fee)
  3. Check wallet balance via `core-logistics` internal API
  4. Deduct wallet via `core-logistics` internal API
  5. Create order record with `payment_status: paid`
  6. Notify vendor (push notification — Phase 2 adds socket)
  7. Return order details

- On `POST /api/food/orders/:id/cancel`:
  1. Only cancellable if status is `pending` or `accepted`
  2. Refund wallet via `core-logistics` internal credit API
  3. Update order `payment_status: refunded`

### 1.6 Gateway Registration (Phase 1)

Add to `gateway/src/config/index.ts`:
```
FOOD_SERVICE_URL: http://localhost:3005
```

Add to `gateway/src/routes/index.ts`:
```
/api/food/*     → food-service (60s timeout)
/api/vendor/*   → food-service (60s timeout)
```

### Phase 1 Deliverables

- [ ] DB migration created and applied
- [ ] food-service bootstrapped and running on port 3005
- [ ] All 6 restaurant/menu browse endpoints working
- [ ] All 5 cart endpoints working
- [ ] Order placement with wallet payment working
- [ ] Vendor can accept/reject/update orders
- [ ] Order cancellation with wallet refund working
- [ ] Gateway routing configured
- [ ] Phase 1 tested end-to-end in Postman

---

## Phase 2 — Real-time & Courier Assignment

**Goal:** Add WebSocket events, courier matching for food orders, live location tracking, push notifications.

### 2.1 Socket.IO Setup

New `FoodSocketService` in food-service with 4 namespaces:
- `/food-orders` — customer subscribes by order ID
- `/vendor-orders` — vendor subscribes by restaurant ID
- `/courier-deliveries` — courier subscribes by courier ID
- `/vendor-pickups` — vendor + courier subscribe by pickup ID

All namespaces use JWT auth middleware (same pattern as `core-logistics`).

### 2.2 Food Order Matching Service

**Initial matching — triggered when vendor accepts order:**
1. Find available couriers near restaurant (query `driver_availability` + `driver_location_tracking` in `core-logistics` DB — same Supabase instance)
2. Filter by vehicle type eligibility (motorcycle, car, bicycle)
3. Broadcast `food:delivery:new_request` to top N couriers via socket
4. 30-second timeout per courier — if no response, try next batch
5. On courier accept → assign to order, emit `food:order:courier_assigned` to customer + vendor

**Re-queuing — triggered when an assigned courier cancels/drops off:**

This handles the scenario where a courier accepts but later cancels (e.g. vendor is taking too long, courier changes mind, emergency).

Flow:
1. Courier calls `POST /api/food/courier/:id/cancel` after already accepting
2. System records the cancellation on `food_delivery_assignments` (status: `cancelled`, reason logged)
3. Order `courier_id` is cleared, status reverts to `searching_courier`
4. Cancelled courier is added to `excluded_courier_ids[]` on the order — they will NOT receive this order again
5. Customer is notified via socket: `food:order:status_update` with status `searching_courier` and message "Finding another courier for your order"
6. Vendor is notified via socket: `food:order:courier_dropped` with reason
7. Matching service re-runs immediately with excluded couriers filtered out
8. If re-match succeeds → new courier assigned, customer + vendor notified as normal
9. If no couriers available after N retries (configurable, default 3 full broadcast rounds):
   - Order status → `courier_not_found`
   - Customer notified: option to wait or cancel with full refund
   - Admin alerted via push notification

**New API endpoint for courier cancellation after acceptance:**
```
POST /api/food/courier/:id/cancel   — courier cancels an accepted delivery { reason }
```

**New socket event for re-queuing:**
- `food:order:courier_dropped` → vendor (courier cancelled, re-searching)
- `food:order:status_update` with `searching_courier` → customer

**`food_delivery_assignments` table tracks all assignment attempts per order:**
- `order_id`, `courier_id`, `status` (`assigned` | `cancelled` | `completed`)
- `assigned_at`, `cancelled_at`, `cancellation_reason`
- This gives a full audit trail and powers the excluded list

### 2.3 Courier APIs — Phase 2

```
GET  /api/food/courier/available        — available food deliveries (lat, lng, radius, vehicle_type)
POST /api/food/courier/:id/accept       — accept food delivery { estimated_arrival_time }
POST /api/food/courier/:id/reject       — reject { reason }
POST /api/food/courier/:id/cancel       — cancel AFTER acceptance { reason } → triggers re-queuing
GET  /api/food/courier/active           — courier's active food deliveries
```

### 2.4 Vendor Pickup APIs — Phase 2

```
POST /api/vendor-pickup/request         — create pickup request for prepared order { order_id }
GET  /api/vendor-pickup/vendor/requests — vendor's pickup requests (status, date_range)
GET  /api/vendor-pickup/:id             — pickup request details
PUT  /api/vendor-pickup/:id/ready       — mark ready for pickup { pickup_code, special_instructions }
POST /api/vendor-pickup/:id/cancel      — cancel pickup { reason }
```

Courier-side vendor pickup:
```
GET  /api/vendor-pickup/available       — available vendor pickups (lat, lng, radius)
POST /api/vendor-pickup/accept          — accept vendor pickup { pickup_id, estimated_arrival_time }
PUT  /api/vendor-pickup/:id/status      — update status { status, location, notes }
POST /api/vendor-pickup/:id/verify-code — verify pickup code at vendor { pickup_code }
POST /api/vendor-pickup/:id/location    — update courier location { lat, lng, status }
```

### 2.5 Socket Events Emitted — Phase 2

Customer (`/food-orders` namespace):
- `food:order:status_update` — on any status change
- `food:order:courier_assigned` — when courier accepts
- `food:order:courier_location` — live courier location
- `food:order:estimated_time_update` — when prep time changes
- `food:order:created` — on order placement confirmation

Vendor (`/vendor-orders` namespace):
- `food:order:new_request` — new order placed
- `food:order:cancelled` — customer cancelled
- `food:order:payment_confirmed` — payment verified

Courier (`/courier-deliveries` namespace):
- `food:delivery:new_request` — new food delivery available
- `food:delivery:request_expired` — timeout or cancelled
- `food:delivery:accepted_by_another` — another courier took it

Vendor-Courier (`/vendor-pickups` namespace):
- `vendor_pickup:courier_assigned` — courier assigned to pickup
- `vendor_pickup:courier_arrived` — courier at vendor
- `vendor_pickup:package_picked_up` — package collected
- `vendor_pickup:delivered` — delivered to customer
- `vendor_pickup:new_request` — new pickup available (courier)
- `vendor_pickup:accepted_by_another` — taken by another courier
- `vendor_pickup:cancelled` — pickup cancelled

### 2.6 Push Notifications — Phase 2

Reuse `core-logistics` push notification service via internal API for:
- New order → vendor
- Order accepted → customer
- Order rejected → customer (with reason)
- Courier assigned → customer
- Order ready for pickup → courier
- Order delivered → customer + vendor

### Phase 2 Deliverables

- [ ] FoodSocketService with 4 namespaces running
- [ ] Courier matching service working (initial assignment)
- [ ] Courier re-queuing working (cancel after accept → back to searching → exclude previous courier)
- [ ] Max retry logic working (after N failed rounds → `courier_not_found` + admin alert)
- [ ] All courier delivery APIs working (including cancel-after-accept)
- [ ] All vendor-pickup APIs working
- [ ] All socket events emitting correctly (including `food:order:courier_dropped`)
- [ ] Push notifications firing on key status changes
- [ ] Live courier location updating to customer
- [ ] Delivery timeout/retry logic working
- [ ] Phase 2 tested end-to-end

---

## Phase 3 — Delivery Execution, Ratings & History

**Goal:** Full courier delivery flow with auth codes, photo uploads, ratings, and complete order history.

### 3.1 Delivery Execution APIs

```
POST /api/food/courier/:id/arrived-vendor   — arrived at restaurant { arrival_time, location }
POST /api/food/courier/:id/verify-pickup    — verify pickup code { pickup_code }
POST /api/food/courier/:id/picked-up        — confirm pickup { pickup_photo, items_verified }
POST /api/food/courier/:id/arrived-delivery — arrived at customer { arrival_time, location }
POST /api/food/courier/:id/verify-delivery  — verify delivery code { delivery_code }
POST /api/food/courier/:id/delivered        — mark delivered { delivery_photo, customer_signature }
POST /api/food/courier/:id/upload-photo     — upload photo { photo_type, image_data }
POST /api/food/courier/location             — update real-time location { lat, lng, heading, speed }
```

### 3.2 Auth Code System

- On order creation: generate 4-digit `pickup_code` (vendor → courier) and `delivery_code` (courier → customer)
- `pickup_code` stored on order, shown to vendor in their UI
- `delivery_code` stored on order, shown to customer in their UI
- Courier must enter `pickup_code` at restaurant before status moves to `picked_up`
- Courier must enter `delivery_code` at customer before status moves to `delivered`

### 3.3 Photo Upload

Reuse Supabase storage pattern from `core-logistics` delivery module:
- Generate signed upload URL
- Store photo URL on order record
- `photo_type`: `pickup` | `delivery`

### 3.4 Rating APIs

```
POST /api/food/orders/:id/rate          — rate order { restaurant_rating, delivery_rating, comment }
```

Tables:
- `food_ratings` — customer rates restaurant + courier per order
- Updates `food_restaurants.average_rating` and courier's rating aggregate

### 3.5 Courier History & Earnings

```
GET /api/food/courier/history           — delivery history (date_from, date_to, status)
GET /api/food/courier/earnings          — earnings report (date_from, date_to)
```

### 3.6 Payment APIs (Phase 3)

```
POST /api/food/payment/validate-otp     — validate OTP for card payments { transaction_id, otp }
POST /api/food/payment/process          — process payment { order_id, payment_method, payment_details }
POST /api/food/payment/refund           — manual refund { order_id, refund_reason }
```

Card payment flow (Phase 3 — full implementation):
1. Initialize charge via Flutterwave (same pattern as `core-logistics`)
2. If OTP required → return `pending_authorization`
3. Customer validates OTP via `/api/food/payment/validate-otp`
4. On success → create order

### Phase 3 Deliverables

- [ ] Full courier delivery execution flow working (arrived → verify → pickup → deliver)
- [ ] Auth codes generated and verified correctly
- [ ] Photo upload working
- [ ] Rating system working
- [ ] Courier history and earnings working
- [ ] Card payment flow working (with OTP)
- [ ] Refund flow working
- [ ] Phase 3 tested end-to-end

---

## Phase 4 — Vendor Management, Admin & Analytics

**Goal:** Full vendor onboarding, menu management, store operations, admin panel, analytics.

### 4.1 Vendor Profile & Store Management

```
GET  /api/vendor/profile                — get vendor profile
PUT  /api/vendor/profile                — update profile { business_name, description, contact_info }
GET  /api/vendor/store-details          — store info
PUT  /api/vendor/store-details          — update store { store_name, address, phone, email, logo }
GET  /api/vendor/store-operations       — operational settings
PUT  /api/vendor/store-operations       — update { operating_hours, delivery_settings, auto_accept_orders }
GET  /api/vendor/statistics             — vendor stats (earnings, orders, ratings, performance)
```

### 4.2 Menu Management

```
GET    /api/vendor/categories           — list menu categories
POST   /api/vendor/categories           — create category { name, description, image }
PUT    /api/vendor/categories/:id       — update category
DELETE /api/vendor/categories/:id       — delete category

GET    /api/vendor/products             — list products (category_id, is_active, search)
POST   /api/vendor/products             — create product { name, description, price, category_id, images[], extras[] }
PUT    /api/vendor/products/:id         — update product
DELETE /api/vendor/products/:id         — delete product
PUT    /api/vendor/products/:id/availability — toggle availability { is_available, stock_quantity }

GET    /api/vendor/extras               — list extras/add-ons
POST   /api/vendor/extras               — create extra { name, description, price, image }
PUT    /api/vendor/extras/:id           — update extra
DELETE /api/vendor/extras/:id           — delete extra
```

### 4.3 Analytics APIs

```
GET /api/analytics/vendor/dashboard     — vendor dashboard (sales, orders, ratings, trends)
GET /api/analytics/courier/earnings     — courier earnings (date_from, date_to)
GET /api/analytics/orders/trends        — order trends (period, restaurant_id)
GET /api/analytics/customer/behavior    — customer behavior insights
```

### 4.4 Admin APIs

```
GET /api/food/admin/orders              — all orders (status, restaurant_id, courier_id, date_range)
PUT /api/food/admin/orders/:id/status   — override order status { status, reason }
GET /api/food/admin/vendors             — all vendors (status, verification_status)
PUT /api/food/admin/vendors/:id/approve — approve vendor
PUT /api/food/admin/vendors/:id/suspend — suspend vendor
GET /api/food/admin/couriers            — all couriers (status, availability)
GET /api/food/admin/analytics           — platform-wide analytics
```

### 4.5 Vendor Onboarding

New vendors register via admin approval flow:
1. Vendor submits profile + store details
2. Admin reviews and approves/rejects
3. On approval → vendor can start adding menu items and receiving orders

### Phase 4 Deliverables

- [ ] Full vendor profile and store management working
- [ ] Complete menu management (categories, products, extras, availability)
- [ ] Vendor analytics dashboard working
- [ ] Admin order management working
- [ ] Admin vendor management (approve/suspend) working
- [ ] Platform analytics working
- [ ] Vendor onboarding flow working
- [ ] Phase 4 tested end-to-end

---

## Endpoint Count Summary

| Phase | Category | Count |
|---|---|---|
| 1 | Restaurant/menu browse | 6 |
| 1 | Cart management | 5 |
| 1 | Order placement + history | 5 |
| 1 | Vendor order management | 6 |
| 1 | Payment estimate | 1 |
| 2 | Courier food delivery | 4 |
| 2 | Vendor pickup (vendor-side) | 5 |
| 2 | Vendor pickup (courier-side) | 5 |
| 3 | Courier execution flow | 8 |
| 3 | Ratings | 1 |
| 3 | Courier history + earnings | 2 |
| 3 | Payment (card + refund) | 3 |
| 4 | Vendor profile + store | 7 |
| 4 | Menu management | 13 |
| 4 | Analytics | 4 |
| 4 | Admin | 7 |
| **Total** | | **82 endpoints** |

Socket events: 22 across 4 namespaces

---

## Database Tables Summary

| Table | Phase |
|---|---|
| `food_restaurants` | 1 |
| `food_categories` | 1 |
| `food_menu_categories` | 1 |
| `food_menu_items` | 1 |
| `food_item_extras` | 1 |
| `food_carts` | 1 |
| `food_cart_items` | 1 |
| `food_orders` | 1 |
| `food_order_items` | 1 |
| `food_order_status_history` | 1 |
| `food_delivery_assignments` | 2 |
| `food_vendor_pickups` | 2 |
| `food_courier_locations` | 2 |
| `food_ratings` | 3 |
| `food_courier_earnings` | 3 |

---

## Service Dependencies

```
food-service
  ├── core-logistics (internal API)
  │     ├── GET  /api/wallet/internal/balance
  │     ├── POST /api/wallet/internal/deduct
  │     ├── POST /api/wallet/internal/credit
  │     └── POST /api/notifications/push (push notifications)
  ├── auth-service (JWT verification — same secret)
  ├── Supabase (shared DB instance, food_* tables)
  ├── Flutterwave (card payments — Phase 3)
  └── Google Maps (geocoding, distance — direct SDK)
```

---

## Gateway Routing to Add

```
/api/food/*          → food-service:3005  (timeout: 60s)
/api/vendor/*        → food-service:3005  (timeout: 60s)
/api/vendor-pickup/* → food-service:3005  (timeout: 60s)
/api/analytics/*     → food-service:3005  (timeout: 30s)
```

Note: `/api/delivery/*` already routes to `core-logistics` — food courier delivery APIs will use `/api/food/courier/*` to avoid conflict.
