const { PrismaClient } = require('@prisma/client');

async function cleanupLegacyVehicles() {
  const prisma = new PrismaClient();

  try {
    console.log('🧹 Cleaning up legacy vehicle types...');

    // Option 1: Hide legacy vehicle types (recommended)
    await prisma.$executeRaw`
      UPDATE vehicle_types 
      SET is_active = false 
      WHERE name IN ('Premium', 'Standard', 'VIP')
    `;

    console.log('✅ Legacy vehicle types hidden (set to inactive)');

    // Verify the cleanup
    const activeVehicles = await prisma.$queryRaw`
      SELECT name, display_name, is_active 
      FROM vehicle_types 
      WHERE is_active = true
      ORDER BY name
    `;
    
    console.log('✅ Active vehicle types after cleanup:', activeVehicles);

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupLegacyVehicles();