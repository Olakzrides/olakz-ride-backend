-- ================================================================
-- Support & Disputes System — Customer-facing tables
-- Run this entire script in Supabase SQL Editor
-- ================================================================

-- ----------------------------------------------------------------
-- 1. disputes
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL,
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
-- 2. support_chats
--    type = 'general'  → standalone Live Chat (dispute_id IS NULL)
--    type = 'dispute'  → embedded thread inside a dispute
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID         NOT NULL,
  type        VARCHAR(10)  NOT NULL DEFAULT 'general',
  dispute_id  UUID         REFERENCES disputes(id) ON DELETE CASCADE,
  is_open     BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_chats_customer_id ON support_chats(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_chats_dispute_id  ON support_chats(dispute_id);
CREATE INDEX IF NOT EXISTS idx_support_chats_type        ON support_chats(type);
CREATE INDEX IF NOT EXISTS idx_support_chats_is_open     ON support_chats(is_open);

-- One open general chat per customer (partial index instead of table constraint
-- so NULL dispute_id is handled correctly in all Postgres versions)
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_open_general_chat_per_customer
  ON support_chats(customer_id)
  WHERE type = 'general' AND is_open = true;

-- One chat thread per dispute
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_chat_per_dispute
  ON support_chats(dispute_id)
  WHERE dispute_id IS NOT NULL;

-- ----------------------------------------------------------------
-- 3. support_messages
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id        UUID        NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
  sender_id      UUID        NOT NULL,
  sender_type    VARCHAR(10) NOT NULL,   -- 'customer' | 'admin'
  message        TEXT,                  -- nullable when attachment only
  attachment_url TEXT,
  is_read        BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_chat_id    ON support_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id  ON support_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_chat_time  ON support_messages(chat_id, created_at ASC);

-- ----------------------------------------------------------------
-- 4. updated_at trigger function (shared)
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
-- 5. Bump chat updated_at whenever a new message arrives
--    (keeps admin inbox sorted by latest activity)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION bump_chat_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_chats
  SET    updated_at = NOW()
  WHERE  id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_chat_on_message ON support_messages;
CREATE TRIGGER trg_bump_chat_on_message
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION bump_chat_on_message();
