/**
 * Auto Mech Service — Seed Script
 * Seeds a sample approved vendor with 6 standard mech services.
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
  console.log('Seeding auto mech service…');

  const vendor = await (prisma as any).autoMechVendor.upsert({
    where: { userId: SEED_USER_ID },
    update: {},
    create: {
      userId:           SEED_USER_ID,
      businessName:     'Jameson Auto Mech Services',
      description:      'Professional auto mechanic services in Lagos',
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
    { name: 'Oil Change',         category: 'oil_change',        durationMinutes: 30,  price: 3000,  priceMax: null   },
    { name: 'Tyre Service',       category: 'tyre_service',      durationMinutes: 45,  price: 5000,  priceMax: null   },
    { name: 'Brake Service',      category: 'brake_service',     durationMinutes: 60,  price: 7000,  priceMax: null   },
    { name: 'Engine Diagnostic & Repair', category: 'engine_repair', durationMinutes: 90, price: 15000, priceMax: 50000 },
    { name: 'Electrical Repair',  category: 'electrical_repair', durationMinutes: 90,  price: 10000, priceMax: null   },
    { name: 'General Service',    category: 'general_service',   durationMinutes: 60,  price: 8000,  priceMax: null   },
  ];

  for (const svc of services) {
    await (prisma as any).autoMechService.create({
      data: {
        vendorId:        vendor.id,
        name:            svc.name,
        category:        svc.category,
        durationMinutes: svc.durationMinutes,
        price:           svc.price,
        priceMin:        svc.price,             // mirrors price
        priceMax:        svc.priceMax ?? null,  // null = fixed; value = upper range bound
        isActive:        true,
      },
    });
  }

  console.log(`✅ Seeded vendor "${vendor.businessName}" with ${services.length} services`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
