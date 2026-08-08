import { getSupabaseClient } from '../lib/supabaseClient.js';
import { getDataMode } from '../lib/dataMode.js';
import { resolverSociedadDocumentoLaboral } from './nominaSociedadService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function diasHabilesLocal(inicio, fin) {
  const start = new Date(inicio + 'T00:00:00');
  const end   = new Date(fin   + 'T00:00:00');
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function calcularImpactoNomina(tipo, diasHabiles, diasLicenciaEmpresa = 20, clasificacionPago = null) {
  // La clasificacion_pago manual del RRHH tiene precedencia sobre el default del tipo
  if (clasificacionPago === 'no_remunerado') {
    return { impacto_nomina: 'descuento_total', dias_a_descontar: diasHabiles };
  }
  if (clasificacionPago === 'remunerado') {
    return { impacto_nomina: 'sin_descuento', dias_a_descontar: 0 };
  }
  if (['vacaciones', 'permiso_con_goce', 'comision_trabajo'].includes(tipo)) {
    return { impacto_nomina: 'sin_descuento', dias_a_descontar: 0 };
  }
  if (tipo === 'permiso_sin_goce') {
    return { impacto_nomina: 'descuento_total', dias_a_descontar: diasHabiles };
  }
  if (tipo === 'licencia_medica') {
    return { impacto_nomina: 'descuento_parcial', dias_a_descontar: Math.max(0, diasHabiles - diasLicenciaEmpresa) };
  }
  // bajada: el descanso ya está contemplado en el régimen minero
  if (tipo === 'bajada') {
    return { impacto_nomina: 'sin_impacto', dias_a_descontar: 0 };
  }
  return { impacto_nomina: 'sin_impacto', dias_a_descontar: 0 };
}

// Clasificacion de pago por defecto según el tipo de solicitud
export function defaultClasificacionPago(tipo) {
  if (['vacaciones', 'permiso_con_goce', 'licencia_maternidad', 'licencia_paternidad', 'comision_trabajo', 'bajada'].includes(tipo)) return 'remunerado';
  if (['permiso_sin_goce'].includes(tipo)) return 'no_remunerado';
  if (['compensacion_horas'].includes(tipo)) return 'recuperacion_horas';
  return 'remunerado';
}

// La solicitud conserva su tipo original; este es el estado operativo que se
// persiste cuando un administrador decide aplicarla manualmente a asistencia.
// Cada tipo conserva su semántica en asistencia; permiso_con_goce continúa
// siendo una ausencia remunerada para nómina.
export const ESTADOS_ASISTENCIA_SOLICITUD = {
  vacaciones: 'vacaciones',
  licencia_medica: 'licencia_medica',
  permiso_con_goce: 'permiso_con_goce',
  permiso_sin_goce: 'permiso_sin_goce',
};

export function estadoAsistenciaDesdeSolicitud(tipo) {
  return ESTADOS_ASISTENCIA_SOLICITUD[tipo] || null;
}

function requiereDocumento(tipo) {
  return ['licencia_medica', 'licencia_maternidad', 'licencia_paternidad'].includes(tipo);
}

// ── Saldo vacacional canónico ─────────────────────────────────────────────────

export const ESTADOS_VACACIONES_DESCUENTA = ['aprobada_jefe', 'confirmada_rrhh', 'activa'];

// Función síncrona canónica. Recibe las solicitudes ya filtradas al colaborador.
export function computarSaldoVacaciones(fechaIngreso, diasAnio, solicitudes) {
  if (!fechaIngreso) return { disponibles: 0, usados: 0, saldo: 0 };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ingreso = new Date(`${fechaIngreso}T00:00:00`);
  if (ingreso > hoy) return { disponibles: 0, usados: 0, saldo: 0 };
  const diasTranscurridos = (hoy.getTime() - ingreso.getTime()) / 86400000;
  const disponibles = Math.round((diasTranscurridos / 365 * diasAnio) * 10) / 10;
  const usados = (solicitudes || [])
    .filter(s => s.tipo === 'vacaciones' && ESTADOS_VACACIONES_DESCUENTA.includes(s.estado))
    .reduce((acc, s) => acc + (s.dias_habiles || 0), 0);
  return { disponibles, usados, saldo: Math.max(0, Math.round((disponibles - usados) * 10) / 10) };
}

// ── Correlativo PM-XXXX ───────────────────────────────────────────────────────

let _mockPmCorrelativo = 3;
const _mockPmMap = new Map();

async function siguienteCorrelativoPM(supabase, empresaId, sociedadId = null) {
  let query = supabase
    .from('correlativos_documentos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('tipo_documento', 'papeleta_movimiento')
    .eq('serie', 'PM');
  query = sociedadId ? query.eq('sociedad_id', sociedadId) : query.is('sociedad_id', null);
  const { data: existing, error: correlativoError } = await query.maybeSingle();
  if (correlativoError) throw correlativoError;
  const siguiente = Number(existing?.ultimo_numero ?? 0) + 1;
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const corId = `cor_${String(r).replace(/-/g, '').slice(0, 18)}`;
  if (existing) {
    const { error } = await supabase.from('correlativos_documentos')
      .update({ ultimo_numero: siguiente, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('correlativos_documentos').insert({
      id: corId, empresa_id: empresaId,
      sociedad_id: sociedadId,
      tipo_documento: 'papeleta_movimiento', serie: 'PM',
      ultimo_numero: siguiente,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
  return `PM-${String(siguiente).padStart(4, '0')}`;
}

function mockCorrelativoPM(empresaId) {
  const curr = _mockPmMap.get(empresaId) ?? _mockPmCorrelativo;
  _mockPmMap.set(empresaId, curr + 1);
  return `PM-${String(curr + 1).padStart(4, '0')}`;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

let mockSolicitudes = [
  {
    id: 'sol_001', empresa_id: 'emp_001',
    personal_id: 'per_001', personal_nombre: 'Carlos Quispe', personal_tipo: 'operativo',
    aprobador_id: null, aprobador_nombre: null,
    tipo: 'vacaciones', fecha_inicio: '2026-06-02', fecha_fin: '2026-06-13',
    dias_habiles: 10, motivo: 'Vacaciones anuales programadas', documento_url: null,
    requiere_documento: false, estado: 'aprobada_jefe',
    comentario_jefe: 'Aprobado. Que descanses.', comentario_rrhh: null, motivo_anulacion: null,
    fecha_aprobacion_jefe: '2026-05-20T10:00:00Z', fecha_confirmacion: null, confirmado_por: null,
    impacto_nomina: 'sin_descuento', dias_a_descontar: 0,
    registrado_desde: 'backoffice', creado_en: '2026-05-18T09:00:00Z', actualizado_en: '2026-05-20T10:00:00Z',
  },
  {
    id: 'sol_002', empresa_id: 'emp_001',
    personal_id: 'per_002', personal_nombre: 'María Torres', personal_tipo: 'administrativo',
    aprobador_id: null, aprobador_nombre: null,
    tipo: 'permiso_con_goce', fecha_inicio: '2026-05-29', fecha_fin: '2026-05-29',
    dias_habiles: 1, motivo: 'Trámite personal urgente', documento_url: null,
    requiere_documento: false, estado: 'enviada',
    comentario_jefe: null, comentario_rrhh: null, motivo_anulacion: null,
    fecha_aprobacion_jefe: null, fecha_confirmacion: null, confirmado_por: null,
    impacto_nomina: 'sin_descuento', dias_a_descontar: 0,
    registrado_desde: 'mobile', creado_en: '2026-05-28T07:30:00Z', actualizado_en: '2026-05-28T07:30:00Z',
  },
];

let mockHistorial = [
  { id: 'hist_001', solicitud_id: 'sol_001', empresa_id: 'emp_001', estado_desde: null, estado_hasta: 'enviada', comentario: null, usuario: 'Carlos Quispe', creado_en: '2026-05-18T09:00:00Z' },
  { id: 'hist_002', solicitud_id: 'sol_001', empresa_id: 'emp_001', estado_desde: 'enviada', estado_hasta: 'aprobada_jefe', comentario: 'Aprobado. Que descanses.', usuario: 'Supervisor', creado_en: '2026-05-20T10:00:00Z' },
  { id: 'hist_003', solicitud_id: 'sol_002', empresa_id: 'emp_001', estado_desde: null, estado_hasta: 'enviada', comentario: null, usuario: 'María Torres', creado_en: '2026-05-28T07:30:00Z' },
];

let mockConfig = { dias_vacaciones_anio: 30, max_dias_permiso_goce: 3, dias_licencia_empresa: 20, pct_max_equipo_ausente: 30 };

// ── API ───────────────────────────────────────────────────────────────────────

export async function cargarSolicitudes(empresaId) {
  if (!empresaId) return [];
  if (getDataMode() !== 'supabase') {
    return mockSolicitudes.filter(s => s.empresa_id === empresaId)
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  }
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('solicitudes_rrhh')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function crearSolicitud(empresaId, payload) {
  const {
    personal_id, personal_nombre, personal_tipo = 'operativo',
    aprobador_id = null, aprobador_nombre = null,
    tipo, fecha_inicio, fecha_fin, motivo,
    documento_url = null, registrado_desde = 'backoffice',
    clasificacion_pago = null,
    fecha_retorno = null,
    unidad = 'dias',
    cantidad_horas = null,
  } = payload;

  const clasifEfectiva = clasificacion_pago || defaultClasificacionPago(tipo);

  if (getDataMode() !== 'supabase') {
    const dias = diasHabilesLocal(fecha_inicio, fecha_fin);
    const nueva = {
      id: `sol_${Date.now()}`, empresa_id: empresaId,
      personal_id, personal_nombre, personal_tipo,
      aprobador_id, aprobador_nombre, tipo,
      fecha_inicio, fecha_fin, dias_habiles: dias,
      motivo, documento_url, requiere_documento: requiereDocumento(tipo),
      estado: 'enviada', comentario_jefe: null, comentario_rrhh: null, motivo_anulacion: null,
      fecha_aprobacion_jefe: null, fecha_confirmacion: null, confirmado_por: null,
      impacto_nomina: 'sin_impacto', dias_a_descontar: 0,
      clasificacion_pago: clasifEfectiva,
      fecha_retorno: fecha_retorno || null,
      unidad: unidad || 'dias',
      cantidad_horas: cantidad_horas || null,
      numero_correlativo: null,
      registrado_desde, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
    };
    mockSolicitudes.unshift(nueva);
    mockHistorial.push({ id: `hist_${Date.now()}`, solicitud_id: nueva.id, empresa_id: empresaId, estado_desde: null, estado_hasta: 'enviada', comentario: null, usuario: personal_nombre, creado_en: nueva.creado_en });
    return nueva;
  }

  const supabase = await getSupabaseClient();
  // Usar insert directo para soportar los nuevos campos sin modificar la RPC
  const { data, error } = await supabase
    .from('solicitudes_rrhh')
    .insert({
      empresa_id: empresaId, personal_id, personal_nombre, personal_tipo,
      aprobador_id, aprobador_nombre, tipo,
      fecha_inicio, fecha_fin,
      dias_habiles: diasHabilesLocal(fecha_inicio, fecha_fin),
      motivo, documento_url,
      requiere_documento: requiereDocumento(tipo),
      estado: 'enviada',
      clasificacion_pago: clasifEfectiva,
      fecha_retorno: fecha_retorno || null,
      unidad: unidad || 'dias',
      cantidad_horas: cantidad_horas || null,
      registrado_desde,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cambiarEstado(solicitudId, empresaId, nuevoEstado, campos = {}) {
  if (getDataMode() !== 'supabase') {
    const idx = mockSolicitudes.findIndex(s => s.id === solicitudId);
    if (idx === -1) throw new Error('Solicitud no encontrada');
    const prev = mockSolicitudes[idx];
    const updated = { ...prev, estado: nuevoEstado, actualizado_en: new Date().toISOString(), ...campos };
    mockSolicitudes[idx] = updated;
    mockHistorial.push({
      id: `hist_${Date.now()}`, solicitud_id: solicitudId, empresa_id: empresaId,
      estado_desde: prev.estado, estado_hasta: nuevoEstado,
      comentario: campos.comentario_jefe || campos.comentario_rrhh || campos.motivo_anulacion || null,
      usuario: campos._usuario || null, creado_en: new Date().toISOString(),
    });
    return updated;
  }
  const { _usuario: _u, ...dbCampos } = campos;
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('solicitudes_rrhh')
    .update({ estado: nuevoEstado, ...dbCampos, actualizado_en: new Date().toISOString() })
    .eq('id', solicitudId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function aprobarJefe(solicitudId, empresaId, opts = {}) {
  return cambiarEstado(solicitudId, empresaId, 'aprobada_jefe', {
    comentario_jefe: opts.comentario || null,
    fecha_aprobacion_jefe: new Date().toISOString(),
    _usuario: opts.usuario,
  });
}

export async function rechazarJefe(solicitudId, empresaId, comentario, usuario) {
  if (!comentario?.trim()) throw new Error('El comentario es obligatorio para rechazar');
  return cambiarEstado(solicitudId, empresaId, 'rechazada_jefe', {
    comentario_jefe: comentario.trim(),
    _usuario: usuario,
  });
}

export async function confirmarRrhh(solicitudId, empresaId, opts = {}) {
  const isMock = getDataMode() !== 'supabase';
  const supabase = isMock ? null : await getSupabaseClient();
  let solicitud = isMock ? mockSolicitudes.find(s => s.id === solicitudId) : null;
  let multisociedadHabilitado = isMock ? Boolean(opts.multisociedadHabilitado) : false;
  if (!isMock) {
    const [{ data: solicitudDb, error: solicitudError }, { data: empresaDb, error: empresaError }] = await Promise.all([
      supabase.from('solicitudes_rrhh').select('*').eq('id', solicitudId).eq('empresa_id', empresaId).single(),
      supabase.from('empresas').select('multisociedad_habilitado').eq('id', empresaId).single(),
    ]);
    if (solicitudError) throw solicitudError;
    if (empresaError) throw empresaError;
    solicitud = solicitudDb;
    multisociedadHabilitado = Boolean(empresaDb?.multisociedad_habilitado);
  }
  const tipo = opts.tipo || solicitud?.tipo;
  const dias = opts.diasHabiles || solicitud?.dias_habiles || 0;
  const diasLicEmpresa = opts.diasLicenciaEmpresa ?? mockConfig.dias_licencia_empresa;
  const clasifPago = opts.clasificacion_pago || solicitud?.clasificacion_pago || null;
  const impacto = calcularImpactoNomina(tipo, dias, diasLicEmpresa, clasifPago);

  let sociedadId = null;
  if (multisociedadHabilitado) {
    let documentos = opts.documentos || [];
    let tipos = opts.tiposDocumento || [];
    let sociedades = opts.sociedades || [];
    if (!isMock) {
      const [{ data: documentosDb, error: documentosError }, { data: tiposDb, error: tiposError }, { data: sociedadesDb, error: sociedadesError }] = await Promise.all([
        supabase.from('personal_documentos').select('*').eq('empresa_id', empresaId).eq('personal_id', solicitud.personal_id),
        supabase.from('tipos_documento_empresa').select('*').eq('empresa_id', empresaId),
        supabase.from('sociedades').select('id,codigo,nombre,activa').eq('empresa_id', empresaId).eq('activa', true),
      ]);
      if (documentosError) throw documentosError;
      if (tiposError) throw tiposError;
      if (sociedadesError) throw sociedadesError;
      documentos = documentosDb || [];
      tipos = tiposDb || [];
      sociedades = sociedadesDb || [];
    }
    sociedadId = resolverSociedadDocumentoLaboral({
      multisociedadHabilitado,
      documentos,
      tiposDocumento: tipos,
      sociedades,
      personalId: solicitud.personal_id,
      fecha: solicitud.fecha_inicio,
    });
  }

  // Asignar correlativo PM si aún no tiene uno
  let numero_correlativo = solicitud?.numero_correlativo || null;
  if (!numero_correlativo) {
    if (isMock) {
      numero_correlativo = mockCorrelativoPM(empresaId);
    } else {
      numero_correlativo = await siguienteCorrelativoPM(supabase, empresaId, sociedadId);
    }
  }

  return cambiarEstado(solicitudId, empresaId, 'confirmada_rrhh', {
    ...impacto,
    fecha_confirmacion: new Date().toISOString(),
    confirmado_por: opts.confirmadoPor || null,
    comentario_rrhh: opts.comentario || null,
    numero_correlativo,
    sociedad_id: sociedadId,
    _usuario: opts.usuario,
  });
}

export async function rechazarRrhh(solicitudId, empresaId, comentario, usuario) {
  if (!comentario?.trim()) throw new Error('El comentario es obligatorio para rechazar');
  return cambiarEstado(solicitudId, empresaId, 'rechazada_rrhh', {
    comentario_rrhh: comentario.trim(),
    _usuario: usuario,
  });
}

export async function anularSolicitud(solicitudId, empresaId, motivo, usuario) {
  if (!motivo?.trim()) throw new Error('El motivo es obligatorio para anular');
  return cambiarEstado(solicitudId, empresaId, 'anulada', {
    motivo_anulacion: motivo.trim(),
    _usuario: usuario,
  });
}

/**
 * Aplica, por decisión explícita de RRHH, una solicitud ya confirmada a la
 * asistencia. El RPC hace toda la operación en una transacción: detecta
 * conflictos sin sobrescribir, protege retroactividad y marca la solicitud.
 */
export async function aplicarSolicitudAsistencia(empresaId, solicitudId, opts = {}) {
  const {
    confirmarReemplazo = false,
    forzarOverride = false,
    motivoOverride = null,
  } = opts;

  if (getDataMode() !== 'supabase') {
    const idx = mockSolicitudes.findIndex(s => s.id === solicitudId && s.empresa_id === empresaId);
    if (idx === -1) throw new Error('SOLICITUD_NO_ENCONTRADA: la solicitud no pertenece al tenant indicado.');
    const solicitud = mockSolicitudes[idx];
    if (solicitud.estado !== 'confirmada_rrhh') throw new Error('SOLICITUD_NO_CONFIRMADA: solo se puede aplicar una solicitud confirmada por RRHH.');
    if (solicitud.aplicada_asistencia) throw new Error('SOLICITUD_YA_APLICADA: la solicitud ya fue aplicada a asistencia.');
    const estado = estadoAsistenciaDesdeSolicitud(solicitud.tipo);
    if (!estado) throw new Error(`TIPO_SOLICITUD_NO_APLICABLE: el tipo ${solicitud.tipo} no se puede aplicar a asistencia.`);
    const updated = { ...solicitud, aplicada_asistencia: true, actualizado_en: new Date().toISOString() };
    mockSolicitudes[idx] = updated;
    return {
      aplicada: true,
      solicitud_id: solicitudId,
      estado_asistencia: estado,
      registros_insertados: 0,
      registros_reemplazados: 0,
      modo_mock: true,
    };
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('aplicar_solicitud_rrhh_a_asistencia', {
    p_empresa_id: empresaId,
    p_solicitud_id: solicitudId,
    p_confirmar_reemplazo: Boolean(confirmarReemplazo),
    p_forzar_override: Boolean(forzarOverride),
    p_motivo_override: motivoOverride || null,
  });
  if (error) throw error;
  return data || {};
}

export async function cargarConfigAusencias(empresaId) {
  if (!empresaId) return mockConfig;
  if (getDataMode() !== 'supabase') return { ...mockConfig };
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('rrhh_config_ausencias')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) throw error;
  return data || { dias_vacaciones_anio: 30, max_dias_permiso_goce: 3, dias_licencia_empresa: 20, pct_max_equipo_ausente: 30 };
}

export async function calcularSaldoVacaciones(empresaId, personalId, anio, fechaIngreso) {
  if (getDataMode() !== 'supabase') {
    const sols = mockSolicitudes.filter(s => s.empresa_id === empresaId && s.personal_id === personalId);
    return computarSaldoVacaciones(fechaIngreso, mockConfig.dias_vacaciones_anio, sols);
  }
  const supabase = await getSupabaseClient();
  const [configRes, solsRes] = await Promise.all([
    supabase.from('rrhh_config_ausencias').select('dias_vacaciones_anio').eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('solicitudes_rrhh')
      .select('dias_habiles, tipo, estado')
      .eq('empresa_id', empresaId)
      .eq('personal_id', personalId)
      .in('estado', ESTADOS_VACACIONES_DESCUENTA),
  ]);
  if (configRes.error) throw configRes.error;
  if (solsRes.error) throw solsRes.error;
  const diasAnio = configRes.data?.dias_vacaciones_anio ?? 30;
  return computarSaldoVacaciones(fechaIngreso, diasAnio, solsRes.data || []);
}

export async function cargarHistorial(solicitudId) {
  if (getDataMode() !== 'supabase') {
    return mockHistorial.filter(h => h.solicitud_id === solicitudId)
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
  }
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('solicitudes_rrhh_historial')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return data || [];
}

export { diasHabilesLocal, requiereDocumento };
