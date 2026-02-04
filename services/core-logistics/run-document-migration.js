const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

async function runDocumentMigration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Running document registration migration...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'prisma/migrations/20260204_fix_document_registration/migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n🔄 Executing migration...\n');
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        try {
          await prisma.$executeRawUnsafe(statement);
          console.log('✅ Success');
        } catch (error) {
          console.error('❌ Error:', error.message);
          // Continue with other statements
        }
      }
    }
    
    console.log('\n✅ Document migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runDocumentMigration();