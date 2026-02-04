const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function runAccessLogsMigration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Running access logs migration...');
    
    const migrationPath = path.join(__dirname, 'prisma/migrations/20260204_add_document_access_logs/migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 80) + '...');
        try {
          await prisma.$executeRawUnsafe(statement);
          console.log('✅ Success');
        } catch (error) {
          console.error('❌ Error:', error.message);
        }
      }
    }
    
    console.log('✅ Access logs migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runAccessLogsMigration();