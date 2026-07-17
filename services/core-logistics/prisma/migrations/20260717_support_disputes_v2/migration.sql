-- ================================================================
-- Support & Disputes v2 — Remediation migration
-- Fixes conflict with existing support_tickets / support_messages
-- tables created by auth-service phase4 migration.
-- Run this in Supabase SQL Editor.
-- ================================================================

-- ----------------------------------------------------------------
-- STEP 1: Rename old tables out of the way (keep data safe)
-- ----------------------------------------------------------------
ALTER TABLE IF EXISTS support_messages RENAME TO support_messages_legacy;
ALTER TABLE IF EXISTS support_tickets  RENAME TO support_tickets_legacy;

-- ----------------------------------------------------------------
-- STEP 2: Create disputes table (replaces support_tickets)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID         NOT NULL,
  issue_type      VARCHAR(50)  NOT NULL,
  title           VARCHAR(100) NOT NULL,
  description     TEXT         NOT NULL,
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
-- STEP 3: Migrate old support_tickets data into disputes
-- ----------------------------------------------------------------
INSERT INTO disputes (
  id, customer_id, issue_type, title, description,
  status, priority, photo_urls, created_at, updated_at
)
SELECT
  id,
  user_id,
  COALESCE(complaint_type, 'others'),
  title,
  COALESCE(description, ''),
  COALESCE(status, 'pending'),
  'medium',
  ARRAY[]::TEXT[],
  created_at,
  updated_at
FROM support_tickets_legacy
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- STEP 4: Create support_chats table
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
-- STEP 5: Auto-create a dispute chat for every migrated dispute
-- ----------------------------------------------------------------
INSERT INTO support_chats (customer_id, type, dispute_id)
SELECT customer_id, 'dispute', id
FROM disputes
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- STEP 6: Create the new support_messages table (clean schema)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id        UUID        NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
  sender_id      UUID        NOT NULL,
  sender_type    VARCHAR(10) NOT NULL,
  message        TEXT,
  attachment_url TEXT,
  is_read        BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_chat_id   ON support_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_chat_time ON support_messages(chat_id, created_at ASC);

-- ----------------------------------------------------------------
-- STEP 7: Migrate old messages into the new table
--         Map ticket_id → chat_id via the dispute→chat join
-- ----------------------------------------------------------------
INSERT INTO support_messages (
  id, chat_id, sender_id, sender_type, message, attachment_url, is_read, created_at
)
SELECT
  lm.id,
  sc.id,           -- look up the support_chat for this dispute
  lm.sender_id,
  lm.sender_type,
  lm.message,
  lm.attachment_url,
  false,
  lm.created_at
FROM support_messages_legacy lm
JOIN support_chats sc ON sc.dispute_id = lm.ticket_id
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- STEP 8: updated_at triggers
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
-- STEP 9: Bump chat updated_at on new message
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
