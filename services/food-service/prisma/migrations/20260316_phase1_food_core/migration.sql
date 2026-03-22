-- ============================================================
-- Phase 1: Food Service Core Tables
-- ============================================================

-- Food categories (global, admin-managed)
CREATE TABLE IF NOT EXISTS food_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restaurants / Vendors
-- Designed for one user = one restaurant now, but owner_id is indexed
-- and restaurant_members table allows easy migration to multi-restaurant later
CREATE TABLE IF NOT EXISTS food_restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,                          -- references auth users.id
  name VARCHAR(200) NOT NULL,
  description TEXT,
  cuisine_types TEXT[] NOT NULL DEFAULT '{}',      -- e.g. ['Nigerian', 'Chinese']
  logo_url TEXT,
  banner_url TEXT,
  address TEXT NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_open BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  average_rating DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
  total_ratings INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  -- Operating hours stored as JSONB for flexibility
  -- { "monday": { "open": "08:00", "close": "22:00", "is_closed": false }, ... }
  operating_hours JSONB NOT NULL DEFAULT '{}',
  -- Delivery settings
  auto_accept_orders BOOLEAN NOT NULL DEFAULT false,
  estimated_prep_time_minutes INTEGER NOT NULL DEFAULT 20,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id)  -- one user = one restaurant (Phase 1); drop this constraint when scaling
);

-- Future-proofing: restaurant members table (for multi-restaurant support later)
-- owner_id on food_restaurants + this table = easy migration path
CREATE TABLE IF NOT EXISTS food_restaurant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'owner',       -- owner | manager | staff
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, user_id)
);

-- Menu categories (per restaurant)
CREATE TABLE IF NOT EXISTS food_menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Menu items
CREATE TABLE IF NOT EXISTS food_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES food_menu_categories(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_available BOOLEAN NOT NULL DEFAULT true,
  stock_quantity INTEGER,                          -- NULL = unlimited
  preparation_time_minutes INTEGER,
  nutritional_info JSONB,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Item extras / add-ons
CREATE TABLE IF NOT EXISTS food_item_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link extras to menu items (many-to-many)
CREATE TABLE IF NOT EXISTS food_menu_item_extras (
  item_id UUID NOT NULL REFERENCES food_menu_items(id) ON DELETE CASCADE,
  extra_id UUID NOT NULL REFERENCES food_item_extras(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (item_id, extra_id)
);

-- Food fare configuration (per vehicle type, admin-managed)
CREATE TABLE IF NOT EXISTS food_fare_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type VARCHAR(50) NOT NULL,               -- motorcycle | car | bicycle
  price_per_km DECIMAL(10, 2) NOT NULL,
  minimum_delivery_fee DECIMAL(10, 2) NOT NULL,
  service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  rounding_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'NGN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vehicle_type)
);

-- Carts (one active cart per user per restaurant)
CREATE TABLE IF NOT EXISTS food_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, restaurant_id)
);

-- Cart items
CREATE TABLE IF NOT EXISTS food_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES food_carts(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES food_menu_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_extras UUID[] NOT NULL DEFAULT '{}',    -- array of extra IDs
  special_instructions TEXT,
  unit_price DECIMAL(10, 2) NOT NULL,              -- snapshot at time of add
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS food_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES food_restaurants(id),
  courier_id UUID,                                 -- references drivers.id in core-logistics DB
  -- Status flow: pending → accepted → preparing → ready_for_pickup → picked_up → delivered
  -- Terminal: cancelled | rejected | courier_not_found
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(20) NOT NULL DEFAULT 'wallet',  -- wallet | card | cash
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid | refunded | failed
  -- Fare breakdown
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  rounding_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10, 2) NOT NULL,
  -- Delivery details
  delivery_address JSONB NOT NULL,                 -- { address, lat, lng, instructions }
  special_instructions TEXT,
  -- Timing
  estimated_prep_time_minutes INTEGER,
  estimated_delivery_time_minutes INTEGER,
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  -- Payment tracking
  wallet_transaction_id TEXT,
  wallet_balance_before DECIMAL(10, 2),
  wallet_balance_after DECIMAL(10, 2),
  -- Auth codes (Phase 3)
  pickup_code VARCHAR(6),
  delivery_code VARCHAR(6),
  -- Rejection / cancellation
  rejection_reason TEXT,
  cancellation_reason TEXT,
  cancelled_by VARCHAR(20),                        -- customer | vendor | system
  -- Re-queuing tracking
  excluded_courier_ids UUID[] NOT NULL DEFAULT '{}',
  courier_search_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items (snapshot at time of order)
CREATE TABLE IF NOT EXISTS food_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES food_menu_items(id),
  item_name VARCHAR(200) NOT NULL,                 -- snapshot
  item_price DECIMAL(10, 2) NOT NULL,              -- snapshot
  quantity INTEGER NOT NULL DEFAULT 1,
  selected_extras JSONB NOT NULL DEFAULT '[]',     -- snapshot: [{ id, name, price }]
  special_instructions TEXT,
  subtotal DECIMAL(10, 2) NOT NULL
);

-- Order status history (audit trail)
CREATE TABLE IF NOT EXISTS food_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  previous_status VARCHAR(50),
  changed_by UUID,
  changed_by_role VARCHAR(20),                     -- customer | vendor | courier | system
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_food_restaurants_owner ON food_restaurants(owner_id);
CREATE INDEX IF NOT EXISTS idx_food_restaurants_location ON food_restaurants(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_food_restaurants_is_open ON food_restaurants(is_open, is_active);
CREATE INDEX IF NOT EXISTS idx_food_menu_items_restaurant ON food_menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_menu_items_category ON food_menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_food_carts_user ON food_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_food_cart_items_cart ON food_cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_customer ON food_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_restaurant ON food_orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_courier ON food_orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_status ON food_orders(status);
CREATE INDEX IF NOT EXISTS idx_food_order_items_order ON food_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_food_order_status_history_order ON food_order_status_history(order_id);

-- ============================================================
-- Seed default fare config
-- ============================================================
INSERT INTO food_fare_config (vehicle_type, price_per_km, minimum_delivery_fee, service_fee, rounding_fee)
VALUES
  ('motorcycle', 100.00, 300.00, 50.00, 0.00),
  ('car',        150.00, 500.00, 100.00, 0.00),
  ('bicycle',    70.00,  200.00, 30.00, 0.00)
ON CONFLICT (vehicle_type) DO NOTHING;

-- Seed default food categories
INSERT INTO food_categories (name, description, sort_order)
VALUES
  ('Nigerian', 'Local Nigerian dishes', 1),
  ('Fast Food', 'Burgers, fries, and more', 2),
  ('Chinese', 'Chinese cuisine', 3),
  ('Pizza', 'Pizzas and Italian', 4),
  ('Shawarma', 'Shawarma and wraps', 5),
  ('Drinks', 'Beverages and drinks', 6),
  ('Desserts', 'Cakes, ice cream, and sweets', 7),
  ('Healthy', 'Salads and healthy options', 8)
ON CONFLICT DO NOTHING;
