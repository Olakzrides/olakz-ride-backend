import dotenv from 'dotenv';
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3005', 10),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
  },

  internalApiKey: process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure',

  services: {
    coreLogistics: process.env.CORE_LOGISTICS_URL || 'http://localhost:3001',
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3003',
  },

  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',

  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    baseUrl: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
  },

  defaults: {
    currency: process.env.DEFAULT_CURRENCY || 'NGN',
    searchRadiusKm: 10,
    pricePerKm: parseFloat(process.env.DEFAULT_PRICE_PER_KM || '150'),
    minimumDeliveryFee: parseFloat(process.env.DEFAULT_MINIMUM_DELIVERY_FEE || '300'),
  },
};

export function validateEnv(): void {
  const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export default config;
