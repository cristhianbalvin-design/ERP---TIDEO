import { getSupabaseClient } from '../lib/supabaseClient.js';

export const AFP_NOMBRES = ['Integra', 'Prima', 'Profuturo', 'Habitat'];
export const AFP_PRIMA_SEGURO_FALLBACK = 1.37;
export const AFP_PARAMETROS_DEFAULT = AFP_NOMBRES.map(afp_nombre => ({
  afp_nombre,
  pct_prima_seguro: AFP_PRIMA_SEGURO_FALLBACK,
  vigente_desde: '2026-01-01',
  fallback: true,
}));

export function normalizarAfpNombre(value) {
  const clean = String(value || '').replace(/^AFP\s*-\s*/i, '').trim().toLowerCase();
  return AFP_NOMBRES.find(n => n.toLowerCase() === clean) || '';
}

export function latestAfpParametros(rows = []) {
  const byAfp = new Map();
  rows.forEach(row => {
    const afp = normalizarAfpNombre(row.afp_nombre);
    if (!afp) return;
    const normalized = {
      ...row,
      afp_nombre: afp,
      pct_prima_seguro: Number(row.pct_prima_seguro ?? AFP_PRIMA_SEGURO_FALLBACK),
      vigente_desde: row.vigente_desde || '2026-01-01',
      fallback: false,
    };
    const current = byAfp.get(afp);
    if (!current || String(normalized.vigente_desde) > String(current.vigente_desde)) byAfp.set(afp, normalized);
  });
  return AFP_PARAMETROS_DEFAULT.map(base => ({ ...base, ...(byAfp.get(base.afp_nombre) || {}) }));
}

export function getPrimaSeguroAfp(afpNombre, rows = []) {
  const afp = normalizarAfpNombre(afpNombre);
  if (!afp) return AFP_PRIMA_SEGURO_FALLBACK;
  const explicitRows = (rows || []).filter(r => normalizarAfpNombre(r.afp_nombre) === afp && !r.fallback);
  if (!explicitRows.length) {
    console.warn(`[nomina] No se encontro prima de seguro para AFP ${afp}; usando fallback ${AFP_PRIMA_SEGURO_FALLBACK}%.`);
    return AFP_PRIMA_SEGURO_FALLBACK;
  }
  const row = latestAfpParametros(explicitRows).find(r => r.afp_nombre === afp);
  if (!row) {
    console.warn(`[nomina] No se encontro prima de seguro para AFP ${afp}; usando fallback ${AFP_PRIMA_SEGURO_FALLBACK}%.`);
    return AFP_PRIMA_SEGURO_FALLBACK;
  }
  return Number(row.pct_prima_seguro) || AFP_PRIMA_SEGURO_FALLBACK;
}

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
      .select('regimen_laboral_empresa,frecuencia_pago,dia_corte_mensual,dia_pago_mensual,dia_corte_q1,dia_pago_q1,dia_corte_q2,dia_pago_q2,pct_quincena_1,uit_vigente,rmv_vigente,ram_tope_afp')
      .eq('empresa_id', empresaId)
      .single();
    if (error) return {};
    return data || {};
  },

  saveNominaConfig: async (empresaId, cfg) => {
    const supabase = await getSupabaseClient();
    const { pct_prima_seguro: _deprecatedPrimaSeguro, ...safeCfg } = cfg || {};
    const { error } = await supabase
      .from('empresa_config')
      .upsert({ empresa_id: empresaId, ...safeCfg, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' });
    if (error) throw error;
  },

  getAfpParametros: async (empresaId) => {
    if (!empresaId) return AFP_PARAMETROS_DEFAULT;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('afp_parametros')
      .select('empresa_id,afp_nombre,pct_prima_seguro,vigente_desde,creado_en')
      .eq('empresa_id', empresaId)
      .lte('vigente_desde', new Date().toISOString().slice(0, 10))
      .order('afp_nombre', { ascending: true })
      .order('vigente_desde', { ascending: false });
    if (error) {
      console.warn('[nominaService.getAfpParametros]', error.message || error);
      return AFP_PARAMETROS_DEFAULT;
    }
    return latestAfpParametros(data || []);
  },

  saveAfpParametro: async (empresaId, row) => {
    const afp = normalizarAfpNombre(row.afp_nombre);
    if (!empresaId || !afp) throw new Error('AFP no valida.');
    const payload = {
      empresa_id: empresaId,
      afp_nombre: afp,
      pct_prima_seguro: Number(row.pct_prima_seguro),
      vigente_desde: row.vigente_desde || new Date().toISOString().slice(0, 10),
    };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('afp_parametros')
      .upsert(payload, { onConflict: 'empresa_id,afp_nombre,vigente_desde' })
      .select('empresa_id,afp_nombre,pct_prima_seguro,vigente_desde,creado_en')
      .single();
    if (error) throw error;
    return data;
  },
};
