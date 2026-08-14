import { createClient } from '@supabase/supabase-js';

let client;

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseClient() {
  if (client) return client;
  if (!isSupabaseConfigured()) {
    throw new Error('Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para Operaciones.');
  }
  client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
