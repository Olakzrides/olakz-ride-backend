-- CreateTable
CREATE TABLE IF NOT EXISTS "service_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serviceChannelId" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "thumbnail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_service_usages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "serviceChannelId" UUID NOT NULL,
    "sessionData" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_service_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "service_regions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serviceChannelId" UUID NOT NULL,
    "regionCode" TEXT NOT NULL,
    "regionName" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "service_analytics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serviceChannelId" UUID NOT NULL,
    "userId" UUID,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "service_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "service_channels_name_key" ON "service_channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "products_handle_key" ON "products"("handle");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "service_regions_serviceChannelId_regionCode_key" ON "service_regions"("serviceChannelId", "regionCode");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'products_serviceChannelId_fkey'
    ) THEN
        ALTER TABLE "products" ADD CONSTRAINT "products_serviceChannelId_fkey" FOREIGN KEY ("serviceChannelId") REFERENCES "service_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_service_usages_serviceChannelId_fkey'
    ) THEN
        ALTER TABLE "user_service_usages" ADD CONSTRAINT "user_service_usages_serviceChannelId_fkey" FOREIGN KEY ("serviceChannelId") REFERENCES "service_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'service_regions_serviceChannelId_fkey'
    ) THEN
        ALTER TABLE "service_regions" ADD CONSTRAINT "service_regions_serviceChannelId_fkey" FOREIGN KEY ("serviceChannelId") REFERENCES "service_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Update existing advertisements table if it exists
DO $$ BEGIN
    -- Add name column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'name') THEN
        ALTER TABLE "advertisements" ADD COLUMN "name" TEXT DEFAULT '';
    END IF;
    
    -- Add updatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'advertisements' AND column_name = 'updatedAt') THEN
        ALTER TABLE "advertisements" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;