import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding spare parts categories...');

  const categories = [
    { name: 'All Parts',        description: 'Browse all spare parts categories',         sortOrder: 0 },
    { name: 'Battery',          description: 'Car batteries and charging systems',         sortOrder: 1 },
    { name: 'Brakes',           description: 'Brake pads, rotors, callipers and fluids',  sortOrder: 2 },
    { name: 'Tyres',            description: 'Car and truck tyres of all sizes',           sortOrder: 3 },
    { name: 'Suspension',       description: 'Shock absorbers, springs and linkages',      sortOrder: 4 },
    { name: 'Engine Parts',     description: 'Engine components and assemblies',           sortOrder: 5 },
    { name: 'Electrical',       description: 'Wiring, sensors, alternators and starters',  sortOrder: 6 },
    { name: 'Body Parts',       description: 'Doors, bumpers, bonnets and body panels',    sortOrder: 7 },
    { name: 'Filters',          description: 'Oil, air, fuel and cabin air filters',       sortOrder: 8 },
    { name: 'Transmission',     description: 'Gearbox, clutch and drivetrain components',  sortOrder: 9 },
  ];

  for (const cat of categories) {
    await prisma.sparePartsCategory.upsert({
      where: {
        // Use name as the natural key for idempotency
        // (no unique constraint on name in schema, so we find first then upsert by id)
        // Workaround: create if not exists
        id: '00000000-0000-0000-0000-000000000000', // will never match — forces create path
      },
      update: {},
      create: {
        name: cat.name,
        description: cat.description,
        isActive: true,
        sortOrder: cat.sortOrder,
      },
    }).catch(async () => {
      // If upsert fails due to dummy id, check if name exists
      const existing = await prisma.sparePartsCategory.findFirst({
        where: { name: cat.name },
      });
      if (!existing) {
        await prisma.sparePartsCategory.create({
          data: {
            name: cat.name,
            description: cat.description,
            isActive: true,
            sortOrder: cat.sortOrder,
          },
        });
      }
    });
  }

  // Clean approach — delete all and re-insert (dev/staging only)
  const existing = await prisma.sparePartsCategory.count();
  if (existing === 0) {
    await prisma.sparePartsCategory.createMany({
      data: categories.map((c) => ({
        name: c.name,
        description: c.description,
        isActive: true,
        sortOrder: c.sortOrder,
      })),
      skipDuplicates: true,
    });
    console.log(`✅ Created ${categories.length} spare parts categories`);
  } else {
    console.log(`ℹ️  Categories already seeded (${existing} found) — skipping`);
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
