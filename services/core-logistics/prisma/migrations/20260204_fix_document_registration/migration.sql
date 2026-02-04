-- Migration: Fix document upload during registration
-- Make driver_id nullable and add session_id for registration process

-- Drop the foreign key constraint temporarily
ALTER TABLE "driver_documents" DROP CONSTRAINT IF EXISTS "driver_documents_driver_id_fkey";

-- Make driver_id nullable
ALTER TABLE "driver_documents" ALTER COLUMN "driver_id" DROP NOT NULL;

-- Add session_id column for registration process
ALTER TABLE "driver_documents" ADD COLUMN IF NOT EXISTS "session_id" UUID;

-- Add index for session_id
CREATE INDEX IF NOT EXISTS "driver_documents_session_id_idx" ON "driver_documents"("session_id");

-- Re-add the foreign key constraint (now allows NULL)
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_fkey" 
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add constraint to ensure either driver_id or session_id is present
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_or_session_check" 
    CHECK (("driver_id" IS NOT NULL) OR ("session_id" IS NOT NULL));