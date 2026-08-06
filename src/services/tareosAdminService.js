import { isSupabaseMode } from '../lib/dataMode.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';

// ── In-memory mock ────────────────────────────────────────────────────────────
let _mockTareos = [];
let _mockCounter = 1;
function mockId() { return `tareo_mock_${_mockCounter++}`; }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sb() { return getSupabaseClient(); }

// ── Lectura ───────────────────────────────────────────────────────────────────

export async function cargarTareos(empresaId, { personalId, fecha, desde, hasta, otId, osId } = {}) {
  if (!isSupabaseMode()) {
    return _mockTareos.filter(t =>
      t.empresa_id === empresaId &&
      (!personalId || t.personal_id === personalId) &&
      (!fecha    || t.fecha === fecha) &&
      (!desde    || t.fecha >= desde) &&
      (!hasta    || t.fecha <= hasta) &&
      (!otId     || t.ot_id === otId) &&
      (!osId     || t.os_id === osId)
    );
  }
  const client = await sb();
  let q = client.from('tareos_admin').select('*').eq('empresa_id', empresaId);
  if (personalId) q = q.eq('personal_id', personalId);
  if (fecha)      q = q.eq('fecha', fecha);
  if (desde)      q = q.gte('fecha', desde);
  if (hasta)      q = q.lte('fecha', hasta);
  if (otId)       q = q.eq('ot_id', otId);
  if (osId)       q = q.eq('os_id', osId);
  q = q.order('fecha', { ascending: false }).order('creado_en', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// OTs activas donde el colaborador aparece en participantes_admin
export async function cargarOTsAdminDelDia(empresaId, personalId) {
  if (!isSupabaseMode()) return [];
  const client = await sb();
  const { data, error } = await client
    .from('ordenes_trabajo')
    .select('id, numero, descripcion, cuenta_id, estado, participantes_admin')
    .eq('empresa_id', empresaId)
    .in('estado', ['programada', 'ejecucion']);
  if (error) throw error;
  return (data || []).filter(ot => {
    const admins = Array.isArray(ot.participantes_admin) ? ot.participantes_admin : [];
    return admins.some(a => a.personal_id === personalId);
  });
}

export async function cargarCecosActivos(empresaId, sociedadId = null) {
  if (!isSupabaseMode()) return [];
  const client = await sb();
  let query = client
    .from('centros_costo')
    .select('id, nombre, codigo')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo');
  if (sociedadId) query = query.eq('sociedad_id', sociedadId);
  const { data, error } = await query.order('nombre');
  if (error) throw error;
  return data || [];
}

// ── Escritura ─────────────────────────────────────────────────────────────────

export async function crearTareo(empresaId, tareo) {
  const now = new Date().toISOString();
  if (!isSupabaseMode()) {
    const nuevo = {
      id: mockId(),
      empresa_id: empresaId,
      estado: 'borrador',
      creado_en: now,
      actualizado_en: now,
      ...tareo,
    };
    _mockTareos.push(nuevo);
    return nuevo;
  }
  const client = await sb();
  const { data, error } = await client.from('tareos_admin').insert({
    empresa_id:     empresaId,
    personal_id:    tareo.personal_id,
    personal_nombre: tareo.personal_nombre,
    fecha:          tareo.fecha,
    horas:          tareo.horas,
    descripcion:    tareo.descripcion,
    tipo:           tareo.tipo,
    ot_id:          tareo.ot_id    || null,
    os_id:          tareo.os_id    || null,
    ceco_id:        tareo.ceco_id  || null,
    ceco_nombre:    tareo.ceco_nombre || null,
    estado:         tareo.estado   || 'borrador',
    origen:         tareo.origen   || 'backoffice',
    creado_por:     tareo.creado_por || null,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function actualizarTareo(tareoId, datos) {
  if (!isSupabaseMode()) {
    const idx = _mockTareos.findIndex(t => t.id === tareoId);
    if (idx >= 0) _mockTareos[idx] = { ..._mockTareos[idx], ...datos, actualizado_en: new Date().toISOString() };
    return _mockTareos[idx] || null;
  }
  const client = await sb();
  const { data, error } = await client
    .from('tareos_admin')
    .update({ ...datos, actualizado_en: new Date().toISOString() })
    .eq('id', tareoId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// Cambia todos los borradores del día a 'enviado'
export async function enviarTareosDia(empresaId, personalId, fecha) {
  if (!isSupabaseMode()) {
    _mockTareos
      .filter(t => t.empresa_id === empresaId && t.personal_id === personalId && t.fecha === fecha && t.estado === 'borrador')
      .forEach(t => { t.estado = 'enviado'; t.actualizado_en = new Date().toISOString(); });
    return true;
  }
  const client = await sb();
  const { error } = await client
    .from('tareos_admin')
    .update({ estado: 'enviado', actualizado_en: new Date().toISOString() })
    .eq('empresa_id', empresaId)
    .eq('personal_id', personalId)
    .eq('fecha', fecha)
    .eq('estado', 'borrador');
  if (error) throw error;
  return true;
}

// Corrección backoffice: supervisor puede editar un tareo enviado
export async function corregirTareo(tareoId, datos) {
  return actualizarTareo(tareoId, datos);
}
