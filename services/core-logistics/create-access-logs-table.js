const { PrismaClient } = require('@prisma/client');

async function createAccessLogsTable() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Creating document_access_logs table...');
    
    // Create table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "document_access_logs" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "document_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "action" VARCHAR(50) NOT NULL,
        "ip_address" INET,
        "user_agent" TEXT,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
      )
    `;
    console.log('✅ Table created');
    
    // Create indexes
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "document_access_logs_document_id_idx" ON "document_access_logs"("document_id")`;
    console.log('✅ Document ID index created');
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "document_access_logs_user_id_idx" ON "document_access_logs"("user_id")`;
    console.log('✅ User ID index created');
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "document_access_logs_action_idx" ON "document_access_logs"("action")`;
    console.log('✅ Action index created');
    
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "document_access_logs_created_at_idx" ON "document_access_logs"("created_at")`;
    console.log('✅ Created at index created');
    
    console.log('✅ All access logs table setup completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAccessLogsTable();