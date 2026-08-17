/**
 * Car Wash Service — Seed Script
 * Seeds a sample approved vendor with 6 standard wash services.
 *
 * Run: npx ts-node prisma/seed.ts
 * (Requires DATABASE_URL to be set in .env)
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SEED_USER_ID = '00000000-0000-0000-0000-000000000099'; // replace with a real user id

const DEFAULT_HOURS = {
  monday:    { open: '08:00', close: '19:00', closed: false },
  tuesday:   { open: '08:00', close: '19:00', closed: false },
  wednesday: { open: '08:00', close: '19:00', closed: false },
  thursday:  { open: '08:00', close: '19:00', closed: false },
  friday:    { open: '08:00', close: '19:00', closed: false },
  saturday:  { open: '08:00', close: '19:00', closed: false },
  sunday:    { open: '10:00', close: '17:00', closed: false },
};

async function main() {
  console.log('Seeding car wash service…');

  const vendor = await (prisma as any).carWashVendor.upsert({
    where: { userId: SEED_USER_ID },
    update: {},
    create: {
      userId:           SEED_USER_ID,
      businessName:     'Jameson Car Wash Services',
      description:      'Professional car wash services in Lagos',
      phone:            '+2348012345678',
      email:            'jameson@example.com',
      address:          'Express Rd, Ikeja',
      city:             'Lagos',
      state:            'Lagos',
      latitude:         6.6018,
      longitude:        3.3515,
      status:           'approved',
      rating:           4.8,
      totalCustomers:   30,
      totalHoursServed: 54,
      operatingHours:   DEFAULT_HOURS,
    },
  });

  const services = [
    { name: 'Basic Wash',        category: 'exterior_wash',     durationMinutes: 20,  price: 2000  },
    { name: 'Full Car Wash',     category: 'full_car_wash',     durationMinutes: 45,  price: 5000  },
    { name: 'Wax & Polish',      category: 'wax_and_polish',    durationMinutes: 120, price: 12000 },
    { name: 'Engine Bay Clean',  category: 'engine_wash',       durationMinutes: 40,  price: 4000  },
    { name: 'Interior Clean',    category: 'interior_wash',     durationMinutes: 30,  price: 3000  },
    { name: 'Car Vacuuming',     category: 'car_vacuuming',     durationMinutes: 20,  price: 1500  },
  ];

  for (const svc of services) {
    await (prisma as any).carWashService.create({
      data: {
        vendorId:        vendor.id,
        name:            svc.name,
        category:        svc.category,
        durationMinutes: svc.durationMinutes,
        price:           svc.price,
        isActive:        true,
      },
    });
  }

  console.log(`✅ Seeded vendor "${vendor.businessName}" with ${services.length} services`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
