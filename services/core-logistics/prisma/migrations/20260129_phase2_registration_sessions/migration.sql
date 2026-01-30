-- Phase 2: Multi-Step Registration Sessions Migration

-- Create driver_registration_sessions table
CREATE TABLE IF NOT EXISTS "driver_registration_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "vehicle_type" VARCHAR(50) NOT NULL,
    "service_types" TEXT[] NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'initiated',
    "progress_percentage" INTEGER NOT NULL DEFAULT 0,
    "current_step" VARCHAR(30) NOT NULL DEFAULT 'personal_info',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Step completion tracking
    "personal_info_completed_at" TIMESTAMPTZ(6),
    "vehicle_details_completed_at" TIMESTAMPTZ(6),
    "documents_completed_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),

    -- Step data (JSON for flexibility)
    "personal_info_data" JSONB,
    "vehicle_details_data" JSONB,
    "documents_data" JSONB,

    -- Metadata
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "driver_registration_sessions_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_user_id_idx" ON "driver_registration_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_status_idx" ON "driver_registration_sessions"("status");
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_expires_at_idx" ON "driver_registration_sessions"("expires_at");
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_created_at_idx" ON "driver_registration_sessions"("created_at");

-- Create unique constraint to prevent multiple active sessions per user
CREATE UNIQUE INDEX IF NOT EXISTS "driver_registration_sessions_user_active_idx" 
ON "driver_registration_sessions"("user_id") 
WHERE "status" IN ('initiated', 'in_progress');

-- Add check constraints
ALTER TABLE "driver_registration_sessions" ADD CONSTRAINT "driver_registration_sessions_status_check" 
CHECK ("status" IN ('initiated', 'in_progress', 'completed', 'expired', 'cancelled'));

ALTER TABLE "driver_registration_sessions" ADD CONSTRAINT "driver_registration_sessions_current_step_check" 
CHECK ("current_step" IN ('personal_info', 'vehicle_details', 'documents', 'review', 'completed'));

ALTER TABLE "driver_registration_sessions" ADD CONSTRAINT "driver_registration_sessions_progress_check" 
CHECK ("progress_percentage" >= 0 AND "progress_percentage" <= 100);

-- Add foreign key constraint to users table (assuming it exists in auth service)
-- Note: This will be a soft reference since users are in auth service
-- ALTER TABLE "driver_registration_sessions" ADD CONSTRAINT "driver_registration_sessions_user_id_fkey" 
-- FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_driver_registration_sessions_updated_at 
    BEFORE UPDATE ON "driver_registration_sessions" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();