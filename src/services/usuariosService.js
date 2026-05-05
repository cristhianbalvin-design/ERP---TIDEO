import { getSupabaseClient } from '../lib/supabaseClient.js';

export const usuariosService = {
  async getUsuarios(empresaId) {
    const supabase = await getSupabaseClient();
    const { data: fnData, error: fnError } = await supabase.functions.invoke('listar-usuarios-acceso', {
      body: { empresa_id: empresaId },
    });
    if (!fnError && fnData?.success) return fnData.usuarios || [];

    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre');
    if (error) throw error;
    return data || [];
  },

  async registrarUsuario(usuario) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('usuarios')
      .upsert([usuario])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async eliminarUsuario(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};
