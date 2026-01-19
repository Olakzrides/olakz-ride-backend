import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean up test data from database
 * Deletes all test-related records
 */
export async function cleanupTestData() {
  try {
    // Test database connection first
    await prisma.$connect();

    // Delete in correct order due to foreign key constraints
    await prisma.refreshToken.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test',
          },
        },
      },
    });

    await prisma.otpVerification.deleteMany({
      where: {
        user: {
          email: {
            contains: 'test',
          },
        },
      },
    });

    await prisma.loginAttempt.deleteMany({
      where: {
        email: {
          contains: 'test',
        },
      },
    });

    await prisma.otpResendTracking.deleteMany({
      where: {
        email: {
          contains: 'test',
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'test',
        },
      },
    });
  } catch (error: any) {
    // Only log error, don't fail tests if cleanup fails
    if (error.code === 'P1001' || error.message?.includes("Can't reach database")) {
      console.warn('⚠️  Database not reachable - skipping cleanup');
    } else {
      console.error('Error cleaning up test data:', error.message);
    }
  }
}

/**
 * Delete a specific user and all related data
 */
export async function deleteTestUser(email: string) {
  try {
    // Delete related data first
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.otpVerification.deleteMany({ where: { userId: user.id } });
      await prisma.loginAttempt.deleteMany({ where: { email } });
      await prisma.otpResendTracking.deleteMany({ where: { email } });
      await prisma.user.delete({ where: { email } });
    }
  } catch (error) {
    // User might not exist, that's okay
    console.warn(`Could not delete user ${email}:`, error);
  }
}

/**
 * Get Prisma client for tests
 */
export function getTestPrisma() {
  return prisma;
}

/**
 * Disconnect Prisma client
 */
export async function disconnectTestDb() {
  await prisma.$disconnect();
}
