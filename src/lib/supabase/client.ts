import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

let supabase: SupabaseClient | null = null;
let isSupabaseConfigured = false;

if (url && anonKey) {
  try {
    supabase = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    isSupabaseConfigured = true;
  } catch (err) {
    console.warn(
      "[nook] Supabase client init failed — using local mock backend.",
      err
    );
  }
}

export { isSupabaseConfigured, supabase };
