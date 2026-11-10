import { createClient } from 'npm:@supabase/supabase-js@2';
import { getSupabaseAnonKey } from '../_shared/supabaseKeys.ts';
import { createHandler, type SupabaseLike } from './handler.ts';

const env = (name: string) => Deno.env.get(name);

Deno.serve(createHandler({
  env,
  fetch,
  createSupabase: (token: string) => {
    const url = env('SUPABASE_URL');
    const anon = getSupabaseAnonKey(env);
    if (!url || !anon) throw new Error('Configuración incompleta');
    return createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }) as unknown as SupabaseLike;
  },
}));
