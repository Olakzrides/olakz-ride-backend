-- CreateTable: drivers
CREATE TABLE IF NOT EXISTS "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "license_number" VARCHAR(100) NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_rides" INTEGER NOT NULL DEFAULT 0,
    "total_earnings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: driver_vehicles
CREATE TABLE IF NOT EXISTS "driver_vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "plate_number" VARCHAR(50) NOT NULL,
    "manufacturer" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "color" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: driver_documents
CREATE TABLE IF NOT EXISTS "driver_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "document_type" VARCHAR(100) NOT NULL,
    "document_url" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "expiry_date" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: driver_availability
CREATE TABLE IF NOT EXISTS "driver_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable: driver_locations
CREATE TABLE IF NOT EXISTS "driver_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "heading" DECIMAL(5,2),
    "speed" DECIMAL(5,2),
    "accuracy" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "drivers_user_id_key" ON "drivers"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "drivers_license_number_key" ON "drivers"("license_number");
CREATE INDEX IF NOT EXISTS "drivers_user_id_idx" ON "drivers"("user_id");
CREATE INDEX IF NOT EXISTS "drivers_vehicle_type_id_idx" ON "drivers"("vehicle_type_id");
CREATE INDEX IF NOT EXISTS "drivers_status_idx" ON "drivers"("status");
CREATE INDEX IF NOT EXISTS "drivers_rating_idx" ON "drivers"("rating");
CREATE INDEX IF NOT EXISTS "drivers_created_at_idx" ON "drivers"("created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "driver_vehicles_plate_number_key" ON "driver_vehicles"("plate_number");
CREATE INDEX IF NOT EXISTS "driver_vehicles_driver_id_idx" ON "driver_vehicles"("driver_id");
CREATE INDEX IF NOT EXISTS "driver_vehicles_vehicle_type_id_idx" ON "driver_vehicles"("vehicle_type_id");
CREATE INDEX IF NOT EXISTS "driver_vehicles_is_active_idx" ON "driver_vehicles"("is_active");

CREATE INDEX IF NOT EXISTS "driver_documents_driver_id_idx" ON "driver_documents"("driver_id");
CREATE INDEX IF NOT EXISTS "driver_documents_document_type_idx" ON "driver_documents"("document_type");
CREATE INDEX IF NOT EXISTS "driver_documents_status_idx" ON "driver_documents"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "driver_availability_driver_id_key" ON "driver_availability"("driver_id");
CREATE INDEX IF NOT EXISTS "driver_availability_is_online_idx" ON "driver_availability"("is_online");
CREATE INDEX IF NOT EXISTS "driver_availability_is_available_idx" ON "driver_availability"("is_available");
CREATE INDEX IF NOT EXISTS "driver_availability_last_seen_at_idx" ON "driver_availability"("last_seen_at");

CREATE INDEX IF NOT EXISTS "driver_locations_driver_id_idx" ON "driver_locations"("driver_id");
CREATE INDEX IF NOT EXISTS "driver_locations_created_at_idx" ON "driver_locations"("created_at");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_vehicles" ADD CONSTRAINT "driver_vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_vehicles" ADD CONSTRAINT "driver_vehicles_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_availability" ADD CONSTRAINT "driver_availability_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add driver relation to rides table
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
