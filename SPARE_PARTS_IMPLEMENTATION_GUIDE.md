# Spare Parts Service — Implementation Guide

## Overview

A brand new `spare-parts-service` that allows customers to browse spare parts stores,
add products to a cart, and place orders with wallet or cash on delivery payment.
Vendors manage their own stores and products. When a vendor marks an order as ready,
the same rider dispatch system used by the marketplace service is triggered to assign
a courier for immediate delivery.

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Service type | New standalone service (`spare-parts-service`) | Keeps concerns separated, same pattern as marketplace vs food |
| Port | `3009` | Next available port after marketplace (`3006`), food (`3005`), payment (`3007`) |
| Vendor registration | Reuse platform-service with `business_type = "spare_parts"` | Avoids duplicating the approval workflow |
| Store provisioning | Internal API call from platform-service on approval | Same pattern as marketplace |
| Payment methods | Wallet + Cash on delivery | No card for now |
| Delivery model | Immediate rider dispatch when vendor marks ready | Same as marketplace — `searching_rider` → `delivered` |
| Saved addresses | Read from `marketplace_saved_addresses` table | Shared across marketplace and spare parts — one saved address serves both |
| Rider dispatch | Reuse marketplace-service rider matching logic via internal API | No need to duplicate the matching algorithm |
| Promo/discount | Not in scope for now | Will be added later following the food vendor promo pattern |
| Admin management | Not in scope for this implementation | Will be added later |
| Database prefix | All tables prefixed `spare_parts_` | Consistent with `marketplace_`, `food_` naming |

---

## Architecture

```
Customer App
    │
    ▼
Gateway (:3000)
/api/spare-parts  ──────────────────► spare-parts-service (:3009)
                                              │
                                              ├── Supabase (spare_parts_* tables)
                                              ├── payment-service (wallet deduct/credit)
                                              ├── marketplace-service (saved addresses)
                                              └── core-logistics (rider dispatch + Socket.IO)

platform-service ──► (on vendor approval) ──► spare-parts-service /api/internal/spare-parts/vendor/provision

Admin approves vendor
    │
    ▼
platform-service vendor-registration.service.ts
    │  (if business_type === 'spare_parts')
    ▼
POST spare-parts-service /api/internal/spare-parts/vendor/provision
    │
    ▼
spare_parts_stores row created
```

---

## Phase 1 — Foundation (Service Scaffold + Database + Vendor Provisioning)

**Goal:** Get the service running, database tables created, vendor stores provisionable.

### 1.1 Create the service folder structure

```
services/spare-parts-service/
├── package.json
├── tsconfig.json
├── nodemon.json
├── .env.template
├── prisma/
│   └── schema.prisma         ← all spare_parts_* tables
└── src/
    ├── server.ts
    ├── app.ts
    ├── config/
    │   ├── index.ts           ← env vars
    │   └── database.ts        ← Prisma client + Supabase client
    ├── middleware/
    │   ├── auth.middleware.ts          ← JWT verify (copy from marketplace)
    │   ├── vendor.middleware.ts        ← vendor approval guard
    │   ├── internal-api.middleware.ts  ← x-internal-api-key guard
    │   └── error.middleware.ts
    ├── utils/
    │   ├── logger.ts
    │   ├── maps.ts            ← haversine (copy from marketplace)
    │   └── response.ts        ← standard response helpers
    ├── routes/
    │   ├── index.ts
    │   ├── public.routes.ts
    │   ├── customer.routes.ts
    │   ├── vendor.routes.ts
    │   ├── rider.routes.ts
    │   └── internal.routes.ts
    ├── controllers/           ← (stubs in Phase 1, filled in later phases)
    └── services/
```

### 1.2 Database schema (Prisma)

All models follow the same patterns as `marketplace_*` tables.

**`spare_parts_categories`**
```
id, name, description, icon_url, is_active, sort_order
```
Pre-seeded with: All Parts, Battery, Brakes, Tyres, Suspension, Engine Parts, Electrical, Body Parts, Filters, Transmission

**`spare_parts_stores`**
```
id, owner_id (UNIQUE), vendor_id, name, description,
logo_url, banner_url, address, city, state,
latitude, longitude, phone, email,
is_active, is_open, is_verified,
average_rating (default 0), total_ratings (default 0), total_orders (default 0),
operating_hours (JSON default {}),
created_at, updated_at
```

**`spare_parts_store_categories`** (join table)
```
store_id, category_id  ← composite PK
```

**`spare_parts_products`**
```
id, store_id, category_id,
name, description, specs (JsonB default {}),
price, images (String[] default []),
is_active, is_available, stock_quantity,
average_rating (default 0), total_ratings (default 0),
created_at, updated_at
```
Note: `specs` stores structured attributes e.g. `{"Size":"225/70 R19.5","Brand":"TMA","Type":"Radial"}`
Note: No `original_price` column — discount/promo deferred to later phase.

**`spare_parts_carts`**
```
id, user_id, store_id ← UNIQUE(user_id, store_id),
created_at, updated_at
```

**`spare_parts_cart_items`**
```
id, cart_id, product_id, quantity, unit_price,
created_at, updated_at
```

**`spare_parts_orders`**
```
id, customer_id, store_id, rider_id,
status (default 'pending'),
payment_method ('wallet' | 'cash'),
payment_status (default 'pending'),
subtotal, delivery_fee, service_fee, rounding_fee, total_amount,
delivery_address (JsonB),   ← {address, lat, lng, label?}
vehicle_type (default 'motorcycle'),
special_instructions,
wallet_transaction_id, wallet_balance_before, wallet_balance_after,
wallet_cash_portion, wallet_promo_portion,
cash_payment_confirmed (Boolean default false),
cash_payment_confirmed_at,
cancellation_reason, cancelled_by, rejection_reason,
excluded_rider_ids (String[] default []),
rider_search_attempts (default 0),
accepted_at, ready_at, heading_to_store_at, shipped_at,
heading_to_customer_at, arrived_at, delivered_at, cancelled_at,
created_at, updated_at
```

**`spare_parts_order_items`**
```
id, order_id, product_id, product_name, product_price, quantity, subtotal
```

**`spare_parts_order_status_history`**
```
id, order_id, status, previous_status, changed_by, changed_by_role, notes, created_at
```

**`spare_parts_rider_assignments`**
```
id, order_id, rider_id, status (default 'assigned'),
cancelled_at, cancellation_reason, created_at
```

**`spare_parts_rider_locations`**
```
id, order_id, rider_id, latitude, longitude, heading, speed, created_at
```

**`spare_parts_rider_earnings`**
```
id, rider_id, order_id, delivery_fee, total_earned, status (default 'pending'), created_at
```

**`spare_parts_reviews`**
```
id, order_id (UNIQUE), customer_id, store_id, store_rating, comment, created_at, updated_at
```

**`spare_parts_product_reviews`**
```
id, review_id, product_id, product_rating
```

**`spare_parts_wishlist`**
```
id, user_id, product_id ← UNIQUE(user_id, product_id), created_at
```

**`spare_parts_fare_config`**
```
id, vehicle_type, city_tier ← UNIQUE(vehicle_type, city_tier),
estimated_billing_unit, high_traffic_estimated_billing_unit,
min_amount_less_than_3km, service_fee, rounding_fee,
booking_fee, fleet_commission_percent,
is_active, created_at, updated_at
```
Note: Seeded from the same values as `marketplace_fare_config` — admin can adjust later.

### 1.3 Vendor provisioning hook (platform-service change)

**File:** `services/platform-service/src/services/vendor-registration.service.ts`

Add an `if` block alongside the existing marketplace provision block:

```typescript
// Auto-provision spare_parts_stores row for spare_parts-type vendors
if (vendor.business_type === 'spare_parts') {
  const sparePartsServiceUrl = process.env.SPARE_PARTS_SERVICE_URL || 'http://localhost:3009';
  const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
  try {
    await axios.post(
      `${sparePartsServiceUrl}/api/internal/spare-parts/vendor/provision`,
      {
        owner_id: vendor.user_id,
        vendor_id: vendor.id,
        business_name: vendor.business_name,
        address: vendor.address || '',
        city: vendor.city,
        state: vendor.state,
        phone: vendor.phone,
        email: vendor.email,
        logo_url: vendor.logo_url,
      },
      { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
    );
    logger.info('Spare parts store provisioned for vendor:', vendor.user_id);
  } catch (err: any) {
    logger.error('Failed to provision spare parts store for vendor (non-fatal):', err.message);
  }
}
```

Also add `spare_parts` to the list of valid `business_type` values in platform-service validation.

### 1.4 Gateway registration

**File:** `gateway/src/config/index.ts` — add to the services config:

```typescript
spareParts: {
  url: process.env.SPARE_PARTS_SERVICE_URL || 'http://localhost:3009',
  healthCheck: '/health',
  timeout: 60000,
}
```

**File:** `gateway/src/routes/index.ts` — add proxy route:

```typescript
app.use(
  '/api/spare-parts',
  createProxyMiddleware(createProxyOptions(config.services.spareParts.url, undefined, 60000))
);
```

### 1.5 Internal provision endpoint (spare-parts-service)

`POST /api/internal/spare-parts/vendor/provision`
- Guarded by `x-internal-api-key` header
- Creates `spare_parts_stores` row (idempotent — skip if `owner_id` already exists)
- Sets `is_verified: true`, `is_open: false`
- Upserts fare config from `marketplace_fare_config` as baseline

### Phase 1 Deliverables
- [ ] Service folder structure created
- [ ] Prisma schema with all tables + migrations run
- [ ] Categories seeded (10 initial spare parts categories)
- [ ] Service starts and `/health` responds
- [ ] Internal provision endpoint working
- [ ] Platform-service hook added for `business_type = 'spare_parts'`
- [ ] Gateway proxy registered
- [ ] Vendor middleware guard working (checks `business_type === 'spare_parts'`)

---

## Phase 2 — Public Browsing + Vendor Store/Product Management

**Goal:** Customers can browse. Vendors can manage their store and products.

### 2.1 Public endpoints (no auth required)

`GET /api/spare-parts/categories`
- Returns all active categories ordered by `sort_order`

`GET /api/spare-parts/stores`
- Query params: `lat`, `lng`, `radius` (default 15km), `categoryId`, `isOpen`, `ratingMin`, `limit`, `page`
- Returns stores with their category assignments
- Distance filter applied in-memory after DB query (same pattern as marketplace)

`GET /api/spare-parts/stores/:id`
- Store detail with featured products per category (top 8 by rating per category)

`GET /api/spare-parts/stores/:id/products`
- Query params: `categoryId`, `limit`, `page`
- Returns paginated products for the store

`GET /api/spare-parts/stores/:id/reviews`
- Paginated store reviews

`GET /api/spare-parts/products/:id`
- Single product with store info, category, specs, rating

`GET /api/spare-parts/products/:id/similar`
- Same-store, same-category products (max 10)

`GET /api/spare-parts/products/:id/reviews`
- Paginated product reviews

`GET /api/spare-parts/search`
- Query params: `q` (required), `categoryId`, `lat`, `lng`
- ILIKE search across store names and product names/descriptions
- Returns `{ stores: [...], products: [...] }`

### 2.2 Vendor endpoints (JWT + vendor approved + business_type = spare_parts)

**Store management:**

`GET /api/spare-parts/vendor/store`
`PUT /api/spare-parts/vendor/store`
- Updatable fields: name, description, logo_url, banner_url, address, latitude, longitude, phone, email, operating_hours, category_ids (full replace)

`PUT /api/spare-parts/vendor/store/status`
- Body: `{ is_open: boolean }`

`GET /api/spare-parts/vendor/store/statistics`
- Total orders, revenue, pending orders today

`GET /api/spare-parts/vendor/upload-url`
- Presigned S3 URL for product image / store media upload

**Product management:**

`GET /api/spare-parts/vendor/products`
- Query params: `categoryId`, `isActive`, `limit`, `page`

`POST /api/spare-parts/vendor/products`
- Body: `{ name, description, category_id, price, images[], specs{}, stock_quantity?, is_active }`

`PUT /api/spare-parts/vendor/products/:id`
`DELETE /api/spare-parts/vendor/products/:id`

`PUT /api/spare-parts/vendor/products/:id/availability`
- Body: `{ is_available: boolean }`

### 2.3 Fare config service

`FareService.calculateFare()` — identical logic to marketplace:
- Resolves city tier from delivery address → state → `spare_parts_fare_config`
- `< 3km` → `min_amount_less_than_3km` flat fee
- `>= 3km` → `distance × estimated_billing_unit`
- Returns: `{ distanceKm, deliveryFee, serviceFee, roundingFee, totalFees, currencyCode }`

### Phase 2 Deliverables
- [ ] All public browsing endpoints working
- [ ] Store service with distance + category filtering
- [ ] Product search working
- [ ] Vendor store CRUD working
- [ ] Vendor product CRUD with specs field
- [ ] Fare service working
- [ ] Vendor middleware validating `business_type === 'spare_parts'`

---

## Phase 3 — Cart, Checkout, Orders (Customer Purchase Flow)

**Goal:** Full end-to-end purchase flow for customers.

### 3.1 Cart endpoints (JWT required)

`GET /api/spare-parts/cart`
- Returns cart + store info + items (with product availability check) + subtotal
- Reads from `spare_parts_carts` + `spare_parts_cart_items`

`POST /api/spare-parts/cart/add`
- Body: `{ product_id, quantity }`
- One-store-per-cart rule: if existing cart belongs to a different store, clear it and warn
- Increments quantity if product already in cart

`PUT /api/spare-parts/cart/update`
- Body: `{ cart_item_id, quantity }` — if quantity = 0, removes the item

`DELETE /api/spare-parts/cart/remove`
- Body: `{ cart_item_id }`

`DELETE /api/spare-parts/cart`
- Clears entire cart

### 3.2 Saved addresses (proxy to marketplace-service)

Spare parts reuses the customer's addresses stored in `marketplace_saved_addresses`.
The spare-parts-service does NOT have its own address table.

`GET /api/spare-parts/addresses`
- Proxied internally to `GET {MARKETPLACE_SERVICE_URL}/api/marketplace/addresses`
  OR reads directly from `marketplace_saved_addresses` via Supabase client (same DB)
- Recommended approach: **direct Supabase read** — simpler, no inter-service HTTP

`POST /api/spare-parts/addresses`
`PUT /api/spare-parts/addresses/:id`
`DELETE /api/spare-parts/addresses/:id`
- All write operations go direct to `marketplace_saved_addresses` via Supabase client
- This means one saved address appears in both marketplace and spare parts — correct behaviour

### 3.3 Order estimate

`POST /api/spare-parts/payment/estimate`
- Body: `{ store_id, items: [{product_id, quantity}], delivery_address: {lat, lng, address} }`
- Calculates subtotal from live product prices + delivery fee from FareService
- Returns: `{ subtotal, delivery_fee, service_fee, total_fees, total_amount, distance_km }`
- No wallet deduction — estimate only

### 3.4 Place order

`POST /api/spare-parts/orders`
- Body:
```json
{
  "store_id": "...",
  "items": [{ "product_id": "...", "quantity": 2, "special_instructions": "..." }],
  "delivery_address": { "address": "...", "lat": 6.5, "lng": 3.3, "label": "Home" },
  "payment_method": "wallet" | "cash",
  "special_instructions": "..."
}
```

**Wallet payment flow:**
1. Validate store is active and open
2. Validate all products belong to store and are active/available
3. Calculate subtotal + FareService fees
4. Check wallet balance covers total
5. Deduct wallet via payment-service internal API
6. Create `spare_parts_orders` + `spare_parts_order_items`
7. Clear customer cart for this store
8. Emit Socket.IO `spare_parts:order:new_order` to vendor
9. Start 10-minute auto-cancel timeout (if vendor doesn't respond)
10. Return order with fare breakdown

**Cash payment flow:**
1. Steps 1-3 same as wallet
2. Skip wallet balance check and deduction
3. Set `payment_status = 'pending'` (not paid yet)
4. Create order rows, clear cart, notify vendor
5. Start 10-minute auto-cancel timeout

**Cash order settlement:** happens when vendor confirms cash received (or delivery is confirmed) — separate endpoint, same pattern as ride cash payment in core-logistics.

### 3.5 Order status & history endpoints

`GET /api/spare-parts/orders/history`
- Query params: `page`, `limit`, `status`
- Returns paginated orders with store name, item count, total

`GET /api/spare-parts/orders/:id`
- Full order detail: items (with product images), store info, rider info (if assigned), status history

`GET /api/spare-parts/orders/:id/tracking`
- Live: status history + rider GPS location (from `spare_parts_rider_locations`)

`GET /api/spare-parts/orders/:id/receipt`
- Receipt: all fee breakdown, items, store, payment method

`POST /api/spare-parts/orders/:id/cancel`
- Allowed statuses: `pending`, `in_progress`, `searching_rider`
- Wallet orders: full refund via payment-service
- Cash orders: no refund needed (never charged)

`POST /api/spare-parts/orders/:id/review`
- Allowed only after `delivered`
- Body: `{ store_rating, comment, product_ratings: [{product_id, rating}] }`
- Updates `spare_parts_stores.average_rating` and `spare_parts_products.average_rating`

### 3.6 Order status machine

```
pending
  └─► in_progress       (vendor accepts)
        └─► ready_for_pickup   (vendor marks ready → triggers rider search)
              └─► searching_rider
                    └─► rider_accepted
                          └─► heading_to_store
                                └─► shipped          (rider picked up)
                                      └─► heading_to_customer
                                            └─► arrived
                                                  └─► delivered  ← FINAL

(any non-terminal) ──► cancelled   ← FINAL
(searching_rider after max rounds) ──► courier_not_found ──► cancelled + refund
```

### 3.7 Vendor order management

`GET /api/spare-parts/vendor/orders`
`GET /api/spare-parts/vendor/orders/:id`

`POST /api/spare-parts/vendor/orders/:id/accept`
- `pending` → `in_progress`
- Notifies customer via Socket.IO

`POST /api/spare-parts/vendor/orders/:id/reject`
- `pending` → `cancelled`
- Wallet orders: auto-refund
- Cash orders: no action needed

`PUT /api/spare-parts/vendor/orders/:id/ready`
- `in_progress` → `ready_for_pickup`
- Triggers `SparePartsMatchingService.startRiderSearch(orderId)`

### Phase 3 Deliverables
- [ ] Cart CRUD working (one-store-per-cart rule)
- [ ] Address endpoints reading/writing to `marketplace_saved_addresses`
- [ ] Estimate endpoint working
- [ ] Wallet order placement working (deduct + create order)
- [ ] Cash order placement working (no deduction)
- [ ] 10-minute vendor timeout with auto-cancel + wallet refund
- [ ] Order history + detail endpoints
- [ ] Order cancellation with wallet refund
- [ ] Vendor accept / reject / mark ready working
- [ ] Review submission working

---

## Phase 4 — Rider Dispatch + Delivery Lifecycle + Payouts

**Goal:** Full delivery flow from rider search to delivery and payout.

### 4.1 Rider search & dispatch (`SparePartsMatchingService`)

Triggered when vendor marks order as ready (`PUT /vendor/orders/:id/ready`).

Algorithm (identical to `MarketplaceMatchingService`):
- Max 5 riders per batch
- 10 minutes per round
- Max 3 rounds
- 15km radius from store
- Filters: `drivers.status = 'approved'`, `driver_availability.is_online = true`, `is_available = true`
- Last location from `driver_location_tracking` within 5 minutes
- Orders by distance (closest first), then rating
- Broadcasts `spare_parts:delivery:new_request` via Socket.IO to rider user IDs
- On no response after 10 min → next round
- After 3 rounds → `courier_not_found` → `cancelled` → wallet refund (or cash: just cancel)
- Uses `excluded_rider_ids` to track declined/cancelled riders

**Socket.IO integration:**
- Riders already connected to core-logistics Socket.IO server
- Use the same `broadcastToRiders()` / `emitToRider()` relay pattern via core-logistics internal API
  (same as `MarketplaceMatchingService` calls `admin-relay.service.ts`)

### 4.2 Rider endpoints (JWT required, driver role)

`GET /api/spare-parts/rider/available`
- Returns orders with `status = 'searching_rider'` where `driver_id` NOT in `excluded_rider_ids`
- Enriched with store address, delivery address, delivery fee

`GET /api/spare-parts/rider/active`
- Own active deliveries (statuses: `rider_accepted` through `arrived`)

`GET /api/spare-parts/rider/history`
- Completed/cancelled deliveries

`GET /api/spare-parts/rider/earnings`
- Earnings from `spare_parts_rider_earnings`

`POST /api/spare-parts/rider/location`
- Body: `{ order_id, lat, lng, heading?, speed? }`
- Stores to `spare_parts_rider_locations`
- Relays to customer via Socket.IO `spare_parts:order:rider_location`

**Delivery status transitions:**

`POST /api/spare-parts/rider/:id/accept`
- `searching_rider` → `rider_accepted`
- Creates `spare_parts_rider_assignments` row
- Notifies customer + vendor via Socket.IO

`POST /api/spare-parts/rider/:id/reject`
- Adds rider to `excluded_rider_ids`, re-queues next search round

`POST /api/spare-parts/rider/:id/cancel`
- Cancellable from: `rider_accepted`, `heading_to_store`, `shipped`, `heading_to_customer`, `arrived`
- Adds rider to `excluded_rider_ids`
- Re-triggers `startRiderSearch()` from next round

`POST /api/spare-parts/rider/:id/heading-to-store`
- `rider_accepted` → `heading_to_store`

`POST /api/spare-parts/rider/:id/picked-up`
- `heading_to_store` → `shipped`
- Sets `shipped_at`

`POST /api/spare-parts/rider/:id/heading-to-customer`
- `shipped` → `heading_to_customer`

`POST /api/spare-parts/rider/:id/arrived`
- `heading_to_customer` → `arrived`
- Notifies customer: "Your rider is at your location"

`POST /api/spare-parts/rider/:id/delivered`
- `arrived` → `delivered`
- Triggers payouts:
  - **Vendor:** credited `subtotal` to wallet (wallet orders only — cash orders: vendor already has cash)
  - **Rider:** credited `delivery_fee` to wallet (both wallet and cash orders)
  - Platform keeps `service_fee + rounding_fee`
- Creates `spare_parts_rider_earnings` row
- Notifies customer + vendor via Socket.IO

### 4.3 Cash order confirmation

`POST /api/spare-parts/rider/:id/confirm-cash`
- Only for cash orders, only callable from `delivered` status
- Sets `cash_payment_confirmed = true`, `payment_status = 'completed'`
- Triggers vendor wallet credit (cash orders only credit vendor AFTER confirmation)

### 4.4 Payout logic summary

| Payment | Vendor gets | Rider gets | Platform keeps |
|---|---|---|---|
| Wallet | `subtotal` credited on delivery | `delivery_fee` credited on delivery | `service_fee + rounding_fee` |
| Cash | `subtotal` credited after cash confirm | `delivery_fee` credited on delivery | `service_fee + rounding_fee` from next wallet top-up (tracked) |

### Phase 4 Deliverables
- [ ] `SparePartsMatchingService` with batching, rounds, exclusion, timeout
- [ ] Socket.IO rider broadcast via core-logistics relay
- [ ] All rider status transition endpoints
- [ ] Rider location tracking endpoint
- [ ] Delivery payout logic (vendor + rider wallet credits)
- [ ] Cash order confirmation endpoint
- [ ] Rider earnings endpoint
- [ ] Rider available/active/history endpoints

---

## Environment Variables

Add to all relevant `.env` files:

```env
# spare-parts-service .env
DATABASE_URL=...
DIRECT_URL=...
PORT=3009
JWT_SECRET=...
INTERNAL_API_KEY=olakz-internal-api-key-2026-secure
PAYMENT_SERVICE_URL=http://localhost:3002
MARKETPLACE_SERVICE_URL=http://localhost:3006
CORE_LOGISTICS_URL=http://localhost:3001
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# gateway .env — add:
SPARE_PARTS_SERVICE_URL=http://localhost:3009

# platform-service .env — add:
SPARE_PARTS_SERVICE_URL=http://localhost:3009
```

---

## Files to Create (New)

```
services/spare-parts-service/           ← entire new service
```

## Files to Modify (Existing)

| File | Change |
|---|---|
| `gateway/src/config/index.ts` | Add `spareParts` service config entry |
| `gateway/src/routes/index.ts` | Add `/api/spare-parts` proxy route |
| `services/platform-service/src/services/vendor-registration.service.ts` | Add `spare_parts` provisioning block |
| `services/platform-service/src/routes/vendor-registration.routes.ts` | Add `spare_parts` to valid business_type enum |
| `.env.template` (root) | Add `SPARE_PARTS_SERVICE_URL` |
| `gateway/.env.template` | Add `SPARE_PARTS_SERVICE_URL` |

---

## Implementation Order

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 4
(5-7 days)   (3-4 days)   (5-6 days)   (4-5 days)
```

Each phase produces a deployable increment. After Phase 2, vendors can manage stores
and customers can browse. After Phase 3, full purchase flow works. After Phase 4,
delivery and payouts are live.

---

## Notes

- **Rider dispatch uses existing core-logistics riders** — spare parts does not have its
  own rider pool. The same approved drivers who do marketplace deliveries will handle
  spare parts deliveries. The spare-parts-service broadcasts to their Socket.IO channels
  via core-logistics internal relay (same pattern as `marketplace-service/src/services/admin-relay.service.ts`).

- **Fare config is seeded from marketplace** — on service startup, if `spare_parts_fare_config`
  is empty, seed it from `marketplace_fare_config`. Admin will be able to set separate
  pricing in a future phase.

- **One cart per store** — same rule as marketplace. Customer can only have one active
  spare parts cart at a time (tied to one store). Adding a product from a different store
  clears the existing cart after warning the customer.

- **Promo/discount** — deferred to a future phase. When implemented, it will follow the
  food service vendor promo pattern: vendor creates a promo code with a % or fixed
  discount, customer applies it at checkout. No `original_price` field needed until then.

- **Categories** — spare parts categories are independent of marketplace categories.
  They are seeded once and managed by admin later. The 10 initial categories to seed:
  All Parts, Battery, Brakes, Tyres, Suspension, Engine Parts, Electrical, Body Parts,
  Filters, Transmission.
