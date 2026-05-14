import { getSupabaseClient } from '../lib/supabaseClient.js';

const SEL = 'id, empresa_id, nombre, tipo, canal, fecha_inicio, fecha_fin, presupuesto, moneda, estado, descripcion, created_at, updated_at';

function generateCampanaId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `camp_${crypto.randomUUID()}`;
  }
  return `camp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toCampanaRow(datos) {
  return {
    ...datos,
    fecha_inicio: datos.fecha_inicio || null,
    fecha_fin: datos.fecha_fin || null,
    presupuesto: Number(datos.presupuesto || 0),
  };
}

function toNewCampanaRow(datos) {
  return {
    ...toCampanaRow(datos),
    id: datos.id || generateCampanaId(),
  };
}

export const campanasService = {
  async listar(empresaId) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('campanas')
      .select(SEL)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async crear(empresaId, datos) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('campanas')
      .insert({ ...toNewCampanaRow(datos), empresa_id: empresaId })
      .select(SEL)
      .single();
    if (error) throw error;
    return data;
  },

  async actualizar(id, datos) {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('campanas')
      .update({ ...toCampanaRow(datos), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SEL)
      .single();
    if (error) throw error;
    return data;
  },

  async cambiarEstado(id, estado) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('campanas')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async eliminar(id) {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('campanas')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};
