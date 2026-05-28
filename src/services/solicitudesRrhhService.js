import { getSupabaseClient } from '../lib/supabaseClient.js';
import { getDataMode } from '../lib/dataMode.js';

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

function calcularImpactoNomina(tipo, diasHabiles, diasLicenciaEmpresa = 20) {
  if (['vacaciones', 'permiso_con_goce'].includes(tipo)) {
    return { impacto_nomina: 'sin_descuento', dias_a_descontar: 0 };
  }
  if (tipo === 'permiso_sin_goce') {
    return { impacto_nomina: 'descuento_total', dias_a_descontar: diasHabiles };
  }
  if (tipo === 'licencia_medica') {
    return { impacto_nomina: 'descuento_parcial', dias_a_descontar: Math.max(0, diasHabiles - diasLicenciaEmpresa) };
  }
  return { impacto_nomina: 'sin_impacto', dias_a_descontar: 0 };
}

function requiereDocumento(tipo) {
  return ['licencia_medica', 'licencia_maternidad', 'licencia_paternidad'].includes(tipo);
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
  } = payload;

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
      registrado_desde, creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
    };
    mockSolicitudes.unshift(nueva);
    mockHistorial.push({ id: `hist_${Date.now()}`, solicitud_id: nueva.id, empresa_id: empresaId, estado_desde: null, estado_hasta: 'enviada', comentario: null, usuario: personal_nombre, creado_en: nueva.creado_en });
    return nueva;
  }

  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('crear_solicitud_rrhh', {
    p_empresa_id: empresaId, p_personal_id: personal_id,
    p_personal_nombre: personal_nombre, p_personal_tipo: personal_tipo,
    p_aprobador_id: aprobador_id, p_aprobador_nombre: aprobador_nombre,
    p_tipo: tipo, p_fecha_inicio: fecha_inicio, p_fecha_fin: fecha_fin,
    p_motivo: motivo, p_documento_url: documento_url,
    p_registrado_desde: registrado_desde,
  });
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
  const solicitud = getDataMode() !== 'supabase'
    ? mockSolicitudes.find(s => s.id === solicitudId)
    : null;
  const tipo = opts.tipo || solicitud?.tipo;
  const dias = opts.diasHabiles || solicitud?.dias_habiles || 0;
  const diasLicEmpresa = opts.diasLicenciaEmpresa ?? mockConfig.dias_licencia_empresa;
  const impacto = calcularImpactoNomina(tipo, dias, diasLicEmpresa);
  return cambiarEstado(solicitudId, empresaId, 'confirmada_rrhh', {
    ...impacto,
    fecha_confirmacion: new Date().toISOString(),
    confirmado_por: opts.confirmadoPor || null,
    comentario_rrhh: opts.comentario || null,
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

export async function calcularSaldoVacaciones(empresaId, personalId, anio) {
  const anioActual = anio || new Date().getFullYear();
  if (getDataMode() !== 'supabase') {
    const config = { ...mockConfig };
    const usados = mockSolicitudes
      .filter(s => s.empresa_id === empresaId && s.personal_id === personalId
        && s.tipo === 'vacaciones'
        && ['aprobada_jefe', 'confirmada_rrhh', 'activa'].includes(s.estado)
        && s.fecha_inicio?.startsWith(String(anioActual)))
      .reduce((acc, s) => acc + (s.dias_habiles || 0), 0);
    return { disponibles: config.dias_vacaciones_anio, usados, saldo: config.dias_vacaciones_anio - usados };
  }
  const supabase = await getSupabaseClient();
  const [configRes, usadosRes] = await Promise.all([
    supabase.from('rrhh_config_ausencias').select('dias_vacaciones_anio').eq('empresa_id', empresaId).maybeSingle(),
    supabase.from('solicitudes_rrhh')
      .select('dias_habiles')
      .eq('empresa_id', empresaId)
      .eq('personal_id', personalId)
      .eq('tipo', 'vacaciones')
      .in('estado', ['aprobada_jefe', 'confirmada_rrhh', 'activa'])
      .gte('fecha_inicio', `${anioActual}-01-01`)
      .lte('fecha_inicio', `${anioActual}-12-31`),
  ]);
  if (configRes.error) throw configRes.error;
  if (usadosRes.error) throw usadosRes.error;
  const disponibles = configRes.data?.dias_vacaciones_anio ?? 30;
  const usados = (usadosRes.data || []).reduce((acc, r) => acc + (r.dias_habiles || 0), 0);
  return { disponibles, usados, saldo: disponibles - usados };
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
