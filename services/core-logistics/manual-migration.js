const { PrismaClient } = require('@prisma/client');

async function runManualMigration() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 Running manual Phase 1 migration...');

    // Step 1: Create service_types table
    console.log('📋 Creating service_types table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "service_types" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "name" VARCHAR(50) NOT NULL,
          "display_name" VARCHAR(100) NOT NULL,
          "description" TEXT,
          "is_active" BOOLEAN NOT NULL DEFAULT true,
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
      )
    `;

    // Step 2: Create vehicle_service_capabilities table
    console.log('🔗 Creating vehicle_service_capabilities table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "vehicle_service_capabilities" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "vehicle_type_id" UUID NOT NULL,
          "service_type_id" UUID NOT NULL,
          "is_available" BOOLEAN NOT NULL DEFAULT true,
          "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "vehicle_service_capabilities_pkey" PRIMARY KEY ("id")
      )
    `;

    // Step 3: Add display_name column
    console.log('📝 Adding display_name column...');
    await prisma.$executeRaw`
      ALTER TABLE "vehicle_types" ADD COLUMN IF NOT EXISTS "display_name" VARCHAR(100)
    `;

    // Step 4: Update display names
    console.log('🏷️ Updating display names...');
    await prisma.$executeRaw`
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
      WHERE "display_name" IS NULL
    `;

    // Step 5: Update bicycle requirements
    console.log('🚲 Updating bicycle requirements...');
    await prisma.$executeRaw`
      UPDATE "vehicle_types" SET 
          "license_required" = false,
          "insurance_required" = false,
          "registration_required" = false
      WHERE "name" = 'bicycle'
    `;

    // Step 6: Create indexes
    console.log('📊 Creating indexes...');
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "service_types_name_key" ON "service_types"("name")
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "service_types_is_active_idx" ON "service_types"("is_active")
    `;
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_service_capabilities_vehicle_type_id_service_type_id_key" 
      ON "vehicle_service_capabilities"("vehicle_type_id", "service_type_id")
    `;

    // Step 7: Add foreign keys (with proper syntax)
    console.log('🔗 Adding foreign key constraints...');
    try {
      await prisma.$executeRaw`
        ALTER TABLE "vehicle_service_capabilities" 
        ADD CONSTRAINT "vehicle_service_capabilities_vehicle_type_id_fkey" 
        FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_types"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      console.log('  - vehicle_type_id constraint already exists');
    }
    
    try {
      await prisma.$executeRaw`
        ALTER TABLE "vehicle_service_capabilities" 
        ADD CONSTRAINT "vehicle_service_capabilities_service_type_id_fkey" 
        FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE
      `;
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      console.log('  - service_type_id constraint already exists');
    }

    // Step 8: Insert service types
    console.log('📥 Inserting service types...');
    await prisma.$executeRaw`
      INSERT INTO "service_types" ("name", "display_name", "description") VALUES
      ('ride', 'Ride', 'Passenger transportation service'),
      ('delivery', 'Delivery', 'Package and food delivery service')
      ON CONFLICT (name) DO NOTHING
    `;

    // Step 9: Insert vehicle-service capabilities
    console.log('🚗 Setting up vehicle-service capabilities...');
    
    // Cars: Both ride and delivery
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'car'
      ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING
    `;

    // Motorcycles: Delivery only
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'motorcycle' AND st.name = 'delivery'
      ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING
    `;

    // Bicycles: Delivery only
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'bicycle' AND st.name = 'delivery'
      ON CONFLICT (vehicle_type_id, service_type_id) DO NOTHING
    `;

    console.log('✅ Phase 1 migration completed successfully!');

    // Verify the results
    console.log('\n🔍 Verifying results...');
    const serviceTypes = await prisma.$queryRaw`SELECT * FROM service_types`;
    console.log('Service types:', serviceTypes);

    const capabilities = await prisma.$queryRaw`
      SELECT vt.name as vehicle_type, st.name as service_type 
      FROM vehicle_service_capabilities vsc
      JOIN vehicle_types vt ON vsc.vehicle_type_id = vt.id
      JOIN service_types st ON vsc.service_type_id = st.id
      ORDER BY vt.name, st.name
    `;
    console.log('Vehicle-service capabilities:', capabilities);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runManualMigration();