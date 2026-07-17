-- ================================================================
-- Support & Disputes v4 — Final targeted fix
-- Current DB state:
--   support_messages  → has chat_id column (already renamed) ✅
--   support_chats     → already created ✅ (has uq_one_chat_per_dispute)
--   disputes          → already created ✅
--   support_tickets   → old table, still exists
-- Problem: duplicate key on uq_one_chat_per_dispute because v3
--   inserted some rows then failed, leaving partial data.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Clear any partial support_chats rows that were inserted
--    during the failed v3 run, then re-insert cleanly
-- ----------------------------------------------------------------
DELETE FROM support_chats WHERE type = 'dispute';

-- Re-insert one chat per dispute (reuse dispute UUID as chat UUID
-- so existing support_messages.chat_id values still match)
INSERT INTO support_chats (id, customer_id, type, dispute_id)
SELECT d.id, d.customer_id, 'dispute', d.id
FROM disputes d
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. Drop broken FK and re-add pointing to support_chats
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS support_messages_ticket_id_fkey,
  DROP CONSTRAINT IF EXISTS support_messages_chat_id_fkey;

ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_chat_id_fkey
  FOREIGN KEY (chat_id) REFERENCES support_chats(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- 3. Add missing columns to support_messages
-- ----------------------------------------------------------------
ALTER TABLE support_messages
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------------
-- 4. updated_at triggers (safe to re-run)
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
-- 5. Bump chat updated_at on new message
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
