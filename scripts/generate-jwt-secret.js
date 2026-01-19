#!/usr/bin/env node

/**
 * Generate a secure JWT secret
 * Usage: node scripts/generate-jwt-secret.js
 */

const crypto = require('crypto');

console.log('===========================================');
console.log('🔐 JWT Secret Generator');
console.log('===========================================');
console.log('');
console.log('Generated JWT Secret:');
console.log('─────────────────────────────────────────');
console.log(crypto.randomBytes(64).toString('hex'));
console.log('─────────────────────────────────────────');
console.log('');
console.log('Copy this secret to your .env file:');
console.log('JWT_SECRET=<paste-secret-here>');
console.log('');
console.log('⚠️  Keep this secret secure and never commit it to version control!');
console.log('');
