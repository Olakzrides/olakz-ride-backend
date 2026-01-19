import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

/**
 * Generate unique test email
 */
export function generateTestEmail(prefix: string = 'user'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}-${timestamp}-${random}@test.com`;
}

/**
 * Create a test user in database
 */
export async function createTestUser(overrides: any = {}) {
  const email = overrides.email || generateTestEmail();
  const password = overrides.password || 'Test@1234';
  const passwordHash = await bcrypt.hash(password, 4);

  // Remove password from overrides as it's not a database field
  const { password: _, ...dbOverrides } = overrides;

  // Ensure valid status - only use 'active' by default
  // If test needs different status, it must be valid per database constraint
  const status = dbOverrides.status || 'active';

  // Ensure valid provider with providerId if needed
  const provider = dbOverrides.provider || 'emailpass';
  const providerId = provider === 'emailpass' 
    ? null 
    : (dbOverrides.providerId || `${provider}-${Date.now()}`);

  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      email,
      passwordHash,
      firstName: dbOverrides.firstName || 'Test',
      lastName: dbOverrides.lastName || 'User',
      username: dbOverrides.username || `testuser${Date.now()}`,
      phone: dbOverrides.phone || `+123456${Date.now()}`,
      role: dbOverrides.role || 'customer',
      provider,
      providerId,
      emailVerified: dbOverrides.emailVerified !== undefined ? dbOverrides.emailVerified : false,
      status,
    },
  });

  return user;
}

/**
 * Create a verified test user
 */
export async function createVerifiedTestUser(overrides: any = {}) {
  return createTestUser({
    ...overrides,
    emailVerified: true,
  });
}

/**
 * Create test OTP
 */
export async function createTestOTP(userId: string, type: string = 'email_verification') {
  const otp = await prisma.otpVerification.create({
    data: {
      id: uuidv4(),
      userId,
      type,
      code: '1234',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      verified: false,
      attempts: 0,
    },
  });

  return otp;
}

/**
 * Create expired test OTP
 */
export async function createExpiredTestOTP(userId: string, type: string = 'email_verification') {
  const otp = await prisma.otpVerification.create({
    data: {
      id: uuidv4(),
      userId,
      type,
      code: '1234',
      expiresAt: new Date(Date.now() - 1000), // Already expired
      verified: false,
      attempts: 0,
    },
  });

  return otp;
}

/**
 * Create test refresh token
 */
export async function createTestRefreshToken(userId: string, tokenHash: string) {
  const token = await prisma.refreshToken.create({
    data: {
      id: uuidv4(),
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      revoked: false,
    },
  });

  return token;
}

/**
 * Create test login attempt
 */
export async function createTestLoginAttempt(email: string, success: boolean = false, attemptedAt?: Date) {
  const attempt = await prisma.loginAttempt.create({
    data: {
      id: uuidv4(),
      email,
      ipAddress: '127.0.0.1',
      success,
      attemptedAt: attemptedAt || new Date(),
    },
  });

  return attempt;
}

/**
 * Create multiple failed login attempts (recent, within block window)
 */
export async function createFailedLoginAttempts(email: string, count: number = 5) {
  const attempts: any[] = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    // Create attempts 1 minute apart, all within the last 5 minutes
    const attemptTime = new Date(now - (i * 60 * 1000));
    attempts.push(await createTestLoginAttempt(email, false, attemptTime));
  }
  return attempts;
}
