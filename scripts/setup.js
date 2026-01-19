#!/usr/bin/env node

/**
 * Initial project setup script
 * This script helps set up the development environment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

console.log('===========================================');
console.log('🚀 Olakz Ride Backend - Setup Script');
console.log('===========================================');
console.log('');

// Check if .env files exist
const envFiles = [
  { template: '.env.template', target: '.env', dir: '.' },
  { template: 'gateway/.env.template', target: 'gateway/.env', dir: 'gateway' },
  { template: 'services/auth-service/.env.template', target: 'services/auth-service/.env', dir: 'services/auth-service' },
];

console.log('📝 Checking environment files...');
console.log('');

envFiles.forEach(({ template, target, dir }) => {
  const templatePath = path.join(process.cwd(), template);
  const targetPath = path.join(process.cwd(), target);

  if (!fs.existsSync(targetPath)) {
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, targetPath);
      console.log(`✅ Created ${target} from template`);
    } else {
      console.log(`⚠️  Template not found: ${template}`);
    }
  } else {
    console.log(`ℹ️  ${target} already exists (skipping)`);
  }
});

console.log('');
console.log('🔐 Generating JWT secret...');
const jwtSecret = crypto.randomBytes(64).toString('hex');
console.log('✅ JWT secret generated');
console.log('');

console.log('===========================================');
console.log('⚠️  IMPORTANT: Manual Configuration Required');
console.log('===========================================');
console.log('');
console.log('Please update the following files with your actual values:');
console.log('');
console.log('1. services/auth-service/.env');
console.log('   - DATABASE_URL (from Supabase)');
console.log('   - SUPABASE_URL (from Supabase)');
console.log('   - SUPABASE_ANON_KEY (from Supabase)');
console.log('   - JWT_SECRET (use the generated secret below)');
console.log('   - ZEPTO_SMTP_PASS (from ZeptoMail)');
console.log('   - GOOGLE_CLIENT_ID (optional, from Google Console)');
console.log('   - GOOGLE_CLIENT_SECRET (optional, from Google Console)');
console.log('');
console.log('2. gateway/.env');
console.log('   - Review and update service URLs if needed');
console.log('');
console.log('Generated JWT Secret:');
console.log('─────────────────────────────────────────');
console.log(jwtSecret);
console.log('─────────────────────────────────────────');
console.log('');
console.log('===========================================');
console.log('📦 Next Steps');
console.log('===========================================');
console.log('');
console.log('1. Update .env files with your actual values');
console.log('2. Install dependencies: npm install');
console.log('3. Generate Prisma client: cd services/auth-service && npm run prisma:generate');
console.log('4. Run migrations: cd services/auth-service && npm run prisma:migrate');
console.log('5. Seed database (optional): cd services/auth-service && npm run prisma:seed');
console.log('6. Start development: npm run dev');
console.log('');
console.log('For Docker Compose:');
console.log('  docker-compose up -d');
console.log('');
console.log('===========================================');
console.log('✅ Setup script completed!');
console.log('===========================================');
