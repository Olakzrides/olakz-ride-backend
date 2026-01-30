const { PrismaClient } = require('@prisma/client');

async function seedVehicleTypes() {
  const prisma = new PrismaClient();

  try {
    console.log('🚀 Seeding proper vehicle types for Phase 1...');

    // First, let's see what we have
    const existing = await prisma.$queryRaw`SELECT * FROM vehicle_types`;
    console.log('Existing vehicle types:', existing);

    // Insert the vehicle types we need for the frontend
    console.log('📥 Inserting required vehicle types...');
    
    // Check and insert Car
    const carExists = await prisma.$queryRaw`SELECT id FROM vehicle_types WHERE name = 'car'`;
    if (carExists.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO vehicle_types (name, display_name, description, base_fare_per_km, minimum_fare, capacity, license_required, insurance_required, registration_required)
        VALUES ('car', 'Car', '4-wheel passenger vehicle', 50.00, 200.00, 4, true, true, true)
      `;
      console.log('  ✅ Car added');
    } else {
      await prisma.$executeRaw`
        UPDATE vehicle_types SET 
          display_name = 'Car',
          description = '4-wheel passenger vehicle',
          license_required = true,
          insurance_required = true,
          registration_required = true
        WHERE name = 'car'
      `;
      console.log('  ✅ Car updated');
    }

    // Check and insert Motorcycle
    const motorcycleExists = await prisma.$queryRaw`SELECT id FROM vehicle_types WHERE name = 'motorcycle'`;
    if (motorcycleExists.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO vehicle_types (name, display_name, description, base_fare_per_km, minimum_fare, capacity, license_required, insurance_required, registration_required)
        VALUES ('motorcycle', 'Motorcycle', '2-wheel motorized vehicle', 30.00, 150.00, 2, true, true, true)
      `;
      console.log('  ✅ Motorcycle added');
    }

    // Check and insert Bicycle
    const bicycleExists = await prisma.$queryRaw`SELECT id FROM vehicle_types WHERE name = 'bicycle'`;
    if (bicycleExists.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO vehicle_types (name, display_name, description, base_fare_per_km, minimum_fare, capacity, license_required, insurance_required, registration_required)
        VALUES ('bicycle', 'Bicycle', '2-wheel pedal-powered vehicle', 20.00, 100.00, 1, false, false, false)
      `;
      console.log('  ✅ Bicycle added');
    }

    // Check and insert Bus
    const busExists = await prisma.$queryRaw`SELECT id FROM vehicle_types WHERE name = 'bus'`;
    if (busExists.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO vehicle_types (name, display_name, description, base_fare_per_km, minimum_fare, capacity, license_required, insurance_required, registration_required)
        VALUES ('bus', 'Bus', 'Large passenger vehicle', 40.00, 300.00, 20, true, true, true)
      `;
      console.log('  ✅ Bus added');
    }

    // Check and insert Minibus
    const minibusExists = await prisma.$queryRaw`SELECT id FROM vehicle_types WHERE name = 'minibus'`;
    if (minibusExists.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO vehicle_types (name, display_name, description, base_fare_per_km, minimum_fare, capacity, license_required, insurance_required, registration_required)
        VALUES ('minibus', 'Minibus', 'Medium passenger vehicle', 45.00, 250.00, 12, true, true, true)
      `;
      console.log('  ✅ Minibus added');
    }

    // Check and insert Truck
    const truckExists = await prisma.$queryRaw`SELECT id FROM vehicle_types WHERE name = 'truck'`;
    if (truckExists.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO vehicle_types (name, display_name, description, base_fare_per_km, minimum_fare, capacity, license_required, insurance_required, registration_required)
        VALUES ('truck', 'Truck', 'Large cargo vehicle', 60.00, 400.00, 2, true, true, true)
      `;
      console.log('  ✅ Truck added');
    }

    console.log('✅ Vehicle types seeded successfully!');

    // Now set up the vehicle-service capabilities
    console.log('🔗 Setting up vehicle-service capabilities...');
    
    // Clear existing capabilities
    await prisma.$executeRaw`DELETE FROM vehicle_service_capabilities`;

    // Cars: Both ride and delivery
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'car'
    `;

    // Motorcycles: Delivery only
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'motorcycle' AND st.name = 'delivery'
    `;

    // Bicycles: Delivery only
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'bicycle' AND st.name = 'delivery'
    `;

    // Trucks: Delivery only
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'truck' AND st.name = 'delivery'
    `;

    // Buses: Ride only
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'bus' AND st.name = 'ride'
    `;

    // Minibus: Both ride and delivery
    await prisma.$executeRaw`
      INSERT INTO "vehicle_service_capabilities" ("vehicle_type_id", "service_type_id")
      SELECT vt.id, st.id 
      FROM "vehicle_types" vt, "service_types" st 
      WHERE vt.name = 'minibus'
    `;

    console.log('✅ Vehicle-service capabilities set up successfully!');

    // Verify the results
    console.log('\n🔍 Final verification...');
    const vehicleTypes = await prisma.$queryRaw`
      SELECT name, display_name, license_required, insurance_required, registration_required 
      FROM vehicle_types 
      WHERE name IN ('car', 'motorcycle', 'bicycle', 'bus', 'minibus', 'truck')
      ORDER BY name
    `;
    console.log('Vehicle types:', vehicleTypes);

    const capabilities = await prisma.$queryRaw`
      SELECT vt.name as vehicle_type, st.name as service_type 
      FROM vehicle_service_capabilities vsc
      JOIN vehicle_types vt ON vsc.vehicle_type_id = vt.id
      JOIN service_types st ON vsc.service_type_id = st.id
      ORDER BY vt.name, st.name
    `;
    console.log('Vehicle-service capabilities:', capabilities);

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seedVehicleTypes();