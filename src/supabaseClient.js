import { createClient } from '@supabase/supabase-js';

const getEnv = (key) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process?.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  return undefined;
};

const supabaseUrl =
  getEnv('VITE_SUPABASE_URL') ||
  getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
  'https://mdijiutvafaszcnolwee.supabase.co';

const supabaseAnonKey =
  getEnv('VITE_SUPABASE_ANON_KEY') ||
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kaWppdXR2YWZhc3pjbm9sd2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTM1NjQsImV4cCI6MjEwNTQ2OTU2NH0.yKWXUMt-jSlgekKoehpUe0vspnEwQ5R7RsCBPNPotK4';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Missing Supabase Environment Variables in Production!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
