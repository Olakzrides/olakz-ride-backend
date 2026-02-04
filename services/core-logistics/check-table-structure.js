const { PrismaClient } = require('@prisma/client');

async function checkTableStructure() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Checking driver_documents table structure...');
    
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'driver_documents' 
      ORDER BY ordinal_position
    `;
    
    console.log('📋 Table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
  } catch (error) {
    console.error('❌ Error checking table structure:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTableStructure();