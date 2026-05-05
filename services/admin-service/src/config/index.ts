import dotenv from 'dotenv';
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3008', 10),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '30d',
  },

  internalApiKey: process.env.INTERNAL_API_KEY || '',

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required config
if (!config.supabase.url) throw new Error('SUPABASE_URL is required');
if (!config.supabase.serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
if (!config.jwt.secret) throw new Error('JWT_SECRET is required');

export default config;
