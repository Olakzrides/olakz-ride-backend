-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "base_fare_per_km" DECIMAL(10,2) NOT NULL,
    "base_fare_per_minute" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimum_fare" DECIMAL(10,2) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(100) NOT NULL,
    "handle" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "thumbnail_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "vehicle_type_id" UUID NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "sku" VARCHAR(50) NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "price_per_km" DECIMAL(10,2) NOT NULL,
    "price_per_minute" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimum_fare" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "sales_channel_id" UUID NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "pickup_latitude" DECIMAL(10,8) NOT NULL,
    "pickup_longitude" DECIMAL(11,8) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "dropoff_latitude" DECIMAL(10,8),
    "dropoff_longitude" DECIMAL(11,8),
    "dropoff_address" TEXT,
    "passengers" INTEGER NOT NULL DEFAULT 1,
    "search_radius" INTEGER NOT NULL DEFAULT 10,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID,
    "user_id" UUID NOT NULL,
    "driver_id" UUID,
    "variant_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'searching',
    "pickup_latitude" DECIMAL(10,8) NOT NULL,
    "pickup_longitude" DECIMAL(11,8) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "dropoff_latitude" DECIMAL(10,8),
    "dropoff_longitude" DECIMAL(11,8),
    "dropoff_address" TEXT,
    "estimated_distance" DECIMAL(8,2),
    "estimated_duration" INTEGER,
    "actual_distance" DECIMAL(8,2),
    "actual_duration" INTEGER,
    "estimated_fare" DECIMAL(10,2) NOT NULL,
    "final_fare" DECIMAL(10,2),
    "payment_method" VARCHAR(20) NOT NULL DEFAULT 'wallet',
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "driver_rating" INTEGER,
    "driver_feedback" TEXT,
    "passenger_rating" INTEGER,
    "passenger_feedback" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "ride_id" UUID,
    "transaction_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reference" VARCHAR(100),
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regions_is_active_idx" ON "regions"("is_active");

-- CreateIndex
CREATE INDEX "regions_country_code_idx" ON "regions"("country_code");

-- CreateIndex
CREATE INDEX "vehicle_types_is_active_idx" ON "vehicle_types"("is_active");

-- CreateIndex
CREATE INDEX "vehicle_types_name_idx" ON "vehicle_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ride_products_handle_key" ON "ride_products"("handle");

-- CreateIndex
CREATE INDEX "ride_products_handle_idx" ON "ride_products"("handle");

-- CreateIndex
CREATE INDEX "ride_products_is_active_idx" ON "ride_products"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ride_variants_sku_key" ON "ride_variants"("sku");

-- CreateIndex
CREATE INDEX "ride_variants_product_id_idx" ON "ride_variants"("product_id");

-- CreateIndex
CREATE INDEX "ride_variants_vehicle_type_id_idx" ON "ride_variants"("vehicle_type_id");

-- CreateIndex
CREATE INDEX "ride_variants_is_active_idx" ON "ride_variants"("is_active");

-- CreateIndex
CREATE INDEX "ride_variants_sku_idx" ON "ride_variants"("sku");

-- CreateIndex
CREATE INDEX "ride_carts_user_id_idx" ON "ride_carts"("user_id");

-- CreateIndex
CREATE INDEX "ride_carts_status_idx" ON "ride_carts"("status");

-- CreateIndex
CREATE INDEX "ride_carts_created_at_idx" ON "ride_carts"("created_at");

-- CreateIndex
CREATE INDEX "cart_line_items_cart_id_idx" ON "cart_line_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_line_items_variant_id_idx" ON "cart_line_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_line_items_cart_id_variant_id_key" ON "cart_line_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "rides_user_id_idx" ON "rides"("user_id");

-- CreateIndex
CREATE INDEX "rides_driver_id_idx" ON "rides"("driver_id");

-- CreateIndex
CREATE INDEX "rides_status_idx" ON "rides"("status");

-- CreateIndex
CREATE INDEX "rides_created_at_idx" ON "rides"("created_at");

-- CreateIndex
CREATE INDEX "rides_status_created_at_idx" ON "rides"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_reference_key" ON "wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_idx" ON "wallet_transactions"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_ride_id_idx" ON "wallet_transactions"("ride_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_transaction_type_idx" ON "wallet_transactions"("transaction_type");

-- CreateIndex
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions"("status");

-- CreateIndex
CREATE INDEX "wallet_transactions_reference_idx" ON "wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_transaction_type_status_idx" ON "wallet_transactions"("user_id", "transaction_type", "status");

-- AddForeignKey
ALTER TABLE "ride_variants" ADD CONSTRAINT "ride_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ride_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_variants" ADD CONSTRAINT "ride_variants_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_carts" ADD CONSTRAINT "ride_carts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line_items" ADD CONSTRAINT "cart_line_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "ride_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line_items" ADD CONSTRAINT "cart_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ride_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "ride_carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "ride_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
