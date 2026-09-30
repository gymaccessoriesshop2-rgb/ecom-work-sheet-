import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ssjfjplazcrfdwfozqvg.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzamZqcGxhemNyZmR3Zm96cXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NDkyMzksImV4cCI6MjEwNjMyNTIzOX0.Yy7N372XKjko0s-zLMbg5mjjrPtXvsNa65odYa4SBBs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
