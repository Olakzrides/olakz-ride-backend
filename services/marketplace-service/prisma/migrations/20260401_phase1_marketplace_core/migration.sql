-- Phase 1: Marketplace Core Tables

CREATE TABLE IF NOT EXISTS marketplace_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  description text,
  icon_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid UNIQUE NOT NULL,
  vendor_id uuid,
  name varchar(200) NOT NULL,
  description text,
  logo_url text,
  banner_url text,
  address text NOT NULL,
  city varchar(100),
  state varchar(100),
  latitude decimal(10,8) NOT NULL DEFAULT 0,
  longitude decimal(11,8) NOT NULL DEFAULT 0,
  phone varchar(20),
  email varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  is_open boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  average_rating decimal(3,2) NOT NULL DEFAULT 0.00,
  total_ratings int NOT NULL DEFAULT 0,
  total_orders int NOT NULL DEFAULT 0,
  operating_hours jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_store_categories (
  store_id uuid NOT NULL REFERENCES marketplace_stores(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES marketplace_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (store_id, category_id)
);

CREATE TABLE IF NOT EXISTS marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES marketplace_stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES marketplace_categories(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  description text,
  price decimal(10,2) NOT NULL,
  images text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  stock_quantity int,
  average_rating decimal(3,2) NOT NULL DEFAULT 0.00,
  total_ratings int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_fare_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type varchar(50) UNIQUE NOT NULL,
  price_per_km decimal(10,2) NOT NULL,
  minimum_delivery_fee decimal(10,2) NOT NULL,
  service_fee decimal(10,2) NOT NULL DEFAULT 0.00,
  currency_code varchar(10) NOT NULL DEFAULT 'NGN',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES marketplace_stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id)
);

CREATE TABLE IF NOT EXISTS marketplace_cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES marketplace_carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  unit_price decimal(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label varchar(50) NOT NULL,
  address text NOT NULL,
  city varchar(100),
  state varchar(100),
  latitude decimal(10,8),
  longitude decimal(11,8),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES marketplace_stores(id),
  rider_id uuid,
  status varchar(50) NOT NULL DEFAULT 'pending',
  payment_method varchar(20) NOT NULL DEFAULT 'wallet',
  payment_status varchar(20) NOT NULL DEFAULT 'pending',
  subtotal decimal(10,2) NOT NULL,
  delivery_fee decimal(10,2) NOT NULL DEFAULT 0.00,
  service_fee decimal(10,2) NOT NULL DEFAULT 0.00,
  total_amount decimal(10,2) NOT NULL,
  delivery_address jsonb NOT NULL,
  special_instructions text,
  wallet_transaction_id text,
  wallet_balance_before decimal(10,2),
  wallet_balance_after decimal(10,2),
  cancellation_reason text,
  cancelled_by varchar(20),
  rejection_reason text,
  excluded_rider_ids uuid[] NOT NULL DEFAULT '{}',
  rider_search_attempts int NOT NULL DEFAULT 0,
  accepted_at timestamptz,
  ready_at timestamptz,
  shipped_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES marketplace_products(id),
  product_name varchar(200) NOT NULL,
  product_price decimal(10,2) NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  subtotal decimal(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  status varchar(50) NOT NULL,
  previous_status varchar(50),
  changed_by uuid,
  changed_by_role varchar(20),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_stores_owner ON marketplace_stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_store ON marketplace_products(store_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON marketplace_products(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_carts_user ON marketplace_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_customer ON marketplace_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_store ON marketplace_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status ON marketplace_orders(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_saved_addresses_user ON marketplace_saved_addresses(user_id);

-- Seed default fare config
INSERT INTO marketplace_fare_config (vehicle_type, price_per_km, minimum_delivery_fee, service_fee)
VALUES ('motorcycle', 150, 300, 50)
ON CONFLICT (vehicle_type) DO NOTHING;

-- Seed default categories
INSERT INTO marketplace_categories (name, icon_url, sort_order) VALUES
  ('Phones', null, 1),
  ('Electronics', null, 2),
  ('Fashion', null, 3),
  ('Groceries', null, 4),
  ('Laptops', null, 5),
  ('Cars', null, 6),
  ('Computers', null, 7),
  ('Home & Living', null, 8)
ON CONFLICT DO NOTHING;
