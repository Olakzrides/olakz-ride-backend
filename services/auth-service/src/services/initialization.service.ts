import { PrismaClient } from '../../node_modules/.prisma/auth-client';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger';
import config from '../config';

const prisma = new PrismaClient();

export class InitializationService {
  /**
   * Initialize admin users on service startup
   */
  static async initializeAdminUsers(): Promise<void> {
    try {
      logger.info('🔧 Initializing admin users...');

      // Hash password for admin users
      const adminPasswordHash = await bcrypt.hash('Admin@1234', config.security.bcryptRounds);

      // Create your preferred admin user
      const adminUser = await prisma.user.upsert({
        where: { email: 'enenchejohn56@gmail.com' },
        update: {
          roles: ['admin'],
          activeRole: 'admin',
          updatedAt: new Date(),
        },
        create: {
          email: 'enenchejohn56@gmail.com',
          passwordHash: adminPasswordHash,
          firstName: 'Admin',
          lastName: 'User',
          username: 'admin',
          roles: ['admin'],
          activeRole: 'admin',
          provider: 'emailpass',
          emailVerified: true,
          status: 'active',
        },
      });

      // Create super admin from environment variables (if provided)
      const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
      const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

      if (superAdminEmail && superAdminPassword) {
        const superAdminHash = await bcrypt.hash(superAdminPassword, config.security.bcryptRounds);
        
        const superAdmin = await prisma.user.upsert({
          where: { email: superAdminEmail.toLowerCase() },
          update: {
            roles: ['super_admin'],
            activeRole: 'super_admin',
            updatedAt: new Date(),
          },
          create: {
            email: superAdminEmail.toLowerCase(),
            passwordHash: superAdminHash,
            firstName: 'Super',
            lastName: 'Admin',
            username: 'superadmin',
            roles: ['super_admin'],
            activeRole: 'super_admin',
            provider: 'emailpass',
            emailVerified: true,
            status: 'active',
          },
        });

        logger.info('✅ Super admin initialized:', superAdmin.email);
      }

      // Create test admin for development
      if (config.env === 'development') {
        const testAdminHash = await bcrypt.hash('Test@1234', config.security.bcryptRounds);
        
        const testAdmin = await prisma.user.upsert({
          where: { email: 'admin@test.com' },
          update: {
            roles: ['admin'],
            activeRole: 'admin',
            updatedAt: new Date(),
          },
          create: {
            email: 'admin@test.com',
            passwordHash: testAdminHash,
            firstName: 'Test',
            lastName: 'Admin',
            username: 'testadmin',
            phone: '+1234567892',
            roles: ['admin'],
            activeRole: 'admin',
            provider: 'emailpass',
            emailVerified: true,
            status: 'active',
          },
        });

        logger.info('✅ Test admin initialized:', testAdmin.email);
      }

      logger.info('✅ Primary admin initialized:', adminUser.email);
      logger.info('🎉 Admin users initialization completed!');

    } catch (error: unknown) {
      logger.error('❌ Failed to initialize admin users:', error);
      throw error;
    } finally {
      await prisma.$disconnect();
    }
  }

  static async initialize(): Promise<void> {
    try {
      logger.info('🚀 Starting auth service initialization...');

      await this.initializeAdminUsers();

      logger.info('✅ Auth service initialization completed successfully!');
    } catch (error: unknown) {
      logger.error('❌ Auth service initialization failed:', error);
      throw error;
    }
  }
}