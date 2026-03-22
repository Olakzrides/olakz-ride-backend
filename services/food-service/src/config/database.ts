import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
