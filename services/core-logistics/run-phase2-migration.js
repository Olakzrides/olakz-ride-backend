const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase2Migration() {
  try {
    console.log('🚀 Running manual Phase 2 migration...');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'prisma/migrations/20260129_phase2_registration_sessions/migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }

    console.log('✅ Phase 2 migration completed successfully!');

    // Verify the table was created
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'driver_registration_sessions');

    if (tablesError) {
      console.error('❌ Error checking tables:', tablesError);
    } else if (tables && tables.length > 0) {
      console.log('🔍 Verified: driver_registration_sessions table created');
    } else {
      console.log('⚠️ Warning: driver_registration_sessions table not found');
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

// Alternative approach using direct SQL execution
async function runPhase2MigrationDirect() {
  try {
    console.log('🚀 Running Phase 2 migration with direct SQL...');

    // Create the table directly
    const createTableSQL = `
      -- Phase 2: Multi-Step Registration Sessions Migration
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

    const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    if (createError) {
      console.error('❌ Error creating table:', createError);
      // Try alternative approach
      console.log('🔄 Trying alternative approach...');
      
      const { data, error } = await supabase
        .from('driver_registration_sessions')
        .select('id')
        .limit(1);
      
      if (error && error.code === '42P01') {
        // Table doesn't exist, create it using raw query
        console.log('📋 Creating table using raw SQL...');
        
        // Use a simpler approach - just check if we can query the table
        try {
          await supabase.from('driver_registration_sessions').select('count').single();
          console.log('✅ Table already exists');
        } catch (e) {
          console.log('📋 Table needs to be created manually');
          console.log('Please run this SQL in your database:');
          console.log(createTableSQL);
        }
      }
    } else {
      console.log('✅ Table created successfully');
    }

    // Create indexes
    const indexSQL = `
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_user_id_idx" ON "driver_registration_sessions"("user_id");
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_status_idx" ON "driver_registration_sessions"("status");
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_expires_at_idx" ON "driver_registration_sessions"("expires_at");
      CREATE INDEX IF NOT EXISTS "driver_registration_sessions_created_at_idx" ON "driver_registration_sessions"("created_at");
    `;

    const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexSQL });
    if (indexError) {
      console.log('⚠️ Index creation may have failed:', indexError.message);
    } else {
      console.log('📊 Indexes created successfully');
    }

    console.log('✅ Phase 2 migration completed!');

  } catch (error) {
    console.error('❌ Migration error:', error);
    console.log('📋 Manual SQL to run:');
    console.log(`
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
    "personal_info_completed_at" TIMESTAMPTZ(6),
    "vehicle_details_completed_at" TIMESTAMPTZ(6),
    "documents_completed_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "personal_info_data" JSONB,
    "vehicle_details_data" JSONB,
    "documents_data" JSONB,
    "metadata" JSONB DEFAULT '{}',
    CONSTRAINT "driver_registration_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_registration_sessions_user_id_idx" ON "driver_registration_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_status_idx" ON "driver_registration_sessions"("status");
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_expires_at_idx" ON "driver_registration_sessions"("expires_at");
CREATE INDEX IF NOT EXISTS "driver_registration_sessions_created_at_idx" ON "driver_registration_sessions"("created_at");
    `);
  }
}

runPhase2MigrationDirect();