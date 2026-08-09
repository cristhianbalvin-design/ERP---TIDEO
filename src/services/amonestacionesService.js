import { getSupabaseClient } from '../lib/supabaseClient.js';
import { getDataMode } from '../lib/dataMode.js';
import { resolverSociedadLaboralParaEscritura } from './sociedadEscrituraService.js';

const genId = () => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `amon_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

// ── Mock data ─────────────────────────────────────────────────────────────────

let mockAmonestaciones = [
  {
    id: 'amon_001', empresa_id: 'emp_001',
    personal_id: 'per_001', personal_tipo: 'operativo', personal_nombre: 'Carlos Quispe',
    tipo: 'verbal', motivo: 'Tardanza reiterada',
    descripcion: 'Tres tardanzas consecutivas sin justificación en la semana del 02/06.',
    fecha: '2026-06-02',
    dias_suspension: null, fecha_inicio_suspension: null, fecha_fin_suspension: null,
    evidencia_url: null,
    registrado_por: 'RRHH Demo', registrado_por_id: null,
    estado: 'activo', motivo_anulacion: null, anulado_por: null, anulado_en: null,
    impactar_asistencia: false, impacto_aplicado: false,
    creado_en: '2026-06-03T09:00:00Z', actualizado_en: '2026-06-03T09:00:00Z',
  },
  {
    id: 'amon_002', empresa_id: 'emp_001',
    personal_id: 'per_002', personal_tipo: 'administrativo', personal_nombre: 'María Torres',
    tipo: 'escrita', motivo: 'Incumplimiento de normas de seguridad',
    descripcion: 'No utilizó EPP requerido durante labor en área de riesgo el 10/05.',
    fecha: '2026-05-12',
    dias_suspension: null, fecha_inicio_suspension: null, fecha_fin_suspension: null,
    evidencia_url: 'https://example.com/evidencia_001.pdf',
    registrado_por: 'RRHH Demo', registrado_por_id: null,
    estado: 'activo', motivo_anulacion: null, anulado_por: null, anulado_en: null,
    impactar_asistencia: false, impacto_aplicado: false,
    creado_en: '2026-05-12T10:00:00Z', actualizado_en: '2026-05-12T10:00:00Z',
  },
  {
    id: 'amon_003', empresa_id: 'emp_001',
    personal_id: 'per_001', personal_tipo: 'operativo', personal_nombre: 'Carlos Quispe',
    tipo: 'suspension', motivo: 'Falta grave — abandono de puesto',
    descripcion: 'Abandono de puesto de trabajo sin autorización el 20/04.',
    fecha: '2026-04-22',
    dias_suspension: 3, fecha_inicio_suspension: '2026-04-23', fecha_fin_suspension: '2026-04-25',
    evidencia_url: 'https://example.com/evidencia_002.pdf',
    registrado_por: 'RRHH Demo', registrado_por_id: null,
    estado: 'activo', motivo_anulacion: null, anulado_por: null, anulado_en: null,
    impactar_asistencia: true, impacto_aplicado: true,
    creado_en: '2026-04-22T14:00:00Z', actualizado_en: '2026-04-22T14:00:00Z',
  },
];

// ── API ───────────────────────────────────────────────────────────────────────

export async function cargarAmonestaciones(empresaId, personalId = null) {
  if (!empresaId) return [];
  if (getDataMode() !== 'supabase') {
    let rows = mockAmonestaciones.filter(a => a.empresa_id === empresaId);
    if (personalId) rows = rows.filter(a => a.personal_id === personalId);
    return rows.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
  const supabase = await getSupabaseClient();
  let query = supabase.from('amonestaciones_personal').select('*').eq('empresa_id', empresaId);
  if (personalId) query = query.eq('personal_id', personalId);
  const { data, error } = await query.order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function registrarAmonestacion(empresaId, datos) {
  const {
    personal_id, personal_tipo, personal_nombre,
    sociedad_id = null,
    tipo, motivo, descripcion, fecha,
    dias_suspension = null, fecha_inicio_suspension = null, fecha_fin_suspension = null,
    evidencia_url = null,
    registrado_por, registrado_por_id = null,
    impactar_asistencia = false,
  } = datos;

  if (!motivo?.trim()) throw new Error('El motivo es obligatorio.');
  if (['escrita', 'suspension'].includes(tipo) && !evidencia_url) {
    throw new Error('La evidencia documental es obligatoria para amonestaciones escritas y suspensiones.');
  }
  if (tipo === 'suspension') {
    if (!dias_suspension || dias_suspension < 1) throw new Error('Las suspensiones requieren indicar el número de días.');
    if (!fecha_inicio_suspension || !fecha_fin_suspension) throw new Error('Las suspensiones requieren fechas de inicio y fin.');
  }

  if (getDataMode() !== 'supabase') {
    const nueva = {
      id: genId(), empresa_id: empresaId,
      personal_id, personal_tipo, personal_nombre,
      sociedad_id,
      tipo, motivo: motivo.trim(), descripcion: descripcion?.trim() || null, fecha,
      dias_suspension: tipo === 'suspension' ? dias_suspension : null,
      fecha_inicio_suspension: tipo === 'suspension' ? fecha_inicio_suspension : null,
      fecha_fin_suspension: tipo === 'suspension' ? fecha_fin_suspension : null,
      evidencia_url: evidencia_url || null,
      registrado_por, registrado_por_id,
      estado: 'activo', motivo_anulacion: null, anulado_por: null, anulado_en: null,
      impactar_asistencia: tipo === 'suspension' ? Boolean(impactar_asistencia) : false,
      impacto_aplicado: false,
      creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString(),
    };
    mockAmonestaciones.unshift(nueva);
    return nueva;
  }

  const supabase = await getSupabaseClient();
  const sociedadId = await resolverSociedadLaboralParaEscritura(
    supabase,
    empresaId,
    personal_id,
    fecha,
  );
  const row = {
    id: genId(), empresa_id: empresaId,
    personal_id, personal_tipo, personal_nombre,
    sociedad_id: sociedadId,
    tipo, motivo: motivo.trim(), descripcion: descripcion?.trim() || null, fecha,
    dias_suspension: tipo === 'suspension' ? dias_suspension : null,
    fecha_inicio_suspension: tipo === 'suspension' ? fecha_inicio_suspension : null,
    fecha_fin_suspension: tipo === 'suspension' ? fecha_fin_suspension : null,
    evidencia_url: evidencia_url || null,
    registrado_por, registrado_por_id,
    estado: 'activo',
    impactar_asistencia: tipo === 'suspension' ? Boolean(impactar_asistencia) : false,
    impacto_aplicado: false,
  };
  const { data, error } = await supabase.from('amonestaciones_personal').insert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function anularAmonestacion(id, empresaId, motivo, usuario) {
  if (!motivo?.trim()) throw new Error('El motivo de anulación es obligatorio.');
  if (getDataMode() !== 'supabase') {
    const idx = mockAmonestaciones.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Amonestación no encontrada.');
    mockAmonestaciones[idx] = {
      ...mockAmonestaciones[idx],
      estado: 'anulado',
      motivo_anulacion: motivo.trim(),
      anulado_por: usuario,
      anulado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };
    return mockAmonestaciones[idx];
  }
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('amonestaciones_personal')
    .update({
      estado: 'anulado',
      motivo_anulacion: motivo.trim(),
      anulado_por: usuario,
      anulado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('empresa_id', empresaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Retorna las amonestaciones activas de un colaborador en un rango de fechas.
 * Usada por evaluaciones de desempeño y futuro portal del empleado.
 * @param {string} empresaId
 * @param {string} personalId
 * @param {string} desde - fecha ISO 'YYYY-MM-DD'
 * @param {string} hasta - fecha ISO 'YYYY-MM-DD'
 * @returns {Promise<Array>}
 */
export async function getAmonestacionesActivas(empresaId, personalId, desde = null, hasta = null) {
  if (!empresaId || !personalId) return [];
  if (getDataMode() !== 'supabase') {
    return mockAmonestaciones.filter(a => {
      if (a.empresa_id !== empresaId || a.personal_id !== personalId || a.estado !== 'activo') return false;
      if (desde && a.fecha < desde) return false;
      if (hasta && a.fecha > hasta) return false;
      return true;
    }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('amonestaciones_personal')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId)
    .eq('estado', 'activo');
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  const { data, error } = await query.order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function notificarAmonestacion(supabase, empresaId, amonestacion, personalAuthUserId) {
  if (!personalAuthUserId) return;
  const tipoLabel = { verbal: 'verbal', escrita: 'escrita', suspension: 'de suspensión' };
  try {
    // Idempotencia: no duplicar si existe notificacion no leida del mismo tipo/ref en 20 horas
    const ventana = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { data: existente } = await supabase
      .from('notificaciones_sistema')
      .select('id')
      .eq('user_id', personalAuthUserId)
      .eq('tipo', 'amonestacion')
      .eq('referencia_tipo', 'amonestacion')
      .eq('referencia_id', amonestacion.id)
      .eq('leida', false)
      .gte('created_at', ventana)
      .maybeSingle();
    if (existente) return;
    await supabase.from('notificaciones_sistema').insert({
      empresa_id: empresaId,
      user_id: personalAuthUserId,
      tipo: 'amonestacion',
      titulo: `Amonestación ${tipoLabel[amonestacion.tipo] || amonestacion.tipo} registrada`,
      mensaje: `Se ha registrado una amonestación ${tipoLabel[amonestacion.tipo] || amonestacion.tipo} en tu expediente. Motivo: ${amonestacion.motivo}. Contacta a RRHH si tienes consultas.`,
      referencia_tipo: 'amonestacion',
      referencia_id: amonestacion.id,
      referencia_payload: { personal_id: amonestacion.personal_id, tipo: amonestacion.tipo, fecha: amonestacion.fecha },
      prioridad: amonestacion.tipo === 'suspension' ? 'alta' : 'media',
      leida: false,
    });
  } catch (err) {
    console.warn('[amonestaciones] No se pudo enviar notificacion:', err?.message);
  }
}
