import { getSupabaseClient } from '../lib/supabaseClient.js';

export const nominaService = {
  // ─── Períodos ────────────────────────────────────────────────
  getPeriodos: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
      .order('quincena', { ascending: false, nullsFirst: false });
    if (error) { console.error('nominaService.getPeriodos:', error); return []; }
    return data || [];
  },

  upsertPeriodo: async (empresaId, periodo) => {
    const supabase = await getSupabaseClient();
    const { id, ...rest } = periodo;
    if (id && !id.startsWith('nom_')) {
      const { data, error } = await supabase
        .from('periodos_nomina')
        .update({ ...rest, actualizado_en: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await supabase
      .from('periodos_nomina')
      .insert([{ ...rest, empresa_id: empresaId }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  cerrarPeriodo: async (id, cerradoPor) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('periodos_nomina')
      .update({ estado: 'cerrado', cerrado_por: cerradoPor, cerrado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Detalle ─────────────────────────────────────────────────
  getDetalle: async (periodoId) => {
    if (!periodoId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('nomina_detalle')
      .select('*')
      .eq('periodo_id', periodoId);
    if (error) { console.error('nominaService.getDetalle:', error); return []; }
    return data || [];
  },

  guardarDetalle: async (empresaId, periodoId, filas) => {
    if (!filas.length) return [];
    const supabase = await getSupabaseClient();
    const rows = filas.map(f => ({
      ...f,
      empresa_id: empresaId,
      periodo_id: periodoId,
    }));
    const { data, error } = await supabase
      .from('nomina_detalle')
      .upsert(rows, { onConflict: 'periodo_id,trabajador_id' })
      .select();
    if (error) throw error;
    return data || [];
  },

  // ─── Config nómina en empresa_config ─────────────────────────
  getNominaConfig: async (empresaId) => {
    if (!empresaId) return {};
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('empresa_config')
      .select('regimen_laboral_empresa,frecuencia_pago,dia_corte_mensual,dia_pago_mensual,dia_corte_q1,dia_pago_q1,dia_corte_q2,dia_pago_q2,pct_quincena_1,uit_vigente,rmv_vigente,ram_tope_afp,pct_prima_seguro')
      .eq('empresa_id', empresaId)
      .single();
    if (error) return {};
    return data || {};
  },

  saveNominaConfig: async (empresaId, cfg) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('empresa_config')
      .upsert({ empresa_id: empresaId, ...cfg, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' });
    if (error) throw error;
  },
};
