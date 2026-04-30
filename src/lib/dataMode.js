export const DATA_MODES = {
  MOCK: 'mock',
  SUPABASE: 'supabase',
};

export const getDataMode = () => {
  const mode = String(import.meta.env.VITE_DATA_MODE || DATA_MODES.MOCK).toLowerCase();
  return mode === DATA_MODES.SUPABASE ? DATA_MODES.SUPABASE : DATA_MODES.MOCK;
};

export const isSupabaseMode = () => getDataMode() === DATA_MODES.SUPABASE;

export const assertSupabaseModeReady = ({ isConfigured }) => {
  if (isSupabaseMode() && !isConfigured) {
    throw new Error('VITE_DATA_MODE=supabase requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }
};
