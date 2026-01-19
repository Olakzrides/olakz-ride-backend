import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create Region (Nigeria - Lagos)
  const region = await prisma.region.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Lagos, Nigeria',
      currencyCode: 'NGN',
      countryCode: 'NG',
      isActive: true,
      metadata: {
        timezone: 'Africa/Lagos',
        coordinates: {
          latitude: 6.5244,
          longitude: 3.3792
        }
      }
    }
  });
  console.log('✅ Created region:', region.name);

  // Create Vehicle Types
  const vehicleTypes = await Promise.all([
    prisma.vehicleType.upsert({
      where: { id: '00000000-0000-0000-0000-000000000011' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000011',
        name: 'Standard',
        description: 'Affordable rides for everyday travel',
        baseFarePerKm: 100,
        baseFarePerMinute: 10,
        minimumFare: 500,
        capacity: 4,
        isActive: true,
        metadata: {
          color: '#4CAF50',
          icon: 'car-standard'
        }
      }
    }),
    prisma.vehicleType.upsert({
      where: { id: '00000000-0000-0000-0000-000000000012' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000012',
        name: 'Premium',
        description: 'Comfortable rides with extra space',
        baseFarePerKm: 150,
        baseFarePerMinute: 15,
        minimumFare: 800,
        capacity: 4,
        isActive: true,
        metadata: {
          color: '#2196F3',
          icon: 'car-premium'
        }
      }
    }),
    prisma.vehicleType.upsert({
      where: { id: '00000000-0000-0000-0000-000000000013' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000013',
        name: 'VIP',
        description: 'Luxury rides with top-tier vehicles',
        baseFarePerKm: 200,
        baseFarePerMinute: 20,
        minimumFare: 1200,
        capacity: 4,
        isActive: true,
        metadata: {
          color: '#9C27B0',
          icon: 'car-vip'
        }
      }
    })
  ]);
  console.log('✅ Created vehicle types:', vehicleTypes.map(v => v.name).join(', '));

  // Create Ride Product
  const rideProduct = await prisma.rideProduct.upsert({
    where: { handle: 'olakz-ride' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      title: 'Olakz Ride',
      handle: 'olakz-ride',
      description: 'Book a ride to your destination',
      isActive: true,
      metadata: {
        category: 'ride-hailing',
        features: ['real-time-tracking', 'multiple-stops', 'scheduled-rides']
      }
    }
  });
  console.log('✅ Created ride product:', rideProduct.title);

  // Create Ride Variants
  const rideVariants = await Promise.all([
    prisma.rideVariant.upsert({
      where: { sku: 'RIDE-STANDARD' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000031',
        productId: rideProduct.id,
        vehicleTypeId: vehicleTypes[0].id,
        title: 'Standard',
        sku: 'RIDE-STANDARD',
        basePrice: 500,
        pricePerKm: 100,
        pricePerMinute: 10,
        minimumFare: 500,
        isActive: true,
        metadata: {
          estimatedWaitTime: '3-5 mins',
          description: 'Affordable everyday rides'
        }
      }
    }),
    prisma.rideVariant.upsert({
      where: { sku: 'RIDE-PREMIUM' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000032',
        productId: rideProduct.id,
        vehicleTypeId: vehicleTypes[1].id,
        title: 'Premium',
        sku: 'RIDE-PREMIUM',
        basePrice: 800,
        pricePerKm: 150,
        pricePerMinute: 15,
        minimumFare: 800,
        isActive: true,
        metadata: {
          estimatedWaitTime: '5-7 mins',
          description: 'Comfortable rides with extra space'
        }
      }
    }),
    prisma.rideVariant.upsert({
      where: { sku: 'RIDE-VIP' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000033',
        productId: rideProduct.id,
        vehicleTypeId: vehicleTypes[2].id,
        title: 'VIP',
        sku: 'RIDE-VIP',
        basePrice: 1200,
        pricePerKm: 200,
        pricePerMinute: 20,
        minimumFare: 1200,
        isActive: true,
        metadata: {
          estimatedWaitTime: '7-10 mins',
          description: 'Luxury rides with premium vehicles'
        }
      }
    })
  ]);
  console.log('✅ Created ride variants:', rideVariants.map(v => v.title).join(', '));

  console.log('🌱 Database seeding completed!');
  console.log('\n📊 Summary:');
  console.log(`- Regions: 1 (${region.name})`);
  console.log(`- Vehicle Types: ${vehicleTypes.length}`);
  console.log(`- Ride Products: 1 (${rideProduct.title})`);
  console.log(`- Ride Variants: ${rideVariants.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
