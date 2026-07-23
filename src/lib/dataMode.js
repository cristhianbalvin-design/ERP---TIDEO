export const DATA_MODES = {
  MOCK: 'mock',
  SUPABASE: 'supabase',
};

export const getDataMode = () => {
  // La aplicación operativa debe fallar de forma visible si no se configuró
  // Supabase. El modo mock solo se habilita de forma explícita para demos.
  const mode = String(import.meta.env.VITE_DATA_MODE || DATA_MODES.SUPABASE).toLowerCase();
  return mode === DATA_MODES.SUPABASE ? DATA_MODES.SUPABASE : DATA_MODES.MOCK;
};

export const isSupabaseMode = () => getDataMode() === DATA_MODES.SUPABASE;

export const assertSupabaseModeReady = ({ isConfigured }) => {
  if (isSupabaseMode() && !isConfigured) {
    throw new Error('VITE_DATA_MODE=supabase requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
};
