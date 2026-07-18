-- ================================================================
-- Support & Disputes v3
-- Assumes:
--   - support_tickets   exists (old table)
--   - support_messages  exists with chat_id column (renamed from ticket_id)
--   - disputes          may or may not exist
--   - support_chats     may or may not exist
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Drop the old FK on support_messages.chat_id
--    (currently points to support_tickets — we need it pointing to support_chats)
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS support_messages_ticket_id_fkey,
  DROP CONSTRAINT IF EXISTS support_messages_chat_id_fkey;

-- ----------------------------------------------------------------
-- 2. Create disputes table (replaces support_tickets)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID         NOT NULL,
  issue_type      VARCHAR(50)  NOT NULL DEFAULT 'others',
  title           VARCHAR(100) NOT NULL,
  description     TEXT         NOT NULL DEFAULT '',
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  priority        VARCHAR(10)  NOT NULL DEFAULT 'medium',
  photo_urls      TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  reference_id    UUID,
  reference_type  VARCHAR(20),
  assigned_to     UUID,
  resolved_at     TIMESTAMP WITH TIME ZONE,
  resolution_note TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_customer_id ON disputes(customer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status      ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_priority    ON disputes(priority);
CREATE INDEX IF NOT EXISTS idx_disputes_issue_type  ON disputes(issue_type);
CREATE INDEX IF NOT EXISTS idx_disputes_created_at  ON disputes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_assigned_to ON disputes(assigned_to);

-- ----------------------------------------------------------------
-- 3. Migrate old support_tickets data into disputes
-- ----------------------------------------------------------------
INSERT INTO disputes (
  id, customer_id, issue_type, title, description,
  status, priority, photo_urls, created_at, updated_at
)
SELECT
  id,
  user_id,
  COALESCE(complaint_type, 'others'),
  COALESCE(title, 'Support Request'),
  COALESCE(description, ''),
  COALESCE(status, 'pending'),
  'medium',
  ARRAY[]::TEXT[],
  created_at,
  updated_at
FROM support_tickets
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. Create support_chats table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_chats (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID        NOT NULL,
  type        VARCHAR(10) NOT NULL DEFAULT 'general',
  dispute_id  UUID        REFERENCES disputes(id) ON DELETE CASCADE,
  is_open     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_chats_customer_id ON support_chats(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_chats_dispute_id  ON support_chats(dispute_id);
CREATE INDEX IF NOT EXISTS idx_support_chats_type        ON support_chats(type);
CREATE INDEX IF NOT EXISTS idx_support_chats_is_open     ON support_chats(is_open);

-- One open general chat per customer
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_open_general_chat_per_customer
  ON support_chats(customer_id)
  WHERE type = 'general' AND is_open = true;

-- One chat thread per dispute
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_chat_per_dispute
  ON support_chats(dispute_id)
  WHERE dispute_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 5. For every dispute, create a matching support_chat row
--    (using the dispute id as the chat id so old message chat_id
--     values still match after we re-point the FK)
-- ----------------------------------------------------------------
INSERT INTO support_chats (id, customer_id, type, dispute_id)
SELECT
  d.id,          -- reuse the dispute UUID as the chat UUID
  d.customer_id,
  'dispute',
  d.id
FROM disputes d
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 6. Add the correct FK: support_messages.chat_id → support_chats.id
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_chat_id_fkey
  FOREIGN KEY (chat_id) REFERENCES support_chats(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- 7. Add missing columns to support_messages if not present
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS is_read        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- ----------------------------------------------------------------
-- 8. updated_at triggers
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_support_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_disputes_updated_at ON disputes;
CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_support_updated_at();

DROP TRIGGER IF EXISTS trg_support_chats_updated_at ON support_chats;
CREATE TRIGGER trg_support_chats_updated_at
  BEFORE UPDATE ON support_chats
  FOR EACH ROW EXECUTE FUNCTION update_support_updated_at();

-- ----------------------------------------------------------------
-- 9. Bump chat updated_at when a new message arrives
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION bump_chat_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_chats SET updated_at = NOW() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_chat_on_message ON support_messages;
CREATE TRIGGER trg_bump_chat_on_message
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION bump_chat_on_message();
