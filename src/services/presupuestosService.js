import { getSupabaseClient } from '../lib/supabaseClient.js';
import { validarSociedadActivaParaEscritura } from './sociedadEscrituraService.js';

export const presupuestosService = {
  async getPresupuestos(empresaId) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuestos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getPartidas(empresaId) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuesto_partidas')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getAprobaciones(empresaId) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuesto_aprobaciones')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async crearPresupuesto(payload) {
    const sb = await getSupabaseClient();
    const { sociedadId } = await validarSociedadActivaParaEscritura(
      sb, payload?.empresa_id, payload?.sociedad_id, 'Selecciona una sociedad para crear el presupuesto.',
    );
    const { data, error } = await sb
      .from('presupuestos')
      .insert({ ...payload, sociedad_id: sociedadId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async actualizarPresupuesto(id, updates) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuestos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async insertarPartidas(partidas) {
    if (!partidas.length) return [];
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuesto_partidas')
      .insert(partidas)
      .select();
    if (error) throw error;
    return data || [];
  },

  async reemplazarPartidas(presupuestoId, partidas) {
    const sb = await getSupabaseClient();
    await sb.from('presupuesto_partidas').delete().eq('presupuesto_id', presupuestoId);
    if (!partidas.length) return [];
    const { data, error } = await sb
      .from('presupuesto_partidas')
      .insert(partidas)
      .select();
    if (error) throw error;
    return data || [];
  },

  async insertarAprobaciones(aprobaciones) {
    if (!aprobaciones.length) return [];
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuesto_aprobaciones')
      .insert(aprobaciones)
      .select();
    if (error) throw error;
    return data || [];
  },

  async actualizarAprobacion(id, updates) {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('presupuesto_aprobaciones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
