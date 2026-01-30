const { PrismaClient } = require('@prisma/client');

async function checkDatabaseState() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking database state...');

    // Check if service_types table exists
    try {
      const serviceTypes = await prisma.$queryRaw`SELECT * FROM service_types LIMIT 1`;
      console.log('✅ service_types table exists');
    } catch (error) {
      console.log('❌ service_types table does not exist');
    }

    // Check if vehicle_service_capabilities table exists
    try {
      const capabilities = await prisma.$queryRaw`SELECT * FROM vehicle_service_capabilities LIMIT 1`;
      console.log('✅ vehicle_service_capabilities table exists');
    } catch (error) {
      console.log('❌ vehicle_service_capabilities table does not exist');
    }

    // Check vehicle_types columns
    try {
      const columns = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'vehicle_types' 
        AND column_name IN ('display_name', 'license_required', 'insurance_required', 'registration_required')
      `;
      console.log('✅ vehicle_types columns:', columns);
    } catch (error) {
      console.log('❌ Error checking vehicle_types columns:', error.message);
    }

    // Check existing vehicle types
    try {
      const vehicleTypes = await prisma.$queryRaw`SELECT name, display_name FROM vehicle_types`;
      console.log('✅ Existing vehicle types:', vehicleTypes);
    } catch (error) {
      console.log('❌ Error checking vehicle types:', error.message);
    }

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseState();