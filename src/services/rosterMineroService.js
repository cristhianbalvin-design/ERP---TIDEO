import { getSupabaseClient } from '../lib/supabaseClient.js';
import { getDataMode } from '../lib/dataMode.js';

const genId = () => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `roster_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

// ── Función pura de estado de ciclo minero ────────────────────────────────────
// Consumida por: ControlAsistencia (GAP-11), Roster (GAP-16), Portal del Empleado (Ola 4), App Móvil (Ola 5).

/**
 * Calcula el estado actual del ciclo minero para un trabajador.
 *
 * @param {object} params
 * @param {string} params.fechaInicioCiclo    - 'YYYY-MM-DD' inicio del primer ciclo
 * @param {number} params.diasTrabajo         - días de trabajo del régimen (ej: 14, 20, 28, 2)
 * @param {number} params.diasDescanso        - días de descanso del régimen (ej: 7, 10, 14, 1)
 * @param {string} [params.fechaEval]         - fecha a evaluar ('YYYY-MM-DD'); default hoy
 * @param {boolean} [params.tieneInduccion]   - si el ciclo tiene período de inducción
 * @param {number} [params.diasInduccion]     - días de inducción inicial
 * @param {string} [params.fechaFinInduccion] - 'YYYY-MM-DD' fin de la inducción
 *
 * @returns {{
 *   estado: 'en_mina'|'en_descanso'|'en_induccion',
 *   diaCiclo: number,
 *   totalDiasCiclo: number,
 *   diasEnMinaMes: number,
 *   diasDescansoGanados: number,
 *   proximaBajada: string|null,
 *   estaEnInduccion: boolean,
 *   progresoPct: number
 * }}
 */
export function calcularEstadoCicloMinero({
  fechaInicioCiclo,
  diasTrabajo,
  diasDescanso,
  fechaEval = null,
  tieneInduccion = false,
  diasInduccion = 0,
  fechaFinInduccion = null,
}) {
  if (!fechaInicioCiclo || !diasTrabajo || !diasDescanso) {
    return {
      estado: 'en_mina', diaCiclo: 1, totalDiasCiclo: diasTrabajo + diasDescanso || 0,
      diasEnMinaMes: 0, diasDescansoGanados: 0, proximaBajada: null,
      estaEnInduccion: false, progresoPct: 0,
    };
  }

  const hoy = fechaEval ? new Date(fechaEval + 'T00:00:00') : new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(fechaInicioCiclo + 'T00:00:00');
  inicio.setHours(0, 0, 0, 0);

  const duracionCiclo = diasTrabajo + diasDescanso;
  const diffMs = hoy.getTime() - inicio.getTime();
  const diffDias = Math.floor(diffMs / 86400000);

  if (diffDias < 0) {
    return {
      estado: 'en_mina', diaCiclo: 1, totalDiasCiclo: duracionCiclo,
      diasEnMinaMes: 0, diasDescansoGanados: 0, proximaBajada: fechaInicioCiclo,
      estaEnInduccion: false, progresoPct: 0,
    };
  }

  // Verificar si está en inducción
  const estaEnInduccion = tieneInduccion && fechaFinInduccion
    ? hoy <= new Date(fechaFinInduccion + 'T00:00:00')
    : (tieneInduccion && diasInduccion > 0 && diffDias < diasInduccion);

  const diaDentroDelCiclo = diffDias % duracionCiclo; // 0-based
  const esTrabajo = diaDentroDelCiclo < diasTrabajo;
  const estado = estaEnInduccion ? 'en_induccion' : (esTrabajo ? 'en_mina' : 'en_descanso');

  // Calcular días en el mes actual
  const mesActualInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const mesActualFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  let diasEnMinaMes = 0;
  let diasInduccionMes = 0;
  const cursor = new Date(mesActualInicio);
  while (cursor <= mesActualFin && cursor <= hoy) {
    const diffCursor = Math.floor((cursor.getTime() - inicio.getTime()) / 86400000);
    if (diffCursor >= 0) {
      const enInduccion = tieneInduccion && fechaFinInduccion
        ? cursor <= new Date(fechaFinInduccion + 'T00:00:00')
        : (tieneInduccion && diasInduccion > 0 && diffCursor < diasInduccion);
      const diaEnCiclo = diffCursor % duracionCiclo;
      if (diaEnCiclo < diasTrabajo) {
        if (enInduccion) diasInduccionMes++;
        else diasEnMinaMes++;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Días de descanso ganados: (dias en mina real, excluye inducción) × ratio
  const ratio = diasDescanso / diasTrabajo;
  const diasDescansoGanados = Math.round(diasEnMinaMes * ratio * 100) / 100;

  // Próxima bajada: inicio del próximo período de descanso
  const diaActual = diffDias % duracionCiclo;
  const diasHastaDescanso = diaActual < diasTrabajo
    ? diasTrabajo - diaActual
    : duracionCiclo - diaActual + diasTrabajo;
  const proximaBajada = new Date(hoy);
  proximaBajada.setDate(proximaBajada.getDate() + diasHastaDescanso);
  const proximaBajadaStr = proximaBajada.toISOString().split('T')[0];

  const progresoPct = Math.round((diaDentroDelCiclo / duracionCiclo) * 100);

  return {
    estado,
    diaCiclo: diaDentroDelCiclo + 1,
    totalDiasCiclo: duracionCiclo,
    diasEnMinaMes,
    diasInduccionMes,
    diasDescansoGanados,
    proximaBajada: estado === 'en_descanso' ? null : proximaBajadaStr,
    estaEnInduccion,
    progresoPct,
  };
}

/**
 * Genera el estado día por día de un trabajador minero para un rango de fechas,
 * combinando el cálculo teórico del ciclo (calcularEstadoCicloMinero) con el
 * registro real de asistencia cuando existe. No modifica ni depende del estado
 * interno de calcularEstadoCicloMinero — solo la envuelve.
 *
 * Prioridad por día:
 *   1. Antes de fechaInicioCiclo (o sin fechaInicioCiclo) → 'sin_ciclo'
 *   2. Fecha pasada u hoy, con registro real de asistencia → 'real'
 *   3. Fecha futura, o pasada sin registro real todavía    → 'teorico'
 *
 * @param {object} params
 * @param {string} params.trabajadorId       - id para matchear contra registros.trabajador_id
 * @param {string} params.fechaInicioCiclo
 * @param {number} params.diasTrabajo
 * @param {number} params.diasDescanso
 * @param {boolean} [params.tieneInduccion]
 * @param {number} [params.diasInduccion]
 * @param {string} [params.fechaFinInduccion]
 * @param {string} params.fechaInicio        - 'YYYY-MM-DD' inicio del rango a generar
 * @param {string} params.fechaFin           - 'YYYY-MM-DD' fin del rango a generar
 * @param {Array}  [params.registros]        - registros_asistencia; se filtran por trabajadorId
 * @param {Array}  [params.ajustes]          - roster_minero_ajustes; se filtran por trabajadorId (personal_id).
 *                                             Un ajuste 'aprobado' prevalece sobre real y teorico; uno 'pendiente'
 *                                             no cambia el resultado pero se expone en ajustePendiente.
 * @param {string} [params.hoy]              - 'YYYY-MM-DD' fecha de referencia; default hoy real
 *
 * @returns {Array<{ fecha: string, origen: 'sin_ciclo'|'real'|'teorico'|'ajuste', estado: string, detalle: object|null, ajustePendiente: object|null, ajusteAprobado: object|null, registro: object|null, teorico: object|null, pendienteRevision: boolean }>}
 */
export function calcularRangoRosterMinero({
  trabajadorId,
  fechaInicioCiclo,
  diasTrabajo,
  diasDescanso,
  tieneInduccion = false,
  diasInduccion = 0,
  fechaFinInduccion = null,
  fechaInicio,
  fechaFin,
  registros = [],
  ajustes = [],
  hoy = null,
}) {
  const hoyStr = hoy || new Date().toISOString().split('T')[0];
  const registrosTrabajador = registros.filter(r => r.trabajador_id === trabajadorId);
  const ajustesTrabajador = ajustes.filter(a => a.personal_id === trabajadorId);

  const dias = [];
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    dias.push(d.toISOString().split('T')[0]);
  }

  return dias.map(fechaStr => {
    const ajustesDia = ajustesTrabajador.filter(a => a.fecha === fechaStr);
    const ajusteAprobado = ajustesDia.find(a => a.estado === 'aprobado') || null;
    const ajustePendiente = ajustesDia.find(a => a.estado === 'pendiente') || null;

    // sinCiclo/teorico/registro se calculan siempre (aunque un ajuste ya haya
    // decidido el día) únicamente para exponerlos en el objeto devuelto — los
    // consumidores (íconos de la grilla) necesitan ver el dato real subyacente
    // incluso cuando el fondo final lo decide el ajuste. No cambia qué rama
    // decide el día ni el balance: eso sigue siendo exactamente lo de antes.
    const sinCiclo = !fechaInicioCiclo || fechaStr < fechaInicioCiclo;
    const teorico = sinCiclo ? null : calcularEstadoCicloMinero({
      fechaInicioCiclo, diasTrabajo, diasDescanso,
      fechaEval: fechaStr, tieneInduccion, diasInduccion, fechaFinInduccion,
    });
    const registro = (!sinCiclo && fechaStr <= hoyStr)
      ? registrosTrabajador
          .filter(r => r.fecha === fechaStr)
          .reduce((masReciente, r) => (!masReciente || new Date(r.created_at) > new Date(masReciente.created_at)) ? r : masReciente, null)
      : null;

    if (ajusteAprobado) {
      return { fecha: fechaStr, origen: 'ajuste', estado: ajusteAprobado.tipo_dia_solicitado, detalle: ajusteAprobado, ajustePendiente: null, ajusteAprobado, registro, teorico, pendienteRevision: false };
    }

    if (sinCiclo) {
      return { fecha: fechaStr, origen: 'sin_ciclo', estado: 'sin_ciclo_vigente', detalle: null, ajustePendiente, ajusteAprobado: null, registro: null, teorico: null, pendienteRevision: false };
    }

    if (registro) {
      // 'incompleto' sin ajuste aprobado: no queda claro si fue trabajo o
      // descanso — pendiente de revisión (ajuste manual o falta en Asistencia).
      return { fecha: fechaStr, origen: 'real', estado: registro.estado, detalle: registro, ajustePendiente, ajusteAprobado: null, registro, teorico, pendienteRevision: registro.estado === 'incompleto' };
    }

    return { fecha: fechaStr, origen: 'teorico', estado: teorico.estado, detalle: teorico, ajustePendiente, ajusteAprobado: null, registro: null, teorico, pendienteRevision: false };
  });
}

// ── Mock data ─────────────────────────────────────────────────────────────────

let mockSnapshots = [
  {
    id: 'roster_001', empresa_id: 'emp_001',
    personal_id: 'per_001', personal_nombre: 'Carlos Quispe', personal_tipo: 'operativo',
    periodo_anio: 2026, periodo_mes: 5,
    regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 20, dias_ciclo_descanso: 10,
    dias_en_mina: 20, dias_induccion: 0, dias_efectivos_descanso: 20,
    dias_descanso_ganados: 10, dias_descanso_gozados: 0, dias_pendientes_revision: 0,
    balance_periodo: 10, balance_acumulado: 10,
    calculado_en: '2026-05-31T18:00:00Z', calculado_por: 'RRHH Demo',
    periodo_cerrado: true, nomina_periodo_id: null,
  },
  {
    id: 'roster_002', empresa_id: 'emp_001',
    personal_id: 'per_001', personal_nombre: 'Carlos Quispe', personal_tipo: 'operativo',
    periodo_anio: 2026, periodo_mes: 6,
    regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 20, dias_ciclo_descanso: 10,
    dias_en_mina: 10, dias_induccion: 0, dias_efectivos_descanso: 10,
    dias_descanso_ganados: 5, dias_descanso_gozados: 10, dias_pendientes_revision: 0,
    balance_periodo: -5, balance_acumulado: 5,
    calculado_en: '2026-06-11T18:00:00Z', calculado_por: 'RRHH Demo',
    periodo_cerrado: false, nomina_periodo_id: null,
  },
  {
    id: 'roster_003', empresa_id: 'emp_001',
    personal_id: 'per_003', personal_nombre: 'Jorge Mamani', personal_tipo: 'operativo',
    periodo_anio: 2026, periodo_mes: 6,
    regimen_jornada: 'ciclo_acumulativo', dias_ciclo_trabajo: 14, dias_ciclo_descanso: 7,
    dias_en_mina: 14, dias_induccion: 5, dias_efectivos_descanso: 9,
    dias_descanso_ganados: 4.5, dias_descanso_gozados: 0, dias_pendientes_revision: 0,
    balance_periodo: 4.5, balance_acumulado: 4.5,
    calculado_en: '2026-06-11T18:00:00Z', calculado_por: 'RRHH Demo',
    periodo_cerrado: false, nomina_periodo_id: null,
  },
];

// ── CRUD snapshots ────────────────────────────────────────────────────────────

export async function getSnapshotsRoster(empresaId, periodoAnio = null, periodoMes = null) {
  if (!empresaId) return [];
  if (getDataMode() !== 'supabase') {
    let rows = mockSnapshots.filter(s => s.empresa_id === empresaId);
    if (periodoAnio) rows = rows.filter(s => s.periodo_anio === periodoAnio);
    if (periodoMes) rows = rows.filter(s => s.periodo_mes === periodoMes);
    return rows;
  }
  const supabase = await getSupabaseClient();
  let query = supabase.from('roster_minero_snapshots').select('*').eq('empresa_id', empresaId);
  if (periodoAnio) query = query.eq('periodo_anio', periodoAnio);
  if (periodoMes) query = query.eq('periodo_mes', periodoMes);
  const { data, error } = await query.order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Calcula y persiste el roster del período para todos los trabajadores mineros.
 * Solo puede ejecutarse sobre períodos abiertos (no cerrados).
 * @param {Array} [ajustes] - roster_minero_ajustes ya aprobados y filtrados al
 *   período por el llamador (ver recalcularRoster en pages_ops.jsx); se pasan
 *   tal cual a calcularRosterPeriodo, que decide con prioridad sobre todo lo demás.
 */
export async function calcularYGuardarRoster(empresaId, periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes = [], calculadoPor, nominaPeriodoId = null) {
  if (getDataMode() !== 'supabase') {
    const nuevosPorPersonal = calcularRosterPeriodo(periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes);
    // Sobreescribir snapshots del período
    mockSnapshots = [
      ...mockSnapshots.filter(s => !(s.empresa_id === empresaId && s.periodo_anio === periodoAnio && s.periodo_mes === periodoMes)),
      ...nuevosPorPersonal.map((row, i) => ({
        id: `roster_mock_${Date.now()}_${i}`,
        empresa_id: empresaId,
        ...row,
        calculado_en: new Date().toISOString(),
        calculado_por: calculadoPor,
        periodo_cerrado: false,
        nomina_periodo_id: nominaPeriodoId || null,
      })),
    ];
    return nuevosPorPersonal;
  }

  const supabase = await getSupabaseClient();

  // Verificar que el período no esté cerrado
  const { data: existing } = await supabase
    .from('roster_minero_snapshots')
    .select('id, periodo_cerrado')
    .eq('empresa_id', empresaId)
    .eq('periodo_anio', periodoAnio)
    .eq('periodo_mes', periodoMes)
    .limit(1)
    .maybeSingle();

  if (existing?.periodo_cerrado) {
    throw new Error('No se puede recalcular un período con nómina cerrada.');
  }

  // Obtener balance acumulado del período anterior
  const mesAnterior = periodoMes === 1 ? 12 : periodoMes - 1;
  const anioAnterior = periodoMes === 1 ? periodoAnio - 1 : periodoAnio;
  const { data: snapsAnt } = await supabase
    .from('roster_minero_snapshots')
    .select('personal_id, balance_acumulado')
    .eq('empresa_id', empresaId)
    .eq('periodo_anio', anioAnterior)
    .eq('periodo_mes', mesAnterior);
  const acumuladoAnt = new Map((snapsAnt || []).map(s => [s.personal_id, Number(s.balance_acumulado)]));

  const filas = calcularRosterPeriodo(periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes);

  const upserts = filas.map(f => ({
    id: genId(),
    empresa_id: empresaId,
    ...f,
    balance_acumulado: (acumuladoAnt.get(f.personal_id) ?? 0) + f.balance_periodo,
    calculado_en: new Date().toISOString(),
    calculado_por: calculadoPor,
    periodo_cerrado: false,
    nomina_periodo_id: nominaPeriodoId || null,
  }));

  const { data, error } = await supabase
    .from('roster_minero_snapshots')
    .upsert(upserts, { onConflict: 'empresa_id,personal_id,periodo_anio,periodo_mes' })
    .select();
  if (error) throw error;
  return data || [];
}

export async function cerrarRosterPeriodo(empresaId, periodoAnio, periodoMes, nominaPeriodoId) {
  if (getDataMode() !== 'supabase') {
    mockSnapshots = mockSnapshots.map(s => {
      if (s.empresa_id === empresaId && s.periodo_anio === periodoAnio && s.periodo_mes === periodoMes) {
        return { ...s, periodo_cerrado: true, nomina_periodo_id: nominaPeriodoId };
      }
      return s;
    });
    return;
  }
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('roster_minero_snapshots')
    .update({ periodo_cerrado: true, nomina_periodo_id: nominaPeriodoId })
    .eq('empresa_id', empresaId)
    .eq('periodo_anio', periodoAnio)
    .eq('periodo_mes', periodoMes);
  if (error) throw error;
}

// ── Ajustes manuales de roster (swap trabajo <-> descanso) ───────────────────
// La aprobación cuando la fecha cae en un periodo de nómina ya procesado la
// bloquea el trigger bloquear_aprobacion_ajuste_roster_cerrado (migración 332),
// que reutiliza tal cual el permiso del retro wall de contratos
// (personal_documentos_puede_forzar_retro). No se duplica esa validación aquí.

let mockAjustes = [];

/**
 * Crea una solicitud de ajuste manual de día (queda en estado 'pendiente').
 * El motivo es obligatorio; la tabla también lo exige (constraint), esto solo
 * da un mensaje de error más claro antes de llegar a la base.
 */
export async function crearAjusteRosterMinero(empresaId, params) {
  const motivo = (params.motivo || '').trim();
  if (!motivo) throw new Error('El motivo del ajuste es obligatorio.');
  if (params.tipoDiaSolicitado === params.tipoDiaAntes) {
    throw new Error('El tipo de día solicitado debe ser distinto al tipo de día actual.');
  }

  const row = {
    id: genId(),
    empresa_id: empresaId,
    personal_id: params.personalId,
    personal_tipo: params.personalTipo,
    fecha: params.fecha,
    tipo_dia_antes: params.tipoDiaAntes,
    tipo_dia_solicitado: params.tipoDiaSolicitado,
    motivo,
    solicitado_por: params.solicitadoPor || null,
    estado: 'pendiente',
  };

  if (getDataMode() !== 'supabase') {
    const nuevo = { ...row, solicitado_en: new Date().toISOString(), periodo_cerrado: false, aprobado_por: null, resuelto_en: null };
    mockAjustes = [...mockAjustes, nuevo];
    return nuevo;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('roster_minero_ajustes').insert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function getAjustesRosterMinero(empresaId, personalId = null) {
  if (getDataMode() !== 'supabase') {
    let rows = mockAjustes.filter(a => a.empresa_id === empresaId);
    if (personalId) rows = rows.filter(a => a.personal_id === personalId);
    return rows;
  }
  const supabase = await getSupabaseClient();
  let query = supabase.from('roster_minero_ajustes').select('*').eq('empresa_id', empresaId);
  if (personalId) query = query.eq('personal_id', personalId);
  const { data, error } = await query.order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Aprueba o rechaza un ajuste. Si la fecha cae en un periodo con nómina ya
 * procesada, aprobar sin forzarOverride (o sin permiso real) es rechazado por
 * el trigger de la base — ver comentario de la migración 332.
 */
export async function resolverAjusteRosterMinero(empresaId, ajusteId, estado, resueltoPor, opts = {}) {
  const patch = {
    estado,
    aprobado_por: resueltoPor || null,
    resuelto_en: new Date().toISOString(),
  };
  if (opts.forzarOverride) {
    patch.retro_override_por = resueltoPor;
    patch.retro_override_motivo = opts.motivoOverride || null;
  }

  if (getDataMode() !== 'supabase') {
    let actualizado = null;
    mockAjustes = mockAjustes.map(a => {
      if (a.id === ajusteId && a.empresa_id === empresaId) {
        actualizado = { ...a, ...patch };
        return actualizado;
      }
      return a;
    });
    return actualizado;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('roster_minero_ajustes')
    .update(patch)
    .eq('id', ajusteId)
    .eq('empresa_id', empresaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Marca un ajuste aprobado (resultado 'descanso') como ya revisado en Control
 * de Asistencia — trazabilidad humana pura, sin ningún efecto en cálculos ni
 * en registros_asistencia. Solo controla si la grilla muestra el ícono
 * "Revisar impacto en nómina" para ese día.
 */
export async function confirmarRevisionAjusteRoster(empresaId, ajusteId, confirmadoPor) {
  const patch = {
    revision_asistencia_confirmada: true,
    revision_confirmada_por: confirmadoPor || null,
    revision_confirmada_en: new Date().toISOString(),
  };

  if (getDataMode() !== 'supabase') {
    let actualizado = null;
    mockAjustes = mockAjustes.map(a => {
      if (a.id === ajusteId && a.empresa_id === empresaId) {
        actualizado = { ...a, ...patch };
        return actualizado;
      }
      return a;
    });
    return actualizado;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('roster_minero_ajustes')
    .update(patch)
    .eq('id', ajusteId)
    .eq('empresa_id', empresaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Motor de cálculo ──────────────────────────────────────────────────────────

/**
 * Calcula las filas del roster para un período mensual.
 *
 * Prioridad por día (dentro del período, para cada trabajador minero):
 *   1. Ajuste aprobado (roster_minero_ajustes) para esa fecha → decide trabajo o
 *      descanso según tipo_dia_solicitado, sin importar qué diga el registro real.
 *   2. Registro real 'completo' | 'tardanza' | 'horas_extra' (sin ajuste)      → mina.
 *   3. Registro real 'incompleto', o sin ningún registro en un día que el ciclo
 *      teórico esperaba trabajo (fecha_inicio_ciclo / dias_ciclo_trabajo del
 *      registro en asistencia_ciclos_mineros) → no suma a dias_en_mina ni a
 *      dias_descanso_gozados; se cuenta en dias_pendientes_revision.
 *   4. Registro real 'falta' (es_falta=true) o 'descanso'/'bajada'            → igual que antes.
 *
 * @param {number} periodoAnio
 * @param {number} periodoMes
 * @param {Array} trabajadores - lista completa (operativo + admin)
 * @param {Array} registros   - registros_asistencia del período
 * @param {Array} ciclos      - asistencia_ciclos_mineros
 * @param {Array} [ajustes]   - roster_minero_ajustes ya filtrados a estado='aprobado'
 * @returns {Array} una fila por trabajador minero
 */
export function calcularRosterPeriodo(periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes = []) {
  const mineros = trabajadores.filter(t => {
    const rj = t.regimen_jornada || 'general';
    return rj === 'ciclo_acumulativo' || rj.startsWith('minero_');
  });

  const prefijoMes = `${periodoAnio}-${String(periodoMes).padStart(2, '0')}`;
  const diasEnMes = new Date(periodoAnio, periodoMes, 0).getDate();

  return mineros.map(t => {
    const regsT = registros.filter(r => r.trabajador_id === t.id && r.fecha?.startsWith(prefijoMes));
    const cicloT = ciclos.filter(c => c.personal_id === t.id);
    const cicloInfo = cicloT[0] || null;
    const ajustesT = ajustes.filter(a => a.personal_id === t.id && a.estado === 'aprobado' && a.fecha?.startsWith(prefijoMes));

    // Calcular ratio del régimen
    const diasT = t.dias_ciclo_trabajo || 14;
    const diasD = t.dias_ciclo_descanso || 7;
    const ratio = diasD / diasT;

    let diasEnMina = 0;
    let diasInduccion = 0;
    let diasGozados = 0;
    let diasPendientesRevision = 0;

    for (let dia = 1; dia <= diasEnMes; dia++) {
      const fechaStr = `${prefijoMes}-${String(dia).padStart(2, '0')}`;
      const ajuste = ajustesT.find(a => a.fecha === fechaStr);

      // 1. Ajuste aprobado: prioridad máxima, sin más preguntas.
      if (ajuste) {
        if (ajuste.tipo_dia_solicitado === 'trabajo') diasEnMina++;
        else diasGozados++;
        continue;
      }

      const registro = regsT
        .filter(r => r.fecha === fechaStr)
        .reduce((masReciente, r) => (!masReciente || new Date(r.created_at) > new Date(masReciente.created_at)) ? r : masReciente, null);

      if (registro) {
        // 4. Falta real: igual que antes (no suma a nada).
        if (registro.es_falta) continue;
        // 4. Descanso/bajada real: igual que antes.
        if (registro.estado === 'descanso' || registro.estado === 'bajada') { diasGozados++; continue; }
        // Inducción real: igual que antes.
        if (registro.estado === 'induccion' || registro.origen_registro === 'ciclo_induccion') { diasInduccion++; continue; }
        // 3. Incompleto: no queda claro si fue trabajo o descanso — a revisión.
        if (registro.estado === 'incompleto') { diasPendientesRevision++; continue; }
        // 2. completo | tardanza | horas_extra (u otro estado real no contemplado
        //    arriba): cuenta como mina, igual que antes — sin tratamiento especial.
        diasEnMina++;
        continue;
      }

      // Sin ningún registro ese día: solo es "pendiente de revisión" si el ciclo
      // teórico esperaba trabajo (usa fecha_inicio_ciclo, antes recibido y no usado).
      if (cicloInfo?.fecha_inicio_ciclo) {
        const teorico = calcularEstadoCicloMinero({
          fechaInicioCiclo: cicloInfo.fecha_inicio_ciclo,
          diasTrabajo: diasT,
          diasDescanso: diasD,
          fechaEval: fechaStr,
          tieneInduccion: cicloInfo.tiene_induccion || false,
          diasInduccion: cicloInfo.dias_induccion || 0,
          fechaFinInduccion: cicloInfo.fecha_fin_induccion || null,
        });
        if (teorico.estado === 'en_mina') diasPendientesRevision++;
      }
      // Sin info de ciclo, o el ciclo no esperaba trabajo ese día: no se cuenta
      // nada, igual que el comportamiento previo (el día simplemente no existía
      // en regsT y no afectaba ningún total).
    }

    // Días efectivos para generar descanso
    const diasEfectivos = diasEnMina;
    const diasDescansoGanados = Math.round(diasEfectivos * ratio * 100) / 100;
    const balancePeriodo = Math.round((diasDescansoGanados - diasGozados) * 100) / 100;

    return {
      personal_id: t.id,
      personal_nombre: t.nombre,
      personal_tipo: t.trabajador_tipo || 'operativo',
      periodo_anio: periodoAnio,
      periodo_mes: periodoMes,
      regimen_jornada: t.regimen_jornada || 'ciclo_acumulativo',
      dias_ciclo_trabajo: diasT,
      dias_ciclo_descanso: diasD,
      dias_en_mina: diasEnMina,
      dias_induccion: diasInduccion,
      dias_efectivos_descanso: diasEfectivos,
      dias_descanso_ganados: diasDescansoGanados,
      dias_descanso_gozados: diasGozados,
      dias_pendientes_revision: diasPendientesRevision,
      balance_periodo: balancePeriodo,
      balance_acumulado: balancePeriodo, // se sobreescribe con el acumulado real en calcularYGuardarRoster
    };
  });
}
