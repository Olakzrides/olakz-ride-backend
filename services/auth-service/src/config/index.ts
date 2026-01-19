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
    smtp: {
      host: string;
      port: number;
      user: string;
      pass: string;
    };
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
    smtp: {
      host: process.env.ZEPTO_SMTP_HOST || 'smtp.zeptomail.com',
      port: parseInt(process.env.ZEPTO_SMTP_PORT || '587', 10),
      user: process.env.ZEPTO_SMTP_USER || '',
      pass: process.env.ZEPTO_SMTP_PASS || '',
    },
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
};

// Validate required config
if (!config.supabase.url || !config.supabase.anonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

if (!config.jwt.secret) {
  throw new Error('JWT_SECRET is required');
}

if (!config.email.smtp.pass) {
  console.warn('⚠️  ZEPTO_SMTP_PASS not set - emails will not be sent');
}

if (!config.google.clientId || !config.google.clientSecret) {
  console.warn('⚠️  Google OAuth credentials not set - Google login disabled');
}

export default config;