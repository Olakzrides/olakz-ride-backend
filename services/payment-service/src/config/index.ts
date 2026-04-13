const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3007', 10),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
  },

  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    baseUrl: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
  },

  internalApiKey: process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure',

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  },
};

if (!config.supabase.url || !config.supabase.anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

if (!config.jwt.secret) {
  throw new Error('JWT_SECRET is required');
}

export default config;
