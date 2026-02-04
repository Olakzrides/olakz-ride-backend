const { PrismaClient } = require('@prisma/client');

async function fixDocumentsTable() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Fixing driver_documents table...');
    
    // Step 1: Check if there are any existing records
    const existingRecords = await prisma.$queryRaw`SELECT COUNT(*) as count FROM driver_documents`;
    console.log('📊 Existing records:', existingRecords[0].count);
    
    // Step 2: Drop foreign key constraint
    console.log('🔧 Dropping foreign key constraint...');
    try {
      await prisma.$executeRaw`ALTER TABLE "driver_documents" DROP CONSTRAINT IF EXISTS "driver_documents_driver_id_fkey"`;
      console.log('✅ Foreign key constraint dropped');
    } catch (error) {
      console.log('⚠️ Foreign key constraint drop failed:', error.message);
    }
    
    // Step 3: Make driver_id nullable
    console.log('🔧 Making driver_id nullable...');
    try {
      await prisma.$executeRaw`ALTER TABLE "driver_documents" ALTER COLUMN "driver_id" DROP NOT NULL`;
      console.log('✅ driver_id is now nullable');
    } catch (error) {
      console.log('❌ Failed to make driver_id nullable:', error.message);
    }
    
    // Step 4: Add session_id column
    console.log('🔧 Adding session_id column...');
    try {
      await prisma.$executeRaw`ALTER TABLE "driver_documents" ADD COLUMN IF NOT EXISTS "session_id" UUID`;
      console.log('✅ session_id column added');
    } catch (error) {
      console.log('❌ Failed to add session_id column:', error.message);
    }
    
    // Step 5: Add index
    console.log('🔧 Adding index for session_id...');
    try {
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "driver_documents_session_id_idx" ON "driver_documents"("session_id")`;
      console.log('✅ Index added');
    } catch (error) {
      console.log('❌ Failed to add index:', error.message);
    }
    
    // Step 6: Re-add foreign key constraint
    console.log('🔧 Re-adding foreign key constraint...');
    try {
      await prisma.$executeRaw`ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE`;
      console.log('✅ Foreign key constraint re-added');
    } catch (error) {
      console.log('❌ Failed to re-add foreign key constraint:', error.message);
    }
    
    // Step 7: Add check constraint
    console.log('🔧 Adding check constraint...');
    try {
      await prisma.$executeRaw`ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_or_session_check" CHECK (("driver_id" IS NOT NULL) OR ("session_id" IS NOT NULL))`;
      console.log('✅ Check constraint added');
    } catch (error) {
      console.log('❌ Failed to add check constraint:', error.message);
    }
    
    console.log('\n✅ Table fix completed!');
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDocumentsTable();