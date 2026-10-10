type EnvReader = (name: string) => string | undefined;

const readEnv: EnvReader = (name) => Deno.env.get(name);

export function getSupabaseServiceRoleKey(env: EnvReader = readEnv): string {
  return env("ERP_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY") || "";
}

export function getSupabaseAnonKey(env: EnvReader = readEnv): string {
  return env("ERP_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY") || "";
}
