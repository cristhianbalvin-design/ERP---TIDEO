import { getSupabaseClient } from '../lib/supabaseClient.js';

export const auditoriaService = {
  registrar: async (payload) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('auditoria')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
