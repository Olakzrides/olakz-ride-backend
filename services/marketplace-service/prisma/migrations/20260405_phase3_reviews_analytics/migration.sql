-- Phase 3: Reviews, Wishlist, Analytics & Admin

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES marketplace_stores(id) ON DELETE CASCADE,
  store_rating int NOT NULL CHECK (store_rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  product_rating int NOT NULL CHECK (product_rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS marketplace_wishlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES marketplace_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_store ON marketplace_reviews(store_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_customer ON marketplace_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_product_reviews_product ON marketplace_product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_wishlist_user ON marketplace_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_wishlist_product ON marketplace_wishlist(product_id);
