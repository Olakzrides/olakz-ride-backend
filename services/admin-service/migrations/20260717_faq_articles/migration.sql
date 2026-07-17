-- ================================================================
-- FAQ System — Admin-managed Help Center articles
-- ================================================================

-- ----------------------------------------------------------------
-- 1. faq_categories
--    e.g. General, Account, Ordering, Payment
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faq_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'general', 'account'
  display_order INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_categories_is_active     ON faq_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_faq_categories_display_order ON faq_categories(display_order);

-- ----------------------------------------------------------------
-- 2. faq_articles
--    Individual Q&A items inside a category.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faq_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID NOT NULL REFERENCES faq_categories(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID,                           -- admin user id
  updated_by    UUID,                           -- admin user id
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_articles_category_id   ON faq_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_faq_articles_is_active     ON faq_articles(is_active);
CREATE INDEX IF NOT EXISTS idx_faq_articles_display_order ON faq_articles(category_id, display_order);

-- ----------------------------------------------------------------
-- 3. Auto-update updated_at triggers
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_faq_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faq_categories_updated_at ON faq_categories;
CREATE TRIGGER trg_faq_categories_updated_at
  BEFORE UPDATE ON faq_categories
  FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

DROP TRIGGER IF EXISTS trg_faq_articles_updated_at ON faq_articles;
CREATE TRIGGER trg_faq_articles_updated_at
  BEFORE UPDATE ON faq_articles
  FOR EACH ROW EXECUTE FUNCTION update_faq_updated_at();

-- ----------------------------------------------------------------
-- 4. Seed default categories
-- ----------------------------------------------------------------
INSERT INTO faq_categories (name, slug, display_order) VALUES
  ('General',  'general',  1),
  ('Account',  'account',  2),
  ('Ordering', 'ordering', 3),
  ('Payment',  'payment',  4),
  ('Safety',   'safety',   5)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------
-- 5. Seed starter FAQ articles
-- ----------------------------------------------------------------
INSERT INTO faq_articles (category_id, question, answer, display_order) VALUES
  (
    (SELECT id FROM faq_categories WHERE slug = 'account'),
    'How do I create a new account?',
    'Open the app and tap Register. Enter your phone number, email and full name, then verify the OTP sent to your phone. Once verified you are automatically logged in.',
    1
  ),
  (
    (SELECT id FROM faq_categories WHERE slug = 'account'),
    'I forgot my password. How do I reset it?',
    'On the login screen tap "Forgot Password", enter your registered email address, and follow the reset link sent to your inbox.',
    2
  ),
  (
    (SELECT id FROM faq_categories WHERE slug = 'account'),
    'I''m having trouble logging into my account. How can I resolve this?',
    'Ensure you are using the correct phone number or email. If the problem persists, use "Forgot Password" to reset your credentials or contact our support team.',
    3
  ),
  (
    (SELECT id FROM faq_categories WHERE slug = 'ordering'),
    'How do I place a new order?',
    'Tap the service you need (Ride, Delivery, etc.), enter your pickup and drop-off location, select a vehicle type and confirm your booking.',
    1
  ),
  (
    (SELECT id FROM faq_categories WHERE slug = 'payment'),
    'I''m experiencing issues with payment. How can I resolve them?',
    'Check that your wallet has sufficient balance or that your card details are correct. For unresolved payment issues please use the "Report Issue" button and select Payment Problem.',
    1
  ),
  (
    (SELECT id FROM faq_categories WHERE slug = 'ordering'),
    'I want to cancel an order I''ve placed. How can I do this?',
    'Open the active order screen and tap "Cancel Order". Note that cancellation fees may apply depending on how far the driver has travelled.',
    2
  ),
  (
    (SELECT id FROM faq_categories WHERE slug = 'general'),
    'Where can I find detailed information about a specific product?',
    'Go to Help Center and use the search bar or browse by category to find articles related to your question.',
    1
  )
ON CONFLICT DO NOTHING;
