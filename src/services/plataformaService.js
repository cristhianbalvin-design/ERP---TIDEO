import { getSupabaseClient } from '../lib/supabaseClient.js';

export const plataformaService = {
  async listarEmpresas() {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('empresas')
      .select('id, razon_social, nombre_comercial, ruc, pais, moneda_base, zona_horaria, plan_id, estado, fecha_inicio, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async crearTenantConAdmin(payload) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('crear_tenant_con_admin', {
      p_razon_social: payload.razon_social,
      p_nombre_comercial: payload.nombre_comercial || payload.razon_social,
      p_ruc: payload.ruc || null,
      p_pais: payload.pais || 'PE',
      p_moneda_base: payload.moneda_base || 'PEN',
      p_zona_horaria: payload.zona_horaria || 'America/Lima',
      p_estado: payload.estado || 'activa',
      p_admin_email: payload.admin_email || null,
      p_admin_nombre: payload.admin_nombre || 'Administrador del tenant',
    });
    if (error) throw error;
    return data;
  },
};
