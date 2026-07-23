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
  fechaInicioInduccion = null,
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

  // Ventana de inducción. Si fechaInicioInduccion viene explícita (fuente
  // única, migración 349) se usa tal cual; si no, se deriva de
  // fechaFinInduccion - (diasInduccion-1) por compatibilidad con datos que
  // aún no tengan el campo nuevo. Caso de borde documentado: si
  // fechaFinInduccion existe pero diasInduccion no es un número positivo y
  // no hay fechaInicioInduccion explícita, no hay ventana que derivar —
  // ningún día cuenta como inducción por esta rama.
  const fechaFinInduccionDate = fechaFinInduccion ? new Date(fechaFinInduccion + 'T00:00:00') : null;
  let fechaInicioInduccionDate = fechaInicioInduccion ? new Date(fechaInicioInduccion + 'T00:00:00') : null;
  if (!fechaInicioInduccionDate && fechaFinInduccionDate && diasInduccion > 0) {
    fechaInicioInduccionDate = new Date(fechaFinInduccionDate);
    fechaInicioInduccionDate.setDate(fechaInicioInduccionDate.getDate() - (diasInduccion - 1));
  }
  const estaEnInduccion = tieneInduccion && fechaFinInduccionDate
    ? Boolean(fechaInicioInduccionDate) && hoy >= fechaInicioInduccionDate && hoy <= fechaFinInduccionDate
    : (tieneInduccion && diasInduccion > 0 && diffDias < diasInduccion);

  // La posición dentro del patrón de trabajo/descanso se cuenta únicamente
  // desde fechaInicioCiclo — el inicio del ciclo y el rango de inducción son
  // decisiones manuales e independientes del administrador (capturadas en la
  // Asignación de Jornada y en el formulario de ciclo, respectivamente). El
  // sistema no debe empujar ni derivar una fecha a partir de la otra; si el
  // administrador quiere que el ciclo real empiece después de la inducción,
  // debe poner esa fecha directamente en fechaInicioCiclo. La inducción no
  // pausa ni desplaza diaDentroDelCiclo — solo excluye esos días del balance
  // (calcularRosterPeriodo) y cambia la etiqueta 'estado' del día.
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
      const enInduccion = tieneInduccion && fechaFinInduccionDate
        ? Boolean(fechaInicioInduccionDate) && cursor >= fechaInicioInduccionDate && cursor <= fechaFinInduccionDate
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
 *   1. Sin ningún tramo de jornada vigente para la fecha → 'sin_ciclo'
 *   2. Antes de fechaInicioCiclo pero dentro del tramo vigente (ventana pre-ciclo,
 *      entre que se asignó el régimen y que arrancó el conteo real del patrón) →
 *      'teorico' con estado 'en_descanso' por defecto, o 'en_induccion' si la
 *      fecha cae en fechaInicioInduccion/fechaFinInduccion (misma prioridad que
 *      la inducción dentro del ciclo: excluye el día del balance).
 *   3. Fecha pasada u hoy, con registro real de asistencia → 'real'
 *   4. Fecha futura, o pasada sin registro real todavía    → 'teorico'
 *
 * @param {object} params
 * @param {string} params.trabajadorId       - id para matchear contra registros.trabajador_id
 * @param {string} [params.fechaInicioTramo] - 'YYYY-MM-DD' inicio del tramo de jornada vigente (asignación;
 *                                             distinto de fechaInicioCiclo). Sin este dato, el comportamiento
 *                                             antes de fechaInicioCiclo es el previo ('sin_ciclo').
 * @param {string} [params.fechaFinTramo]    - 'YYYY-MM-DD' fin del tramo (null/ausente = tramo abierto/vigente)
 * @param {string} params.fechaInicioCiclo
 * @param {number} params.diasTrabajo
 * @param {number} params.diasDescanso
 * @param {boolean} [params.tieneInduccion]
 * @param {number} [params.diasInduccion]
 * @param {string} [params.fechaFinInduccion]
 * @param {string} [params.fechaInicioInduccion]
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
  fechaInicioTramo = null,
  fechaFinTramo = null,
  fechaInicioCiclo,
  diasTrabajo,
  diasDescanso,
  tieneInduccion = false,
  diasInduccion = 0,
  fechaFinInduccion = null,
  fechaInicioInduccion = null,
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
    const hayCiclo = Boolean(fechaInicioCiclo);
    const esAntesDelCiclo = hayCiclo && fechaStr < fechaInicioCiclo;
    const dentroDelTramo = Boolean(fechaInicioTramo) && fechaStr >= fechaInicioTramo && (!fechaFinTramo || fechaStr <= fechaFinTramo);
    // Ventana pre-ciclo: el tramo de jornada ya existe para esta fecha pero el
    // conteo real del patrón mina/descanso todavía no arranca (fechaInicioCiclo
    // es posterior). sin_ciclo_vigente queda reservado a fechas sin ningún
    // tramo — el caso ya conocido de trabajadores sin asignación.
    const enVentanaPreCiclo = esAntesDelCiclo && dentroDelTramo;
    const sinCiclo = !hayCiclo || (esAntesDelCiclo && !dentroDelTramo);

    let teorico = null;
    if (!sinCiclo && !esAntesDelCiclo) {
      teorico = calcularEstadoCicloMinero({
        fechaInicioCiclo, diasTrabajo, diasDescanso,
        fechaEval: fechaStr, tieneInduccion, diasInduccion, fechaFinInduccion, fechaInicioInduccion,
      });
    } else if (enVentanaPreCiclo) {
      const enInduccion = Boolean(tieneInduccion) && Boolean(fechaInicioInduccion) && Boolean(fechaFinInduccion)
        && fechaStr >= fechaInicioInduccion && fechaStr <= fechaFinInduccion;
      teorico = { estado: enInduccion ? 'en_induccion' : 'en_descanso', estaEnInduccion: enInduccion };
    }

    const registro = (fechaStr <= hoyStr)
      ? registrosTrabajador
          .filter(r => r.fecha === fechaStr)
          .reduce((masReciente, r) => (!masReciente || new Date(r.created_at) > new Date(masReciente.created_at)) ? r : masReciente, null)
      : null;

    if (ajusteAprobado) {
      return { fecha: fechaStr, origen: 'ajuste', estado: ajusteAprobado.tipo_dia_solicitado, detalle: ajusteAprobado, ajustePendiente: null, ajusteAprobado, registro, teorico, pendienteRevision: false };
    }

    if (sinCiclo) {
      // Una ausencia autorizada debe poder leerse en la grilla aun cuando el
      // trabajador no tuviera ciclo minero vigente ese día. No convierte el
      // tramo a minero ni modifica el balance: solo expone el registro real.
      if (registro && esAusenciaAutorizadaRoster(registro.estado)) {
        return { fecha: fechaStr, origen: 'real', estado: registro.estado, detalle: registro, ajustePendiente, ajusteAprobado: null, registro, teorico: null, pendienteRevision: false };
      }
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

// Ausencias aprobadas que llegan desde solicitudes_rrhh mediante el puente
// manual de asistencia. Conservan su tipo para la grilla, pero en el balance
// de roster se comportan igual que una falta: no son mina, descanso gozado ni
// inducción, y no alteran la posición teórica del ciclo.
export const ESTADOS_AUSENCIA_AUTORIZADA = Object.freeze([
  'vacaciones',
  'licencia_medica',
  'permiso_con_goce',
  'permiso_sin_goce',
]);

export const esAusenciaAutorizadaRoster = (estado) =>
  ESTADOS_AUSENCIA_AUTORIZADA.includes(estado);

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
 * @param {Array} [asignaciones] - personal_asignaciones_jornada; ver calcularRosterPeriodo.
 */
export async function calcularYGuardarRoster(empresaId, periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes = [], calculadoPor, nominaPeriodoId = null, asignaciones = []) {
  if (getDataMode() !== 'supabase') {
    const nuevosPorPersonal = calcularRosterPeriodo(periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes, asignaciones);
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

  const filas = calcularRosterPeriodo(periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes, asignaciones);

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

// Un ajuste aprobado queda pendiente de reflejarse en Totales solo cuando fue
// resuelto después del último cálculo guardado de esa fila.
export const ajusteAprobadoPosteriorASnapshot = (ajuste, snapshot) => {
  if (!ajuste || ajuste.estado !== 'aprobado' || !snapshot?.calculado_en) return false;
  const resueltoEn = ajuste.resuelto_en || ajuste.solicitado_en;
  return Boolean(resueltoEn) && new Date(resueltoEn) > new Date(snapshot.calculado_en);
};

/**
 * Recalcula y persiste exclusivamente el snapshot de un trabajador para un
 * período. La RPC valida el ajuste gatillo, protege los períodos cerrados con
 * retro wall y nunca toca snapshots de otros trabajadores.
 */
export async function recalcularSnapshotRosterDirigido(empresaId, periodoAnio, periodoMes, trabajador, registros, ciclos, ajustes = [], calculadoPor, asignaciones = [], opts = {}) {
  if (!empresaId || !trabajador?.id) throw new Error('Falta el trabajador para recalcular su snapshot.');

  const prefijoPeriodo = `${periodoAnio}-${String(periodoMes).padStart(2, '0')}`;
  const ajustesDelTrabajador = (ajustes || [])
    .filter(a => a.personal_id === trabajador.id && a.estado === 'aprobado' && a.fecha?.startsWith(prefijoPeriodo))
    .sort((a, b) => new Date(b.resuelto_en || b.solicitado_en || 0) - new Date(a.resuelto_en || a.solicitado_en || 0));

  if (getDataMode() !== 'supabase') {
    const snapshot = mockSnapshots.find(s => s.empresa_id === empresaId && s.personal_id === trabajador.id && s.periodo_anio === periodoAnio && s.periodo_mes === periodoMes);
    if (!snapshot) throw new Error('No existe snapshot para el trabajador y período indicados.');
    const ajuste = ajustesDelTrabajador.find(a => ajusteAprobadoPosteriorASnapshot(a, snapshot));
    if (!ajuste) throw new Error('No existe un ajuste aprobado posterior al snapshot que requiera recálculo.');
    if (snapshot.periodo_cerrado && !opts.forzarOverride) throw new Error('RETRO_WALL: el período está cerrado y requiere autorización para forzar el cambio.');
    if (snapshot.periodo_cerrado && !String(opts.motivoOverride || '').trim()) throw new Error('RETRO_WALL: la justificación para forzar el cambio es obligatoria.');

    const fila = calcularRosterPeriodo(periodoAnio, periodoMes, [trabajador], registros, ciclos, ajustes, asignaciones)[0];
    if (!fila) throw new Error('No fue posible calcular el roster del trabajador indicado.');
    const mesAnterior = periodoMes === 1 ? 12 : periodoMes - 1;
    const anioAnterior = periodoMes === 1 ? periodoAnio - 1 : periodoAnio;
    const anterior = mockSnapshots.find(s => s.empresa_id === empresaId && s.personal_id === trabajador.id && s.periodo_anio === anioAnterior && s.periodo_mes === mesAnterior);
    const actualizado = {
      ...snapshot,
      ...fila,
      balance_acumulado: Number(anterior?.balance_acumulado || 0) + Number(fila.balance_periodo),
      calculado_en: new Date().toISOString(),
      calculado_por: calculadoPor,
    };
    mockSnapshots = mockSnapshots.map(s => s.id === snapshot.id ? actualizado : s);
    return actualizado;
  }

  const supabase = await getSupabaseClient();
  const { data: snapshot, error: snapshotError } = await supabase
    .from('roster_minero_snapshots')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('personal_id', trabajador.id)
    .eq('periodo_anio', periodoAnio)
    .eq('periodo_mes', periodoMes)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot) throw new Error('No existe snapshot para el trabajador y período indicados.');

  const ajuste = ajustesDelTrabajador.find(a => ajusteAprobadoPosteriorASnapshot(a, snapshot));
  if (!ajuste) throw new Error('No existe un ajuste aprobado posterior al snapshot que requiera recálculo.');

  const fila = calcularRosterPeriodo(periodoAnio, periodoMes, [trabajador], registros, ciclos, ajustes, asignaciones)[0];
  if (!fila) throw new Error('No fue posible calcular el roster del trabajador indicado.');

  const mesAnterior = periodoMes === 1 ? 12 : periodoMes - 1;
  const anioAnterior = periodoMes === 1 ? periodoAnio - 1 : periodoAnio;
  const { data: anterior, error: anteriorError } = await supabase
    .from('roster_minero_snapshots')
    .select('balance_acumulado')
    .eq('empresa_id', empresaId)
    .eq('personal_id', trabajador.id)
    .eq('periodo_anio', anioAnterior)
    .eq('periodo_mes', mesAnterior)
    .maybeSingle();
  if (anteriorError) throw anteriorError;

  const payload = {
    ...fila,
    balance_acumulado: Number(anterior?.balance_acumulado || 0) + Number(fila.balance_periodo),
  };
  const { data, error } = await supabase.rpc('recalcular_snapshot_roster_dirigido', {
    p_empresa_id: empresaId,
    p_personal_id: trabajador.id,
    p_periodo_anio: periodoAnio,
    p_periodo_mes: periodoMes,
    p_ajuste_id: ajuste.id,
    p_snapshot: payload,
    p_calculado_por: calculadoPor || null,
    p_forzar_override: Boolean(opts.forzarOverride),
    p_motivo_override: opts.motivoOverride || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
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
 *   1. Inducción configurada para esa fecha (dentro del ciclo, o en la ventana
 *      pre-ciclo — ver punto 3bis) → no genera descanso ganado, aun si existe
 *      un registro real o un ajuste aprobado para el día.
 *   2. Ajuste aprobado (roster_minero_ajustes) para esa fecha → decide trabajo o
 *      descanso según tipo_dia_solicitado, sin importar qué diga el registro real.
 *   3. Registro real 'completo' | 'tardanza' | 'horas_extra' (sin ajuste)      → mina.
 *   3bis. Ventana pre-ciclo (hay tramo de jornada vigente para la fecha — ver
 *      asignaciones — pero fecha_inicio_ciclo todavía no llega) sin registro real
 *      ni ajuste: descanso gozado por defecto. Nunca cuenta en dias_pendientes_revision.
 *   4. Registro real 'incompleto', o sin ningún registro en un día YA DENTRO del
 *      ciclo que el ciclo teórico esperaba trabajo (fecha_inicio_ciclo /
 *      dias_ciclo_trabajo del registro en asistencia_ciclos_mineros) → no suma
 *      a dias_en_mina ni a dias_descanso_gozados; se cuenta en dias_pendientes_revision.
 *   5. Registro real de ausencia autorizada, 'falta' (es_falta=true) o
 *      'descanso'/'bajada' → no suma a ningún balance. La ausencia no pausa
 *      el ciclo teórico.
 *
 * @param {number} periodoAnio
 * @param {number} periodoMes
 * @param {Array} trabajadores - lista completa (operativo + admin)
 * @param {Array} registros   - registros_asistencia del período
 * @param {Array} ciclos      - asistencia_ciclos_mineros
 * @param {Array} [ajustes]   - roster_minero_ajustes ya filtrados a estado='aprobado'
 * @param {Array} [asignaciones] - personal_asignaciones_jornada (todas, no solo del período);
 *   se usa únicamente para saber, día a día, si existe un tramo 'ciclo_acumulativo'
 *   vigente para el trabajador (fecha_inicio/fecha_fin del tramo) y así distinguir la
 *   ventana pre-ciclo de "sin ningún tramo en absoluto".
 * @returns {Array} una fila por trabajador minero
 */
export function calcularRosterPeriodo(periodoAnio, periodoMes, trabajadores, registros, ciclos, ajustes = [], asignaciones = []) {
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
    const asignacionesT = asignaciones.filter(a => a.personal_id === t.id && a.regimen_jornada === 'ciclo_acumulativo');
    const tramoDeFecha = (fechaStr) => asignacionesT.find(a => a.fecha_inicio <= fechaStr && (!a.fecha_fin || fechaStr <= a.fecha_fin)) || null;

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

      const hayCiclo = Boolean(cicloInfo?.fecha_inicio_ciclo);
      const esAntesDelCiclo = hayCiclo && fechaStr < cicloInfo.fecha_inicio_ciclo;
      const enVentanaPreCiclo = esAntesDelCiclo && Boolean(tramoDeFecha(fechaStr));

      // La inducción se configura en asistencia_ciclos_mineros, mientras que
      // los registros diarios generados pueden seguir diciendo "completo".
      // Por eso se consulta antes de interpretar el registro: nunca debe
      // contaminar dias_en_mina ni dias_descanso_ganados. Dentro del ciclo usa
      // calcularEstadoCicloMinero; en la ventana pre-ciclo el valor por defecto
      // es descanso, salvo que la fecha caiga en fecha_inicio_induccion/
      // fecha_fin_induccion (misma fuente única que dentro del ciclo).
      let teorico = null;
      if (hayCiclo && !esAntesDelCiclo) {
        teorico = calcularEstadoCicloMinero({
          fechaInicioCiclo: cicloInfo.fecha_inicio_ciclo,
          diasTrabajo: diasT,
          diasDescanso: diasD,
          fechaEval: fechaStr,
          tieneInduccion: cicloInfo.tiene_induccion || false,
          diasInduccion: cicloInfo.dias_induccion || 0,
          fechaFinInduccion: cicloInfo.fecha_fin_induccion || null,
          fechaInicioInduccion: cicloInfo.fecha_inicio_induccion || null,
        });
      } else if (enVentanaPreCiclo) {
        const enInduccion = Boolean(cicloInfo.tiene_induccion) && Boolean(cicloInfo.fecha_inicio_induccion) && Boolean(cicloInfo.fecha_fin_induccion)
          && fechaStr >= cicloInfo.fecha_inicio_induccion && fechaStr <= cicloInfo.fecha_fin_induccion;
        teorico = { estado: enInduccion ? 'en_induccion' : 'en_descanso', estaEnInduccion: enInduccion };
      }

      if (teorico?.estaEnInduccion) {
        diasInduccion++;
        continue;
      }

      // 2. Ajuste aprobado: prioridad máxima fuera de inducción.
      if (ajuste) {
        if (ajuste.tipo_dia_solicitado === 'trabajo') diasEnMina++;
        else diasGozados++;
        continue;
      }

      const registro = regsT
        .filter(r => r.fecha === fechaStr)
        .reduce((masReciente, r) => (!masReciente || new Date(r.created_at) > new Date(masReciente.created_at)) ? r : masReciente, null);

      if (registro) {
        // Vacaciones/licencias/permisos aprobados son una ausencia real: no
        // generan mina ni descanso ganado/gozado. No se modifica el teórico,
        // por lo que diaDentroDelCiclo sigue avanzando normalmente.
        if (esAusenciaAutorizadaRoster(registro.estado)) continue;
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

      // Sin ajuste ni registro real: en la ventana pre-ciclo, descanso gozado
      // por defecto (nunca pendiente de revisión — ese es el bug corregido).
      if (enVentanaPreCiclo) { diasGozados++; continue; }

      // Ya dentro del ciclo: solo es "pendiente de revisión" si el ciclo
      // teórico esperaba trabajo.
      if (teorico) {
        if (teorico.estado === 'en_mina') diasPendientesRevision++;
      }
      // Sin info de ciclo/tramo, o el ciclo no esperaba trabajo ese día: no se
      // cuenta nada, igual que el comportamiento previo (el día simplemente no
      // existía en regsT y no afectaba ningún total).
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
