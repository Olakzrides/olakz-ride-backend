import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Hash password for test users
  const passwordHash = await bcrypt.hash('Test@1234', 10);

  // Create super admin from environment variables (if provided)
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (superAdminEmail && superAdminPassword) {
    const superAdminHash = await bcrypt.hash(superAdminPassword, 10);
    
    const superAdmin = await prisma.user.upsert({
      where: { email: superAdminEmail.toLowerCase() },
      update: {},
      create: {
        email: superAdminEmail.toLowerCase(),
        passwordHash: superAdminHash,
        firstName: 'Super',
        lastName: 'Admin',
        username: 'superadmin',
        roles: ['admin'],
        activeRole: 'admin',
        provider: 'emailpass',
        emailVerified: true,
        status: 'active',
      },
    });

    console.log('✅ Created super admin:', superAdmin.email);
  } else {
    console.log('⚠️  No SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD found in environment. Skipping super admin creation.');
  }

  // Create test users
  const customerUser = await prisma.user.upsert({
    where: { email: 'customer@test.com' },
    update: {},
    create: {
      email: 'customer@test.com',
      passwordHash,
      firstName: 'Test',
      lastName: 'Customer',
      username: 'testcustomer',
      phone: '+1234567890',
      roles: ['customer'],
      activeRole: 'customer',
      provider: 'emailpass',
      emailVerified: true,
      status: 'active',
    },
  });

  const riderUser = await prisma.user.upsert({
    where: { email: 'rider@test.com' },
    update: {},
    create: {
      email: 'rider@test.com',
      passwordHash,
      firstName: 'Test',
      lastName: 'Rider',
      username: 'testrider',
      phone: '+1234567891',
      roles: ['customer', 'driver'],
      activeRole: 'driver',
      provider: 'emailpass',
      emailVerified: true,
      status: 'active',
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      passwordHash,
      firstName: 'Test',
      lastName: 'Admin',
      username: 'testadmin',
      phone: '+1234567892',
      roles: ['admin'],
      activeRole: 'admin',
      provider: 'emailpass',
      emailVerified: true,
      status: 'active',
    },
  });

  console.log('✅ Created test users:');
  console.log('   - Customer:', customerUser.email);
  console.log('   - Rider (Customer + Driver):', riderUser.email);
  console.log('   - Admin:', adminUser.email);
  console.log('   - Password for all: Test@1234');
  console.log('');
  console.log('🌱 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
