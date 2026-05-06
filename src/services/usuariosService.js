import { getSupabaseClient } from '../lib/supabaseClient.js';

export const usuariosService = {
  async getUsuarios(empresaId) {
    const supabase = await getSupabaseClient();
    const { data: fnData, error: fnError } = await supabase.functions.invoke('listar-usuarios-acceso', {
      body: { empresa_id: empresaId },
    });
    if (fnError) {
      let message = fnError.message;
      try {
        const body = await fnError.context?.json?.();
        message = body?.error || message;
      } catch { /* ignore */ }
      throw new Error(message || 'No se pudieron cargar usuarios.');
    }
    if (fnData?.success) return fnData.usuarios || [];
    if (fnData && !fnData.success) throw new Error(fnData.error || 'No se pudieron cargar usuarios.');

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

  async actualizarUsuarioAcceso(usuario) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('actualizar-usuario-acceso', {
      body: usuario,
    });
    if (error) {
      let message = error.message;
      try {
        const body = await error.context?.json?.();
        message = body?.error || message;
      } catch { /* ignore */ }
      throw new Error(message || 'No se pudo actualizar el usuario.');
    }
    if (!data?.success) throw new Error(data?.error || 'No se pudo actualizar el usuario.');
    return data.user;
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
