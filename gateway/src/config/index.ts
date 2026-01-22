interface Config {
  env: string;
  port: number;
  services: {
    auth: {
      url: string;
      healthCheck: string;
      timeout: number;
    };
    logistics: {
      url: string;
      healthCheck: string;
      timeout: number;
    };
    payment: {
      url: string;
      healthCheck: string;
      timeout: number;
    };
    platform: {
      url: string;
      healthCheck: string;
      timeout: number;
    };
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
  healthCheck: {
    interval: number;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  services: {
    auth: {
      url: process.env.AUTH_SERVICE_URL || 'http://localhost:3003',
      healthCheck: '/health',
      timeout: parseInt(process.env.SERVICE_TIMEOUT || '10000', 10),
    },
    logistics: {
      url: process.env.LOGISTICS_SERVICE_URL || 'http://localhost:3001',
      healthCheck: '/health',
      timeout: parseInt(process.env.SERVICE_TIMEOUT || '10000', 10),
    },
    payment: {
      url: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
      healthCheck: '/health',
      timeout: parseInt(process.env.SERVICE_TIMEOUT || '10000', 10),
    },
    platform: {
      url: process.env.PLATFORM_SERVICE_URL || 'http://localhost:3004',
      healthCheck: '/health',
      timeout: parseInt(process.env.SERVICE_TIMEOUT || '10000', 10),
    },
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

  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
  },
};

export default config;