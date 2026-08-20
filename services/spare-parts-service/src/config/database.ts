import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Prisma Client
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Supabase Client (lazy singleton — initialised after env vars are loaded)
let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set'
      );
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Proxy for backward-compatible access — same pattern as car-wash-service
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('✅ Spare Parts DB connection successful');
    return true;
  } catch (error) {
    console.error('❌ Spare Parts DB connection failed:', error);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('Spare Parts Database disconnected');
}
