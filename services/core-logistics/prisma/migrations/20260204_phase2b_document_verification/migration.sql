-- Phase 2B: Document Verification Workflow Migration
-- Adds document versioning, admin reviews, and OCR data

BEGIN;

-- Add version tracking to driver_documents
ALTER TABLE driver_documents 
ADD COLUMN version_number INTEGER DEFAULT 1,
ADD COLUMN parent_document_id UUID REFERENCES driver_documents(id),
ADD COLUMN is_current_version BOOLEAN DEFAULT true,
ADD COLUMN replaced_at TIMESTAMPTZ,
ADD COLUMN replacement_reason TEXT,
ADD COLUMN file_path TEXT, -- For storage path tracking
ADD COLUMN ocr_data JSONB DEFAULT '{}', -- For extracted text data
ADD COLUMN extracted_text TEXT, -- For searchable text
ADD COLUMN expiry_date_extracted DATE, -- OCR extracted expiry
ADD COLUMN validation_errors JSONB DEFAULT '[]'; -- Validation issues

-- Create indexes for version tracking
CREATE INDEX idx_driver_documents_version ON driver_documents(driver_id, document_type, version_number);
CREATE INDEX idx_driver_documents_current ON driver_documents(driver_id, document_type, is_current_version) WHERE is_current_version = true;
CREATE INDEX idx_driver_documents_parent ON driver_documents(parent_document_id);
CREATE INDEX idx_driver_documents_expiry ON driver_documents(expiry_date_extracted) WHERE expiry_date_extracted IS NOT NULL;

-- Create document_reviews table for admin actions
CREATE TABLE document_reviews (
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

-- Create indexes for document_reviews
CREATE INDEX idx_document_reviews_document ON document_reviews(document_id);
CREATE INDEX idx_document_reviews_reviewer ON document_reviews(reviewer_id);
CREATE INDEX idx_document_reviews_status ON document_reviews(status);
CREATE INDEX idx_document_reviews_action ON document_reviews(action);
CREATE INDEX idx_document_reviews_priority ON document_reviews(priority);
CREATE INDEX idx_document_reviews_created ON document_reviews(created_at);

-- Create document_notifications table for email tracking
CREATE TABLE document_notifications (
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

-- Create indexes for document_notifications
CREATE INDEX idx_document_notifications_document ON document_notifications(document_id);
CREATE INDEX idx_document_notifications_user ON document_notifications(user_id);
CREATE INDEX idx_document_notifications_type ON document_notifications(notification_type);
CREATE INDEX idx_document_notifications_email_sent ON document_notifications(email_sent);
CREATE INDEX idx_document_notifications_created ON document_notifications(created_at);

-- Update existing documents to have version 1 and current version flag
UPDATE driver_documents 
SET version_number = 1, is_current_version = true 
WHERE version_number IS NULL;

-- Add session_id column if it doesn't exist (for registration documents)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_documents' AND column_name = 'session_id') THEN
        ALTER TABLE driver_documents ADD COLUMN session_id UUID REFERENCES driver_registration_sessions(id);
        CREATE INDEX idx_driver_documents_session ON driver_documents(session_id);
    END IF;
END $$;

COMMIT;