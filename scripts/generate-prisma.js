#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🔄 Generating Prisma Clients for all services...\n');

const services = [
  'services/auth-service',
  'services/core-logistics',
  'services/platform-service'
];

services.forEach((service) => {
  const servicePath = path.join(process.cwd(), service);
  console.log(`📦 Generating Prisma Client for ${service}...`);
  
  try {
    execSync('npx prisma generate', {
      cwd: servicePath,
      stdio: 'inherit'
    });
    console.log(`✅ ${service} - Done\n`);
  } catch (error) {
    console.error(`❌ ${service} - Failed`);
    process.exit(1);
  }
});

console.log('✅ All Prisma Clients generated successfully!');
