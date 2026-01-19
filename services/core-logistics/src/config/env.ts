import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // JWT
  jwtSecret: process.env.JWT_SECRET || '',

  // Service URLs
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3003',

  // Google Maps
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',

  // Default Configuration
  defaults: {
    currency: process.env.DEFAULT_CURRENCY || 'NGN',
    searchRadius: parseInt(process.env.DEFAULT_SEARCH_RADIUS || '10', 10),
    regionId: process.env.DEFAULT_REGION_ID || '00000000-0000-0000-0000-000000000001',
  },

  // Fare Configuration
  fare: {
    baseFareStandard: parseFloat(process.env.BASE_FARE_STANDARD || '500'),
    baseFarePremium: parseFloat(process.env.BASE_FARE_PREMIUM || '800'),
    baseFareVip: parseFloat(process.env.BASE_FARE_VIP || '1200'),
    pricePerKmStandard: parseFloat(process.env.PRICE_PER_KM_STANDARD || '100'),
    pricePerKmPremium: parseFloat(process.env.PRICE_PER_KM_PREMIUM || '150'),
    pricePerKmVip: parseFloat(process.env.PRICE_PER_KM_VIP || '200'),
    minimumFare: parseFloat(process.env.MINIMUM_FARE || '300'),
  },

  // Mock Data (Phase 1)
  mock: {
    useMockMaps: process.env.USE_MOCK_MAPS === 'true',
    mockDistanceKm: parseFloat(process.env.MOCK_DISTANCE_KM || '10'),
    mockDurationMin: parseInt(process.env.MOCK_DURATION_MIN || '15', 10),
  },
};

// Validate required environment variables
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
