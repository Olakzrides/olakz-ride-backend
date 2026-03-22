-- Create vendors table for platform-wide vendor registration
CREATE TABLE IF NOT EXISTS vendors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE,
  business_name       VARCHAR(200) NOT NULL,
  business_type       VARCHAR(50) NOT NULL, -- restaurant, marketplace, carwash, mechanics
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(20) NOT NULL,
  gender              VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  address             TEXT,
  service_type        VARCHAR(100),

  -- Document / media URLs
  logo_url            TEXT,
  profile_picture_url TEXT,
  nin_number          VARCHAR(50),
  cac_document_url    TEXT,
  store_images        TEXT[] DEFAULT '{}',

  -- Verification
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  rejection_reason    TEXT,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,

  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_business_type ON vendors(business_type);
CREATE INDEX IF NOT EXISTS idx_vendors_verification_status ON vendors(verification_status);
CREATE INDEX IF NOT EXISTS idx_vendors_created_at ON vendors(created_at DESC);
