interface Config {
  env: string;
  port: number;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };
  cors: {
    allowedOrigins: string[];
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
  };
  cache: {
    ttlMinutes: number;
  };
  flutterwave: {
    publicKey: string;
    secretKey: string;
    encryptionKey: string;
    baseUrl: string;
    webhookSecret: string;
  };
  coreLogistics: {
    url: string;
    internalApiKey: string;
  };
  payment: {
    url: string;
    internalApiKey: string;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3004', 10),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:19006',
    ],
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10), // 1000 requests per 15 min
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  cache: {
    ttlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || '5', 10),
  },

  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    baseUrl: process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3',
    webhookSecret: process.env.FLUTTERWAVE_WEBHOOK_SECRET || '',
  },

  coreLogistics: {
    url: process.env.CORE_LOGISTICS_URL || 'http://localhost:3001',
    internalApiKey: process.env.CORE_LOGISTICS_INTERNAL_API_KEY || '',
  },

  payment: {
    url: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3007',
    internalApiKey: process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure',
  },
};

// Validate required config
if (!config.supabase.url || !config.supabase.anonKey) {
  console.warn('⚠️  SUPABASE_URL and SUPABASE_ANON_KEY not configured - some features may not work');
}

if (!config.flutterwave.secretKey) {
  console.warn('⚠️  FLUTTERWAVE_SECRET_KEY not configured - bills payment will not work');
}

if (!config.coreLogistics.internalApiKey) {
  console.warn('⚠️  CORE_LOGISTICS_INTERNAL_API_KEY not configured - wallet integration will not work');
}

if (!config.payment.url) {
  console.warn('⚠️  PAYMENT_SERVICE_URL not configured - wallet operations will not work');
}

export default config;