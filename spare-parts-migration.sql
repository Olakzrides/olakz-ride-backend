-- ============================================================
-- SPARE PARTS SERVICE — DATABASE MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================

-- Categories
CREATE TABLE IF NOT EXISTS spare_parts_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_categories_is_active  ON spare_parts_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_spare_parts_categories_sort_order ON spare_parts_categories(sort_order);

-- Stores
CREATE TABLE IF NOT EXISTS spare_parts_stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL UNIQUE,
  vendor_id       UUID,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  banner_url      TEXT,
  address         TEXT NOT NULL DEFAULT '',
  city            VARCHAR(100),
  state           VARCHAR(100),
  latitude        DECIMAL(10,8) NOT NULL DEFAULT 0,
  longitude       DECIMAL(11,8) NOT NULL DEFAULT 0,
  phone           VARCHAR(20),
  email           VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_open         BOOLEAN NOT NULL DEFAULT false,
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  average_rating  DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  total_ratings   INTEGER NOT NULL DEFAULT 0,
  total_orders    INTEGER NOT NULL DEFAULT 0,
  operating_hours JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_owner_id      ON spare_parts_stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_is_active     ON spare_parts_stores(is_active);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_is_open       ON spare_parts_stores(is_open);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_is_verified   ON spare_parts_stores(is_verified);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_average_rating ON spare_parts_stores(average_rating);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_city          ON spare_parts_stores(city);
CREATE INDEX IF NOT EXISTS idx_spare_parts_stores_state         ON spare_parts_stores(state);

-- Store Categories (join table)
CREATE TABLE IF NOT EXISTS spare_parts_store_categories (
  store_id    UUID NOT NULL REFERENCES spare_parts_stores(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES spare_parts_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (store_id, category_id)
);

-- Products
CREATE TABLE IF NOT EXISTS spare_parts_products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES spare_parts_stores(id) ON DELETE CASCADE,
  category_id    UUID REFERENCES spare_parts_categories(id) ON DELETE SET NULL,
  name           VARCHAR(200) NOT NULL,
  description    TEXT,
  specs          JSONB NOT NULL DEFAULT '{}',
  price          DECIMAL(10,2) NOT NULL,
  images         TEXT[] NOT NULL DEFAULT '{}',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_available   BOOLEAN NOT NULL DEFAULT true,
  stock_quantity INTEGER,
  average_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  total_ratings  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_products_store_id      ON spare_parts_products(store_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_products_category_id   ON spare_parts_products(category_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_products_is_active     ON spare_parts_products(is_active);
CREATE INDEX IF NOT EXISTS idx_spare_parts_products_is_available  ON spare_parts_products(is_available);
CREATE INDEX IF NOT EXISTS idx_spare_parts_products_store_active  ON spare_parts_products(store_id, is_active);
CREATE INDEX IF NOT EXISTS idx_spare_parts_products_store_cat     ON spare_parts_products(store_id, category_id);

-- Fare Config
CREATE TABLE IF NOT EXISTS spare_parts_fare_config (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type                      VARCHAR(50) NOT NULL,
  city_tier                         VARCHAR(20) NOT NULL DEFAULT 'low',
  estimated_billing_unit            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  high_traffic_estimated_billing_unit DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  min_amount_less_than_3km          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  service_fee                       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rounding_fee                      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  booking_fee                       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  fleet_commission_percent          DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  is_active                         BOOLEAN NOT NULL DEFAULT true,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vehicle_type, city_tier)
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_fare_config_vehicle_type ON spare_parts_fare_config(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_spare_parts_fare_config_city_tier    ON spare_parts_fare_config(city_tier);
CREATE INDEX IF NOT EXISTS idx_spare_parts_fare_config_is_active    ON spare_parts_fare_config(is_active);

-- Seed fare config from marketplace_fare_config (baseline pricing)
INSERT INTO spare_parts_fare_config (
  vehicle_type, city_tier,
  estimated_billing_unit, high_traffic_estimated_billing_unit,
  min_amount_less_than_3km, service_fee, rounding_fee,
  booking_fee, fleet_commission_percent, is_active
)
SELECT
  vehicle_type, city_tier,
  estimated_billing_unit, high_traffic_estimated_billing_unit,
  min_amount_less_than_3km, service_fee, rounding_fee,
  booking_fee, fleet_commission_percent, is_active
FROM marketplace_fare_config
ON CONFLICT (vehicle_type, city_tier) DO NOTHING;

-- Carts
CREATE TABLE IF NOT EXISTS spare_parts_carts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  store_id   UUID NOT NULL REFERENCES spare_parts_stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id)
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_carts_user_id ON spare_parts_carts(user_id);

-- Cart Items
CREATE TABLE IF NOT EXISTS spare_parts_cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    UUID NOT NULL REFERENCES spare_parts_carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES spare_parts_products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_cart_items_cart_id    ON spare_parts_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_cart_items_product_id ON spare_parts_cart_items(product_id);

-- Orders
CREATE TABLE IF NOT EXISTS spare_parts_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               UUID NOT NULL,
  store_id                  UUID NOT NULL REFERENCES spare_parts_stores(id),
  rider_id                  UUID,
  status                    VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_method            VARCHAR(20) NOT NULL,
  payment_status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  subtotal                  DECIMAL(10,2) NOT NULL,
  delivery_fee              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  service_fee               DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rounding_fee              DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount              DECIMAL(10,2) NOT NULL,
  delivery_address          JSONB NOT NULL,
  vehicle_type              VARCHAR(50) NOT NULL DEFAULT 'motorcycle',
  special_instructions      TEXT,
  wallet_transaction_id     VARCHAR(255),
  wallet_balance_before     DECIMAL(10,2),
  wallet_balance_after      DECIMAL(10,2),
  wallet_cash_portion       DECIMAL(10,2),
  wallet_promo_portion      DECIMAL(10,2),
  cash_payment_confirmed    BOOLEAN NOT NULL DEFAULT false,
  cash_payment_confirmed_at TIMESTAMPTZ,
  cancellation_reason       TEXT,
  cancelled_by              VARCHAR(20),
  rejection_reason          TEXT,
  excluded_rider_ids        UUID[] NOT NULL DEFAULT '{}',
  rider_search_attempts     INTEGER NOT NULL DEFAULT 0,
  accepted_at               TIMESTAMPTZ,
  ready_at                  TIMESTAMPTZ,
  heading_to_store_at       TIMESTAMPTZ,
  shipped_at                TIMESTAMPTZ,
  heading_to_customer_at    TIMESTAMPTZ,
  arrived_at                TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_customer_id   ON spare_parts_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_store_id      ON spare_parts_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_rider_id      ON spare_parts_orders(rider_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_status        ON spare_parts_orders(status);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_payment_method ON spare_parts_orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_created_at    ON spare_parts_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_customer_status ON spare_parts_orders(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_spare_parts_orders_store_status  ON spare_parts_orders(store_id, status);

-- Order Items
CREATE TABLE IF NOT EXISTS spare_parts_order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES spare_parts_orders(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES spare_parts_products(id),
  product_name  VARCHAR(200) NOT NULL,
  product_price DECIMAL(10,2) NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  subtotal      DECIMAL(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_order_items_order_id   ON spare_parts_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_order_items_product_id ON spare_parts_order_items(product_id);

-- Order Status History
CREATE TABLE IF NOT EXISTS spare_parts_order_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES spare_parts_orders(id) ON DELETE CASCADE,
  status          VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  changed_by      UUID,
  changed_by_role VARCHAR(20),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_order_status_history_order_id ON spare_parts_order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_order_status_history_status   ON spare_parts_order_status_history(status);

-- Rider Assignments
CREATE TABLE IF NOT EXISTS spare_parts_rider_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES spare_parts_orders(id) ON DELETE CASCADE,
  rider_id            UUID NOT NULL,
  status              VARCHAR(50) NOT NULL DEFAULT 'assigned',
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_assignments_order_id  ON spare_parts_rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_assignments_rider_id  ON spare_parts_rider_assignments(rider_id);

-- Rider Locations
CREATE TABLE IF NOT EXISTS spare_parts_rider_locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES spare_parts_orders(id) ON DELETE CASCADE,
  rider_id   UUID NOT NULL,
  latitude   DECIMAL(10,8) NOT NULL,
  longitude  DECIMAL(11,8) NOT NULL,
  heading    DECIMAL(5,2),
  speed      DECIMAL(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_locations_order_id  ON spare_parts_rider_locations(order_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_locations_rider_id  ON spare_parts_rider_locations(rider_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_locations_created_at ON spare_parts_rider_locations(created_at);

-- Rider Earnings
CREATE TABLE IF NOT EXISTS spare_parts_rider_earnings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id     UUID NOT NULL,
  order_id     UUID NOT NULL REFERENCES spare_parts_orders(id) ON DELETE CASCADE,
  delivery_fee DECIMAL(10,2) NOT NULL,
  total_earned DECIMAL(10,2) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_earnings_rider_id ON spare_parts_rider_earnings(rider_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_earnings_order_id ON spare_parts_rider_earnings(order_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_rider_earnings_status   ON spare_parts_rider_earnings(status);

-- Reviews
CREATE TABLE IF NOT EXISTS spare_parts_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL UNIQUE,
  customer_id  UUID NOT NULL,
  store_id     UUID NOT NULL REFERENCES spare_parts_stores(id) ON DELETE CASCADE,
  store_rating INTEGER NOT NULL CHECK (store_rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_reviews_store_id    ON spare_parts_reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_reviews_customer_id ON spare_parts_reviews(customer_id);

-- Product Reviews
CREATE TABLE IF NOT EXISTS spare_parts_product_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id      UUID NOT NULL REFERENCES spare_parts_reviews(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES spare_parts_products(id) ON DELETE CASCADE,
  product_rating INTEGER NOT NULL CHECK (product_rating BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_product_reviews_review_id  ON spare_parts_product_reviews(review_id);
CREATE INDEX IF NOT EXISTS idx_spare_parts_product_reviews_product_id ON spare_parts_product_reviews(product_id);

-- Wishlist
CREATE TABLE IF NOT EXISTS spare_parts_wishlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES spare_parts_products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_wishlist_user_id ON spare_parts_wishlist(user_id);

-- ============================================================
-- SEED: 10 initial spare parts categories
-- ============================================================
INSERT INTO spare_parts_categories (name, description, is_active, sort_order) VALUES
  ('All Parts',     'Browse all spare parts categories',          true, 0),
  ('Battery',       'Car batteries and charging systems',         true, 1),
  ('Brakes',        'Brake pads, rotors, callipers and fluids',   true, 2),
  ('Tyres',         'Car and truck tyres of all sizes',           true, 3),
  ('Suspension',    'Shock absorbers, springs and linkages',      true, 4),
  ('Engine Parts',  'Engine components and assemblies',           true, 5),
  ('Electrical',    'Wiring, sensors, alternators and starters',  true, 6),
  ('Body Parts',    'Doors, bumpers, bonnets and body panels',    true, 7),
  ('Filters',       'Oil, air, fuel and cabin air filters',       true, 8),
  ('Transmission',  'Gearbox, clutch and drivetrain components',  true, 9)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VENDOR CUSTOM CATEGORIES — ALTER TABLE
-- Run this in Supabase SQL Editor after the initial migration
-- ============================================================

-- Add store_id column to spare_parts_categories
-- null  = global category (admin-managed, visible to all stores)
-- value = vendor-custom category (only visible to that store)
ALTER TABLE spare_parts_categories
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES spare_parts_stores(id) ON DELETE CASCADE;

-- Index for fast lookup of a store's custom categories
CREATE INDEX IF NOT EXISTS idx_spare_parts_categories_store_id
  ON spare_parts_categories(store_id);
