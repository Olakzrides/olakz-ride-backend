const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createRegistrationTable() {
  try {
    console.log('🚀 Creating driver registration sessions table...');

    // Create the table using raw SQL
    await prisma.$executeRaw`
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
    `;

    console.log('📊 Creating indexes...');

    // Create indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_user_id_idx" 
      ON "driver_registration_sessions"("user_id");
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_status_idx" 
      ON "driver_registration_sessions"("status");
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_expires_at_idx" 
      ON "driver_registration_sessions"("expires_at");
    `;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_created_at_idx" 
      ON "driver_registration_sessions"("created_at");
    `;

    console.log('🔒 Adding constraints...');

    // Add check constraints (PostgreSQL doesn't support IF NOT EXISTS for constraints)
    try {
      await prisma.$executeRaw`
        ALTER TABLE "driver_registration_sessions" 
        ADD CONSTRAINT "driver_registration_sessions_status_check" 
        CHECK ("status" IN ('initiated', 'in_progress', 'completed', 'expired', 'cancelled'));
      `;
    } catch (e) {
      console.log('⚠️ Status constraint may already exist');
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE "driver_registration_sessions" 
        ADD CONSTRAINT "driver_registration_sessions_current_step_check" 
        CHECK ("current_step" IN ('personal_info', 'vehicle_details', 'documents', 'review', 'completed'));
      `;
    } catch (e) {
      console.log('⚠️ Current step constraint may already exist');
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE "driver_registration_sessions" 
        ADD CONSTRAINT "driver_registration_sessions_progress_check" 
        CHECK ("progress_percentage" >= 0 AND "progress_percentage" <= 100);
      `;
    } catch (e) {
      console.log('⚠️ Progress constraint may already exist');
    }

    console.log('🔍 Verifying table creation...');

    // Test the table by trying to query it
    const count = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "driver_registration_sessions";
    `;

    console.log('✅ Table created successfully!');
    console.log(`📊 Current records: ${count[0].count}`);

  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createRegistrationTable();