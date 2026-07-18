-- ================================================================
-- Support & Disputes v5 — Final clean fix
-- The problem: support_messages has rows with chat_id values that
-- reference old support_tickets UUIDs not yet in support_chats.
-- Strategy: ensure every unique chat_id in support_messages has a
-- matching row in support_chats, then add the FK.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Drop the broken FK if it exists from a previous attempt
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS support_messages_ticket_id_fkey,
  DROP CONSTRAINT IF EXISTS support_messages_chat_id_fkey;

-- ----------------------------------------------------------------
-- 2. Ensure disputes exist for every ticket referenced by messages
--    (some tickets may not have been migrated yet)
-- ----------------------------------------------------------------
INSERT INTO disputes (id, customer_id, issue_type, title, description, status, priority)
SELECT DISTINCT
  st.id,
  st.user_id,
  COALESCE(st.complaint_type, 'others'),
  COALESCE(st.title, 'Support Request'),
  COALESCE(st.description, ''),
  COALESCE(st.status, 'pending'),
  'medium'
FROM support_tickets st
WHERE st.id IN (SELECT DISTINCT chat_id FROM support_messages)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 3. Ensure a support_chats row exists for every unique chat_id
--    that appears in support_messages (reuse same UUID as chat id)
-- ----------------------------------------------------------------

-- First clear partial chats from previous failed runs
DELETE FROM support_chats WHERE type = 'dispute';

-- Insert one chat row per dispute, reusing the dispute UUID
-- so existing support_messages.chat_id values point to it
INSERT INTO support_chats (id, customer_id, type, dispute_id)
SELECT d.id, d.customer_id, 'dispute', d.id
FROM disputes d
ON CONFLICT (id) DO NOTHING;

-- Also cover any chat_id in support_messages that has NO matching
-- dispute at all (edge case: message orphaned from deleted ticket)
INSERT INTO support_chats (id, customer_id, type, dispute_id)
SELECT DISTINCT
  sm.chat_id,
  '00000000-0000-0000-0000-000000000000'::uuid,  -- unknown customer placeholder
  'dispute',
  NULL::uuid
FROM support_messages sm
WHERE sm.chat_id NOT IN (SELECT id FROM support_chats)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. Now add the FK — all chat_id values are covered
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_chat_id_fkey
  FOREIGN KEY (chat_id) REFERENCES support_chats(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- 5. Add missing columns to support_messages
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------
-- 6. Triggers
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
