import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting platform service database seeding...');

  // Clear existing data (using correct table names)
  console.log('Clearing existing data...');
  try {
    await prisma.$executeRaw`DELETE FROM service_analytics`;
    await prisma.$executeRaw`DELETE FROM user_service_usages`;
    await prisma.$executeRaw`DELETE FROM service_regions`;
    await prisma.$executeRaw`DELETE FROM products`;
    await prisma.$executeRaw`DELETE FROM service_channels`;
  } catch (error) {
    console.log('Some tables may not exist yet, continuing...');
  }

  // Create service channels
  console.log('Creating service channels...');
  
  const serviceChannels = [
    {
      name: 'mobile_ride_sc',
      description: 'Olakz Ride',
      active: true,
      rank: 1
    },
    {
      name: 'mobile_delivery_sc',
      description: 'Delivery Service',
      active: true,
      rank: 2
    },
    {
      name: 'mobile_food_sc',
      description: 'Olakz Foods',
      active: true,
      rank: 3
    },
    {
      name: 'mobile_marketplace_sc',
      description: 'Market Place',
      active: true,
      rank: 4
    },
    {
      name: 'mobile_bills_sc',
      description: 'Airtime & Data',
      active: true,
      rank: 5
    },
    {
      name: 'mobile_transport_hire_sc',
      description: 'Transport Hire',
      active: true,
      rank: 6
    },
    {
      name: 'mobile_auto_wash_sc',
      description: 'Auto Wash',
      active: true,
      rank: 7
    },
    {
      name: 'mobile_car_dealers_sc',
      description: 'Car Dealers',
      active: true,
      rank: 8
    },
    {
      name: 'mobile_auto_mechanic_sc',
      description: 'Auto Mechanic',
      active: true,
      rank: 9
    },
    {
      name: 'mobile_spare_parts_sc',
      description: 'Spare Parts',
      active: true,
      rank: 10
    }
  ];

  const createdChannels: Array<typeof serviceChannels[0] & { id: string }> = [];
  for (const channel of serviceChannels) {
    await prisma.$executeRaw`
      INSERT INTO service_channels (name, description, active, rank)
      VALUES (${channel.name}, ${channel.description}, ${channel.active}, ${channel.rank})
      RETURNING *
    `;
    createdChannels.push({ ...channel, id: `channel-${channel.rank}` });
    console.log(`✅ Created service channel: ${channel.description}`);
  }

  // Create sample products for some services
  console.log('Creating sample products...');
  
  // Get service channel IDs
  const rideChannelResult = await prisma.$queryRaw`
    SELECT id FROM service_channels WHERE name = 'mobile_ride_sc' LIMIT 1
  ` as any[];
  
  const foodChannelResult = await prisma.$queryRaw`
    SELECT id FROM service_channels WHERE name = 'mobile_food_sc' LIMIT 1
  ` as any[];

  if (rideChannelResult.length > 0) {
    const rideChannelId = rideChannelResult[0].id;
    await prisma.$executeRaw`
      INSERT INTO products ("serviceChannelId", handle, title, subtitle, description, thumbnail, metadata)
      VALUES 
        (${rideChannelId}::uuid, 'standard-ride', 'Standard Ride', 'Affordable rides for everyone', 'Book a standard ride with professional drivers', '/images/products/standard-ride.png', '{"basePrice": 500, "currency": "NGN"}'),
        (${rideChannelId}::uuid, 'premium-ride', 'Premium Ride', 'Luxury rides with premium vehicles', 'Experience comfort with our premium ride service', '/images/products/premium-ride.png', '{"basePrice": 1000, "currency": "NGN"}')
    `;
    console.log('✅ Created ride service products');
  }

  if (foodChannelResult.length > 0) {
    const foodChannelId = foodChannelResult[0].id;
    await prisma.$executeRaw`
      INSERT INTO products ("serviceChannelId", handle, title, subtitle, description, thumbnail, metadata)
      VALUES 
        (${foodChannelId}::uuid, 'restaurant-delivery', 'Restaurant Delivery', 'Order from your favorite restaurants', 'Get food delivered from top restaurants in your area', '/images/products/restaurant-delivery.png', '{"deliveryFee": 200, "currency": "NGN"}'),
        (${foodChannelId}::uuid, 'grocery-delivery', 'Grocery Delivery', 'Fresh groceries delivered to your door', 'Order groceries and get them delivered within hours', '/images/products/grocery-delivery.png', '{"deliveryFee": 300, "currency": "NGN"}')
    `;
    console.log('✅ Created food service products');
  }

  // Update existing advertisements with better data
  console.log('Updating advertisements...');
  
  const existingAds = await prisma.$queryRaw`SELECT * FROM advertisements LIMIT 10` as any[];
  if (existingAds.length > 0) {
    // Update first few ads with service-related content
    const adUpdates = [
      {
        title: 'Get a Ride Anywhere',
        description: 'Book rides instantly with Olakz Ride',
        image_url: '/banners/ride-banner.png',
        link_url: '/ride',
        rank: 1
      },
      {
        title: 'Order Delicious Food',
        description: 'From top restaurants in your area',
        image_url: '/banners/food-banner.png',
        link_url: '/food',
        rank: 2
      },
      {
        title: 'Fast Delivery Service',
        description: 'Get your packages delivered quickly',
        image_url: '/banners/delivery-banner.png',
        link_url: '/delivery',
        rank: 3
      }
    ];

    for (let i = 0; i < Math.min(existingAds.length, adUpdates.length); i++) {
      const ad = adUpdates[i];
      const existingAd = existingAds[i];
      await prisma.$executeRaw`
        UPDATE advertisements 
        SET title = ${ad.title}, description = ${ad.description}, image_url = ${ad.image_url}, link_url = ${ad.link_url}, rank = ${ad.rank}
        WHERE id = ${existingAd.id}::uuid
      `;
      console.log(`✅ Updated advertisement: ${ad.title}`);
    }
  }

  // Create sample service regions (Lagos, Nigeria focus)
  console.log('Creating service regions...');
  
  const regions = [
    { code: 'NG-LA', name: 'Lagos' },
    { code: 'NG-AB', name: 'Abuja' },
    { code: 'NG-KN', name: 'Kano' },
    { code: 'NG-PH', name: 'Port Harcourt' }
  ];

  const allChannels = await prisma.$queryRaw`SELECT id FROM service_channels` as any[];
  
  for (const channel of allChannels) {
    for (const region of regions) {
      await prisma.$executeRaw`
        INSERT INTO service_regions ("serviceChannelId", "regionCode", "regionName", "isAvailable", metadata)
        VALUES (${channel.id}::uuid, ${region.code}, ${region.name}, true, '{"timezone": "Africa/Lagos", "currency": "NGN"}')
        ON CONFLICT ("serviceChannelId", "regionCode") DO NOTHING
      `;
    }
  }

  console.log('✅ Service regions created for all channels');

  console.log('🎉 Platform service database seeding completed successfully!');
  console.log(`📊 Created:`);
  console.log(`   - ${serviceChannels.length} service channels`);
  console.log(`   - Updated existing advertisements`);
  console.log(`   - ${allChannels.length * regions.length} service regions`);
  console.log(`   - Sample products for ride and food services`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });