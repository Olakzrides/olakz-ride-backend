-- Phase 2B: Document Verification Workflow Migration
-- Adds document versioning, admin reviews, and OCR data
-- SAFE: Only adds new columns and tables, preserves existing data

BEGIN;

-- Add version tracking to driver_documents (only if columns don't exist)
DO $$ 
BEGIN
    -- Add version_number if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'version_number') THEN
        ALTER TABLE driver_documents ADD COLUMN version_number INTEGER DEFAULT 1;
    END IF;
    
    -- Add parent_document_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'parent_document_id') THEN
        ALTER TABLE driver_documents ADD COLUMN parent_document_id UUID REFERENCES driver_documents(id);
    END IF;
    
    -- Add is_current_version if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'is_current_version') THEN
        ALTER TABLE driver_documents ADD COLUMN is_current_version BOOLEAN DEFAULT true;
    END IF;
    
    -- Add replaced_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'replaced_at') THEN
        ALTER TABLE driver_documents ADD COLUMN replaced_at TIMESTAMPTZ;
    END IF;
    
    -- Add replacement_reason if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'replacement_reason') THEN
        ALTER TABLE driver_documents ADD COLUMN replacement_reason TEXT;
    END IF;
    
    -- Add file_path if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'file_path') THEN
        ALTER TABLE driver_documents ADD COLUMN file_path TEXT;
    END IF;
    
    -- Add ocr_data if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'ocr_data') THEN
        ALTER TABLE driver_documents ADD COLUMN ocr_data JSONB DEFAULT '{}';
    END IF;
    
    -- Add extracted_text if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'extracted_text') THEN
        ALTER TABLE driver_documents ADD COLUMN extracted_text TEXT;
    END IF;
    
    -- Add expiry_date_extracted if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'expiry_date_extracted') THEN
        ALTER TABLE driver_documents ADD COLUMN expiry_date_extracted DATE;
    END IF;
    
    -- Add validation_errors if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'validation_errors') THEN
        ALTER TABLE driver_documents ADD COLUMN validation_errors JSONB DEFAULT '[]';
    END IF;
    
    -- Add session_id if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'session_id') THEN
        ALTER TABLE driver_documents ADD COLUMN session_id UUID REFERENCES driver_registration_sessions(id);
    END IF;
END $$;

-- Create indexes for version tracking (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_documents_version') THEN
        CREATE INDEX idx_driver_documents_version ON driver_documents(driver_id, document_type, version_number);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_documents_current') THEN
        CREATE INDEX idx_driver_documents_current ON driver_documents(driver_id, document_type, is_current_version) WHERE is_current_version = true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_documents_parent') THEN
        CREATE INDEX idx_driver_documents_parent ON driver_documents(parent_document_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_documents_expiry') THEN
        CREATE INDEX idx_driver_documents_expiry ON driver_documents(expiry_date_extracted) WHERE expiry_date_extracted IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_driver_documents_session') THEN
        CREATE INDEX idx_driver_documents_session ON driver_documents(session_id);
    END IF;
END $$;

-- Create document_reviews table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS document_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES driver_documents(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL, -- Admin user ID
    action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'request_replacement')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    notes TEXT,
    rejection_reason TEXT,
    replacement_requested BOOLEAN DEFAULT false,
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    metadata JSONB DEFAULT '{}',
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for document_reviews (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_reviews_document') THEN
        CREATE INDEX idx_document_reviews_document ON document_reviews(document_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_reviews_reviewer') THEN
        CREATE INDEX idx_document_reviews_reviewer ON document_reviews(reviewer_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_reviews_status') THEN
        CREATE INDEX idx_document_reviews_status ON document_reviews(status);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_reviews_action') THEN
        CREATE INDEX idx_document_reviews_action ON document_reviews(action);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_reviews_priority') THEN
        CREATE INDEX idx_document_reviews_priority ON document_reviews(priority);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_reviews_created') THEN
        CREATE INDEX idx_document_reviews_created ON document_reviews(created_at);
    END IF;
END $$;

-- Create document_notifications table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS document_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES driver_documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- Driver user ID
    notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN ('document_approved', 'document_rejected', 'replacement_requested', 'review_pending')),
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    email_error TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for document_notifications (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_notifications_document') THEN
        CREATE INDEX idx_document_notifications_document ON document_notifications(document_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_notifications_user') THEN
        CREATE INDEX idx_document_notifications_user ON document_notifications(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_notifications_type') THEN
        CREATE INDEX idx_document_notifications_type ON document_notifications(notification_type);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_notifications_email_sent') THEN
        CREATE INDEX idx_document_notifications_email_sent ON document_notifications(email_sent);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_document_notifications_created') THEN
        CREATE INDEX idx_document_notifications_created ON document_notifications(created_at);
    END IF;
END $$;

-- Update existing documents to have version 1 and current version flag (safe update)
UPDATE driver_documents 
SET version_number = 1, is_current_version = true 
WHERE version_number IS NULL OR is_current_version IS NULL;

COMMIT;

-- Success message
SELECT 'Phase 2B migration completed successfully! All existing data preserved.' as result;