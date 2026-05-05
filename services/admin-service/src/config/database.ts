import { createClient } from '@supabase/supabase-js';
import config from './index';

// Use service role key for admin operations (bypasses RLS)
export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
