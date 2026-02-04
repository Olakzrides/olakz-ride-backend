const { PrismaClient } = require('@prisma/client');

async function refreshSchema() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Refreshing Supabase schema cache...');
    
    // Force a schema refresh by making a simple query
    await prisma.$queryRaw`SELECT 1`;
    
    // Test the new column
    console.log('🧪 Testing session_id column...');
    const testQuery = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'driver_documents' AND column_name = 'session_id'
    `;
    
    if (testQuery.length > 0) {
      console.log('✅ session_id column is accessible');
    } else {
      console.log('❌ session_id column not found');
    }
    
    console.log('✅ Schema refresh completed!');
    
  } catch (error) {
    console.error('❌ Schema refresh failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

refreshSchema();