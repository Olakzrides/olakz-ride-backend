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

  // Create Service Types
  console.log('Creating service types...');
  const rideService = await prisma.serviceType.upsert({
    where: { name: 'ride' },
    update: {},
    create: {
      name: 'ride',
      displayName: 'Ride',
      description: 'Passenger transportation service',
      isActive: true,
    },
  });

  const deliveryService = await prisma.serviceType.upsert({
    where: { name: 'delivery' },
    update: {},
    create: {
      name: 'delivery',
      displayName: 'Delivery',
      description: 'Package and food delivery service',
      isActive: true,
    },
  });
  console.log('✅ Created service types:', [rideService.displayName, deliveryService.displayName].join(', '));

  // Create Vehicle Types with Service Capabilities
  const vehicleTypesData = [
    {
      id: '00000000-0000-0000-0000-000000000011',
      name: 'car',
      displayName: 'Car',
      description: '4-wheel passenger vehicle',
      baseFarePerKm: 150,
      baseFarePerMinute: 25,
      minimumFare: 500,
      capacity: 4,
      iconUrl: 'https://cdn.olakz.com/icons/car.png',
      licenseRequired: true,
      insuranceRequired: true,
      registrationRequired: true,
      services: ['ride', 'delivery'],
      metadata: { color: '#4CAF50', icon: 'car' }
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      name: 'motorcycle',
      displayName: 'Motorcycle',
      description: '2-wheel motorized vehicle',
      baseFarePerKm: 100,
      baseFarePerMinute: 15,
      minimumFare: 300,
      capacity: 1,
      iconUrl: 'https://cdn.olakz.com/icons/motorcycle.png',
      licenseRequired: true,
      insuranceRequired: true,
      registrationRequired: true,
      services: ['delivery'],
      metadata: { color: '#FF9800', icon: 'motorcycle' }
    },
    {
      id: '00000000-0000-0000-0000-000000000013',
      name: 'bicycle',
      displayName: 'Bicycle',
      description: '2-wheel pedal-powered vehicle',
      baseFarePerKm: 50,
      baseFarePerMinute: 10,
      minimumFare: 200,
      capacity: 1,
      iconUrl: 'https://cdn.olakz.com/icons/bicycle.png',
      licenseRequired: false,
      insuranceRequired: false,
      registrationRequired: false,
      services: ['delivery'],
      metadata: { color: '#4CAF50', icon: 'bicycle' }
    },
    {
      id: '00000000-0000-0000-0000-000000000014',
      name: 'minibus',
      displayName: 'Minibus',
      description: 'Small bus for group transportation',
      baseFarePerKm: 200,
      baseFarePerMinute: 35,
      minimumFare: 800,
      capacity: 14,
      iconUrl: 'https://cdn.olakz.com/icons/minibus.png',
      licenseRequired: true,
      insuranceRequired: true,
      registrationRequired: true,
      services: ['ride', 'delivery'],
      metadata: { color: '#2196F3', icon: 'minibus' }
    },
    {
      id: '00000000-0000-0000-0000-000000000015',
      name: 'bus',
      displayName: 'Bus',
      description: 'Large vehicle for public transportation',
      baseFarePerKm: 250,
      baseFarePerMinute: 40,
      minimumFare: 1000,
      capacity: 50,
      iconUrl: 'https://cdn.olakz.com/icons/bus.png',
      licenseRequired: true,
      insuranceRequired: true,
      registrationRequired: true,
      services: ['ride'],
      metadata: { color: '#9C27B0', icon: 'bus' }
    },
    {
      id: '00000000-0000-0000-0000-000000000016',
      name: 'truck',
      displayName: 'Truck',
      description: 'Heavy-duty vehicle for large deliveries',
      baseFarePerKm: 300,
      baseFarePerMinute: 50,
      minimumFare: 1500,
      capacity: 2,
      iconUrl: 'https://cdn.olakz.com/icons/truck.png',
      licenseRequired: true,
      insuranceRequired: true,
      registrationRequired: true,
      services: ['delivery'],
      metadata: { color: '#795548', icon: 'truck' }
    }
  ];

  const vehicleTypes = [];
  for (const vehicleData of vehicleTypesData) {
    const { services, ...vehicleTypeData } = vehicleData;
    
    const vehicleType = await prisma.vehicleType.upsert({
      where: { id: vehicleData.id },
      update: vehicleTypeData,
      create: vehicleTypeData,
    });

    // Create service capabilities
    for (const serviceName of services) {
      const serviceType = serviceName === 'ride' ? rideService : deliveryService;
      
      await prisma.vehicleServiceCapability.upsert({
        where: {
          vehicleTypeId_serviceTypeId: {
            vehicleTypeId: vehicleType.id,
            serviceTypeId: serviceType.id,
          },
        },
        update: { isAvailable: true },
        create: {
          vehicleTypeId: vehicleType.id,
          serviceTypeId: serviceType.id,
          isAvailable: true,
        },
      });
    }

    vehicleTypes.push(vehicleType);
    console.log(`✅ Created vehicle type: ${vehicleType.displayName} with ${services.join(', ')} services`);
  }

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
  console.log(`- Service Types: 2 (Ride, Delivery)`);
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
