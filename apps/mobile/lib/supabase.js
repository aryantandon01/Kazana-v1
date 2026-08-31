import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const supabase = createClient(
  extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL,
  extra.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
