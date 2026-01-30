-- Phase 1: Service Architecture Migration (Corrected)
-- Only add what's missing based on database state check

-- Create service_types table (missing)
CREATE TABLE IF NOT EXISTS "service_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- Create vehicle_service_capabilities table (missing)
CREATE TABLE IF NOT EXISTS "vehicle_service_capabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_type_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_service_capabilities_pkey" PRIMARY KEY ("id")
);

-- Add display_name column to vehicle_types table (missing)
ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(100);

-- Update existing vehicle types with display names
UPDATE "vehicle_types" SET "display_name" = 
    CASE 
        WHEN "name" = 'car' THEN 'Car'
        WHEN "name" = 'motorcycle' THEN 'Motorcycle'
        WHEN "name" = 'bicycle' THEN 'Bicycle'
        WHEN "name" = 'truck' THEN 'Truck'
        WHEN "name" = 'bus' THEN 'Bus'
        WHEN "name" = 'minibus' THEN 'Minibus'
        ELSE INITCAP("name")
    END
WHERE "display_name" IS NULL;

-- Update requirements for bicycle (should not require license/insurance/registration)
UPDATE "vehicle_types" SET 
    "license_required" = false,
    "insurance_required" = false,
    "registration_required" = false
WHERE "name" = 'bicycle';

-- Create unique constraints and indexes
CREATE UNIQUE INDEX IF NOT EXISTS "service_types_name_key" ON "service_types"("name");
CREATE INDEX IF NOT EXISTS "service_types_is_active_idx" ON "service_types"("is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_service_capabilities_vehicle_type_id_service_type_id_key" 
ON "vehicle_service_capabilities"("vehicle_type_id", "service_type_id");
CREATE INDEX IF NOT EXISTS "vehicle_service_capabilities_vehicle_type_id_idx" ON "vehicle_service_capabilities"("vehicle_type_id");
CREATE INDEX IF NOT EXISTS "vehicle_service_capabilities_service_type_id_idx" ON "vehicle_service_capabilities"("service_type_id");

-- Add foreign key constraints
ALTER TABLE "vehicle_service_capabilities" ADD CONSTRAINT "vehicle_service_capabilities_vehicle_type_id_fkey" 
FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_service_capabilities" ADD CONSTRAINT "vehicle_service_capabilities_service_type_id_fkey" 
FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert service types (with conflict handling)
INSERT INTO "service_types" ("name", "display_name", "description") VALUES
('ride', 'Ride', 'Passenger transportation service'),
('delivery', 'Delivery', 'Package and food delivery service')
ON CONFLICT (name) DO NOTHING;

-- Insert vehicle-service capabilities based on frontend requirements
-- Cars: Both ride and delivery
INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
SELECT vt.id, st.id 
FROM "vehicle_types" vt, "service_types" st 
WHERE vt.name = 'car'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- Motorcycles: Delivery only
INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
SELECT vt.id, st.id 
FROM "vehicle_types" vt, "service_types" st 
WHERE vt.name = 'motorcycle' AND st.name = 'delivery'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- Bicycles: Delivery only
INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
SELECT vt.id, st.id 
FROM "vehicle_types" vt, "service_types" st 
WHERE vt.name = 'bicycle' AND st.name = 'delivery'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- Trucks: Delivery only (if exists)
INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
SELECT vt.id, st.id 
FROM "vehicle_types" vt, "service_types" st 
WHERE vt.name = 'truck' AND st.name = 'delivery'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- Buses: Ride only (if exists)
INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
SELECT vt.id, st.id 
FROM "vehicle_types" vt, "service_types" st 
WHERE vt.name = 'bus' AND st.name = 'ride'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;

-- Minibus: Both ride and delivery (if exists)
INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
SELECT vt.id, st.id 
FROM "vehicle_types" vt, "service_types" st 
WHERE vt.name = 'minibus'
ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING;