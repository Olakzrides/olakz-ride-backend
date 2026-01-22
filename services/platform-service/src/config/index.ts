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
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  cache: {
    ttlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || '5', 10),
  },
};

// Validate required config
if (!config.supabase.url || !config.supabase.anonKey) {
  console.warn('⚠️  SUPABASE_URL and SUPABASE_ANON_KEY not configured - some features may not work');
}

export default config;