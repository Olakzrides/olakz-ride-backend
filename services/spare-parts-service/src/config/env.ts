import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3009', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'spare-parts',
  },

  // JWT (shared secret with auth-service)
  jwtSecret: process.env.JWT_SECRET || '',

  // Internal API key for service-to-service communication
  internalApiKey: process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure',

  // Service URLs for internal calls
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3003',
  coreLogisticsServiceUrl: process.env.CORE_LOGISTICS_SERVICE_URL || 'http://localhost:3001',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3007',
  marketplaceServiceUrl: process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3006',

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],

  // Defaults
  defaults: {
    currency: process.env.DEFAULT_CURRENCY || 'NGN',
    searchRadiusKm: parseFloat(process.env.DEFAULT_SEARCH_RADIUS_KM || '15'),
  },
};

export function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'JWT_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
