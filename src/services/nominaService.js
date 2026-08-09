import { getSupabaseClient } from '../lib/supabaseClient.js';
import { obtenerEstadoMultisociedad, validarSociedadActivaParaEscritura } from './sociedadEscrituraService.js';

// Clasificación remunerativo/no-remunerativo por sub_tipo de ingresos_extraordinarios.
// 'otro' es remunerativo por defecto (presunción general de la ley laboral peruana:
// todo pago se presume remunerativo salvo excepción legal expresa) — si surge un caso
// "otro" que realmente sea no remunerativo, se debe agregar un sub_tipo nuevo específico,
// no reclasificar 'otro'.
// PENDIENTE DE VALIDACIÓN FINAL CON EL CONTADOR antes de usar en producción real:
// bono_desempeño (¿depende de habitualidad/regularidad?), utilidades (no remunerativo
// para CTS/gratificación, pero puede tributar IR 5ta distinto) y
// alimentacion_indispensable (Ley 28051 distingue "principal" de "indispensable" con
// tratamientos distintos). "Los cálculos son referenciales. Valida con tu contador."
export const INGRESO_EXTRAORDINARIO_SUBTIPOS = {
  bono_desempeño:              { label: 'Bono de desempeño',            es_remunerativo: true },
  gratificacion_extraordinaria: { label: 'Gratificación extraordinaria', es_remunerativo: false },
  utilidades:                  { label: 'Utilidades',                   es_remunerativo: false },
  alimentacion_indispensable:  { label: 'Alimentación indispensable',   es_remunerativo: false },
  condicion_trabajo:           { label: 'Condición de trabajo',         es_remunerativo: false },
  otro:                        { label: 'Otro',                        es_remunerativo: true },
};

export function esRemunerativoPorSubTipo(subTipo) {
  return INGRESO_EXTRAORDINARIO_SUBTIPOS[subTipo]?.es_remunerativo ?? true;
}

export const AFP_NOMBRES = ['Integra', 'Prima', 'Profuturo', 'Habitat'];
export const AFP_PRIMA_SEGURO_FALLBACK = 1.37;
export const AFP_PARAMETROS_DEFAULT = AFP_NOMBRES.map(afp_nombre => {
  const tasas = {
    'Habitat': { pct_comision_flujo: 1.47, pct_comision_mixta_saldo: 1.25 },
    'Integra': { pct_comision_flujo: 1.55, pct_comision_mixta_saldo: 0.78 },
    'Prima': { pct_comision_flujo: 1.60, pct_comision_mixta_saldo: 1.25 },
    'Profuturo': { pct_comision_flujo: 1.69, pct_comision_mixta_saldo: 0.68 }
  };
  return {
    afp_nombre,
    pct_prima_seguro: AFP_PRIMA_SEGURO_FALLBACK,
    pct_comision_flujo: tasas[afp_nombre]?.pct_comision_flujo || 0,
    pct_comision_mixta_saldo: tasas[afp_nombre]?.pct_comision_mixta_saldo || 0,
    vigente_desde: '2026-01-01',
    fallback: true,
  };
});

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
      pct_comision_flujo: Number(row.pct_comision_flujo ?? 0),
      pct_comision_mixta_saldo: Number(row.pct_comision_mixta_saldo ?? 0),
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

// Arma explícitamente la fila de nomina_detalle a partir de un elemento de `calculos`
// (whitelist + rename) — nunca spread directo: calculos[i] trae objetos anidados
// (trabajador, turno, periodo, datosNomina), nombres de campo distintos a las columnas
// (dias_asistidos→dias_laborados, comision_flujo→comision_afp_flujo, prima_seguro→
// prima_seguro_afp) y campos que no existen en el esquema (tramos, valor_dia, etc.).
export function mapCalculoANominaDetalle(c, periodo, empresaCfgResuelta = {}) {
  const quincena = periodo?.quincena ?? null;
  return {
    trabajador_id: c.trabajador_id,
    // Nomina() arma `trabajadores` con el campo `tipo` ('operativo'/'admin'), no
    // `trabajador_tipo` — ese otro nombre lo usan componentes distintos del archivo.
    trabajador_tipo: c.trabajador?.tipo === 'admin' ? 'administrativo' : 'operativo',
    // c.sistema_pensionario (no c.trabajador.sistema_pensionario) es el valor YA resuelto
    // por el motor: datosNomina?.sistema_pensionario || trabajador.sistema_pensionario || 'AFP'.
    sistema_pensionario: c.sistema_pensionario === 'ONP' ? 'ONP' : (c.sistema_pensionario === 'AFP' ? 'AFP' : null),
    regimen_jornada_snap: c.regimen_jornada ?? null,
    regimen_empresa_snap: c.regimen_empresa ?? null,
    dias_laborables: c.dias_laborables ?? null,
    dias_laborados: c.dias_asistidos ?? null,
    dias_computables: c.dias_computables ?? null,
    horas_extra_tramo1_min: Number(c.horas_extra_tramo1_min) || 0,
    horas_extra_tramo2_min: Number(c.horas_extra_tramo2_min) || 0,
    sueldo_base: Number(c.sueldo_base) || 0,
    remuneracion_bruta: Number(c.remuneracion_bruta) || 0,
    asignacion_familiar: Number(c.asignacion_familiar) || 0,
    add_horas_extra: Number(c.add_horas_extra) || 0,
    bonif_altitud: Number(c.bonif_altitud) || 0,
    // Suma de ingresos_extraordinarios NO remunerativos aprobados (Frente 4). Los
    // remunerativos NO se repiten aca: ya estan dentro de remuneracion_bruta.
    otros_ingresos: Number(c.otros_ingresos) || 0,
    desc_faltas: Number(c.desc_faltas) || 0,
    desc_tardanzas: Number(c.desc_tardanzas) || 0,
    aporte_afp: Number(c.aporte_afp) || 0,
    comision_afp_flujo: Number(c.comision_flujo) || 0,
    prima_seguro_afp: Number(c.prima_seguro) || 0,
    desc_onp: Number(c.desc_onp) || 0,
    retencion_ir: Number(c.retencion_ir) || 0,
    desc_prestamo: Number(c.desc_prestamo) || 0,
    desc_anticipo: Number(c.desc_anticipo) || 0,
    desc_judicial: Number(c.desc_judicial) || 0,
    desc_extraordinario: Number(c.desc_extraordinario) || 0,
    total_descuentos: Number(c.total_descuentos) || 0,
    neto: Number(c.neto) || 0,
    essalud: Number(c.essalud) || 0,
    cts_mensualizado: Number(c.cts_mensualizado) || 0,
    tiene_cts: Boolean(c.tiene_cts),
    gratificacion_mensualizada: Number(c.gratificacion_mensualizada) || 0,
    bonif_extraordinaria: Number(c.bonif_extraordinaria) || 0,
    tiene_gratificacion: Boolean(c.tiene_gratificacion),
    vacaciones_mensualizadas: Number(c.vacaciones_mensualizadas) || 0,
    total_cargas: Number(c.total_cargas) || 0,
    costo_real_empresa: Number(c.costo_real_empresa) || 0,
    es_quincena: quincena != null,
    quincena,
    // Refleja el % efectivamente aplicado por el motor (Rama Q1), no un valor recalculado
    // aparte. Q2 hoy todavia calcula al 100% (factorQuincena=1, Rama Q2 aun no implementada):
    // guardar 50/50 teorico seria incorrecto y no coincidiria con lo que el motor uso.
    pct_quincena_aplicado: quincena === 1 ? Number(empresaCfgResuelta?.pct_quincena_1 ?? 50) : (quincena === 2 ? 100 : null),
  };
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

  // Borrado + insercion transaccional de todo el detalle de un periodo (RPC de Postgres,
  // migracion 333). Reemplaza filas huerfanas de un "Procesar" anterior con roster distinto;
  // ambas operaciones ocurren dentro de la misma transaccion de la funcion en el servidor.
  guardarDetalle: async (empresaId, periodoId, filas, sociedadId = null) => {
    if (!filas.length) return 0;
    const supabase = await getSupabaseClient();
    const multisociedadHabilitado = await obtenerEstadoMultisociedad(supabase, empresaId);
    const sociedadValidada = multisociedadHabilitado
      ? (await validarSociedadActivaParaEscritura(
          supabase, empresaId, sociedadId, 'El período de nómina debe tener una sociedad.',
        )).sociedadId
      : null;
    const rpc = multisociedadHabilitado ? 'guardar_nomina_detalle_periodo_sociedad' : 'guardar_nomina_detalle_periodo';
    const params = {
      p_empresa_id: empresaId,
      p_periodo_id: periodoId,
      p_filas: filas,
      ...(multisociedadHabilitado ? { p_sociedad_id: sociedadValidada } : {}),
    };
    const { data, error } = await supabase.rpc(rpc, params);
    if (error) throw error;
    return data ?? 0;
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
      .select('empresa_id,afp_nombre,pct_prima_seguro,pct_comision_flujo,pct_comision_mixta_saldo,vigente_desde,creado_en')
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
      pct_comision_flujo: Number(row.pct_comision_flujo || 0),
      pct_comision_mixta_saldo: Number(row.pct_comision_mixta_saldo || 0),
      vigente_desde: row.vigente_desde || new Date().toISOString().slice(0, 10),
    };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('afp_parametros')
      .upsert(payload, { onConflict: 'empresa_id,afp_nombre,vigente_desde' })
      .select('empresa_id,afp_nombre,pct_prima_seguro,pct_comision_flujo,pct_comision_mixta_saldo,vigente_desde,creado_en')
      .single();
    if (error) throw error;
    return data;
  },
};
