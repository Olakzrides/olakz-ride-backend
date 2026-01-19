import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config';
import logger from './logger';

// Create Supabase client with service role key for backend operations
const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey, // Use service role key if available
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Test connection (non-blocking)
async function testConnection() {
  try {
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      logger.warn('Supabase connection test warning:', error.message);
      logger.info('Service will continue - connection will be tested on first request');
    } else {
      logger.info('✅ Supabase connection successful');
    }
  } catch (error: any) {
    logger.warn('Supabase connection test warning:', error.message);
    logger.info('Service will continue - connection will be tested on first request');
  }
}

// Test connection on startup (non-blocking)
testConnection();

export default supabase;