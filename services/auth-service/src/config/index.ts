interface Config {
  env: string;
  port: number;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  otp: {
    length: number;
    expiryMinutes: number;
    maxAttempts: number;
    resendLimitPerHour: number;
  };
  email: {
    from: {
      email: string;
      name: string;
    };
  };
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  apple: {
    teamId: string;
    keyId: string;
    privateKey: string;
    serviceId: string;
    bundleId: string;
    redirectUri: string;
  };
  rateLimit: {
    registrationPerHour: number;
    loginFailureLimit: number;
    loginBlockDurationMinutes: number;
  };
  security: {
    bcryptRounds: number;
  };
  cors: {
    allowedOrigins: string[];
  };
  frontend: {
    url: string;
    mobileDeepLink: string;
  };
  internalApiKey: string;
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3003', 10),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
  },

  otp: {
    length: parseInt(process.env.OTP_LENGTH || '4', 10),
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10),
    resendLimitPerHour: parseInt(process.env.OTP_RESEND_LIMIT_PER_HOUR || '3', 10),
  },

  email: {
    from: {
      email: process.env.ZEPTO_FROM_EMAIL || '',
      name: process.env.ZEPTO_FROM_NAME || 'Olakz Ride',
    },
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3003/api/auth/google/callback',
  },

  apple: {
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKey: process.env.APPLE_PRIVATE_KEY || '',
    serviceId: process.env.APPLE_SERVICE_ID || '',
    bundleId: process.env.APPLE_BUNDLE_ID || '',
    redirectUri: process.env.APPLE_REDIRECT_URI || 'https://olakzride.duckdns.org/api/auth/apple/callback',
  },

  rateLimit: {
    registrationPerHour: parseInt(process.env.REGISTRATION_RATE_LIMIT || '5', 10),
    loginFailureLimit: parseInt(process.env.LOGIN_RATE_LIMIT || '5', 10),
    loginBlockDurationMinutes: parseInt(process.env.LOGIN_BLOCK_DURATION_MINUTES || '15', 10),
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },

  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:19006',
      'http://localhost:19000',
    ],
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
    mobileDeepLink: process.env.MOBILE_APP_DEEP_LINK || 'olakzride://',
  },

  get internalApiKey() {
    return process.env.INTERNAL_API_KEY || 'default-internal-key-change-in-production';
  },
};

// Validate required config
if (!config.supabase.url || !config.supabase.anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

if (!config.jwt.secret) {
  throw new Error('JWT_SECRET is required');
}

// Validate email API configuration
if (!process.env.ZEPTO_API_URL || !process.env.ZEPTO_API_KEY) {
  console.warn('⚠️  ZeptoMail API not configured - emails will not be sent');
}

if (!config.google.clientId || !config.google.clientSecret) {
  console.warn('⚠️  Google OAuth credentials not set - Google login disabled');
}

if (!config.apple.teamId || !config.apple.keyId || !config.apple.privateKey) {
  console.warn('⚠️  Apple Sign-In credentials not set - Apple login disabled');
}

// Log internal API key configuration (for debugging)
console.log('🔑 Internal API Key configured:', {
  hasKey: !!config.internalApiKey,
  keyLength: config.internalApiKey?.length,
  keyPreview: config.internalApiKey?.substring(0, 10) + '...',
  isDefault: config.internalApiKey === 'default-internal-key-change-in-production',
});

export default config;