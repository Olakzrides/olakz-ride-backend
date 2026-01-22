import { PrismaClient } from '@prisma/client';
import logger from './logger';

class Database {
  private static instance: PrismaClient;

  static getInstance(): PrismaClient {
    if (!Database.instance) {
      Database.instance = new PrismaClient();
    }

    return Database.instance;
  }

  static async connect(): Promise<void> {
    try {
      const prisma = Database.getInstance();
      await prisma.$connect();
      logger.info('✅ Database connected successfully');
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  static async disconnect(): Promise<void> {
    try {
      const prisma = Database.getInstance();
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  }

  static async healthCheck(): Promise<boolean> {
    try {
      const prisma = Database.getInstance();
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

export default Database;