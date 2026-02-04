-- Migration: Add document access logging for audit trail and compliance

-- Create document access logs table
CREATE TABLE IF NOT EXISTS "document_access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "document_access_logs_document_id_idx" ON "document_access_logs"("document_id");
CREATE INDEX IF NOT EXISTS "document_access_logs_user_id_idx" ON "document_access_logs"("user_id");
CREATE INDEX IF NOT EXISTS "document_access_logs_action_idx" ON "document_access_logs"("action");
CREATE INDEX IF NOT EXISTS "document_access_logs_created_at_idx" ON "document_access_logs"("created_at");

-- Add foreign key constraints
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_document_id_fkey" 
    FOREIGN KEY ("document_id") REFERENCES "driver_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add data retention policy (optional - can be implemented via cron job)
COMMENT ON TABLE "document_access_logs" IS 'Audit trail for document access. Retention: 365 days';