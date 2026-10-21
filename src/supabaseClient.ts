import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://mdijiutvafaszcnolwee.supabase.co';
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kaWppdXR2YWZhc3pjbm9sd2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4OTM1NjQsImV4cCI6MjEwNTQ2OTU2NH0.yKWXUMt-jSlgekKoehpUe0vspnEwQ5R7RsCBPNPotK4';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("CRITICAL: Missing Supabase Environment Variables in Production!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
