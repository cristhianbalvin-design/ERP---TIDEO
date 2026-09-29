import { getSupabaseClient } from '../lib/supabaseClient.js';

const mkId = prefix => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(random).replace(/-/g, '').slice(0, 18)}`;
};

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

export const ESTADOS_RUTA = [
  ['planificada', 'Planificada'],
  ['en_curso', 'En curso'],
  ['completada', 'Completada'],
  ['cancelada', 'Cancelada'],
];

export const ESTADOS_PARADA = [
  ['pendiente', 'Pendiente'],
  ['en_curso', 'En curso'],
  ['completada', 'Completada'],
  ['omitida', 'Omitida'],
];

const assertOk = (error, message) => {
  if (error) throw new Error(error.message || message);
};

const ordenadas = paradas => [...(paradas || [])]
  .sort((a, b) => Number(a.secuencia || 0) - Number(b.secuencia || 0));

export async function listarRutas(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('rutas')
    .select('*, ruta_paradas(*)')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  assertOk(error, 'No se pudieron cargar las rutas.');
  return (data || []).map(ruta => ({ ...ruta, ruta_paradas: ordenadas(ruta.ruta_paradas) }));
}

export async function listarDocumentosDisponibles(empresaId) {
  if (!empresaId) return { transitos: [], guias: [] };
  const supabase = await getSupabaseClient();
  const [transitosResult, guiasResult, paradasResult] = await Promise.all([
    supabase
      .from('orden_compra_transitos')
      .select('id,empresa_id,orden_compra_id,tipo,estado,fecha_salida,fecha_estimada_llegada,observaciones')
      .eq('empresa_id', empresaId)
      .in('estado', ['registrado', 'en_transito'])
      .order('fecha_salida', { ascending: true, nullsFirst: false }),
    supabase
      .from('guias_remision')
      .select('id,empresa_id,numero_completo,tipo_origen,estado,fecha_inicio_traslado,llegada_direccion,destinatario_razon_social')
      .eq('empresa_id', empresaId)
      .eq('tipo_origen', 'despacho_servicio')
      .in('estado', ['borrador', 'emitida', 'en_transito'])
      .order('fecha_inicio_traslado', { ascending: true, nullsFirst: false }),
    supabase
      .from('ruta_paradas')
      .select('tipo_documento,documento_id')
      .eq('empresa_id', empresaId),
  ]);
  assertOk(transitosResult.error, 'No se pudieron cargar los tránsitos pendientes.');
  assertOk(guiasResult.error, 'No se pudieron cargar las guías de servicio pendientes.');
  assertOk(paradasResult.error, 'No se pudieron revisar las paradas ya asignadas.');

  const asignados = new Set((paradasResult.data || []).map(parada => `${parada.tipo_documento}:${parada.documento_id}`));
  return {
    transitos: (transitosResult.data || []).filter(item => !asignados.has(`orden_compra_transito:${item.id}`)),
    guias: (guiasResult.data || []).filter(item => !asignados.has(`guia_remision:${item.id}`)),
  };
}

export async function crearRuta(empresaId, payload) {
  const supabase = await getSupabaseClient();
  const fecha = payload.fecha || today();
  const codigo = String(payload.codigo || '').trim() || `RUT-${fecha.replace(/-/g, '')}-${String(Date.now()).slice(-6)}`;
  const { data, error } = await supabase
    .from('rutas')
    .insert({
      id: mkId('rut'),
      empresa_id: empresaId,
      codigo,
      fecha,
      estado: 'planificada',
      vehiculo_id: payload.vehiculo_id || null,
      conductor_id: payload.conductor_id || null,
      transportista_id: payload.transportista_id || null,
      observaciones: String(payload.observaciones || '').trim() || null,
    })
    .select('*')
    .single();
  assertOk(error, 'No se pudo crear la ruta.');
  return { ...data, ruta_paradas: [] };
}

export async function actualizarRuta(empresaId, rutaId, cambios) {
  const permitidos = ['codigo', 'fecha', 'vehiculo_id', 'conductor_id', 'transportista_id', 'observaciones'];
  const payload = Object.fromEntries(permitidos.filter(key => key in cambios).map(key => [key, cambios[key] || null]));
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('rutas')
    .update(payload)
    .eq('empresa_id', empresaId)
    .eq('id', rutaId)
    .select('*')
    .single();
  assertOk(error, 'No se pudo actualizar la ruta.');
  return data;
}

export async function actualizarEstadoRuta(empresaId, rutaId, estado) {
  if (!ESTADOS_RUTA.some(([key]) => key === estado)) throw new Error('Estado de ruta no válido.');
  const cambios = { estado };
  if (estado === 'en_curso') cambios.hora_salida = now();
  if (estado === 'completada' || estado === 'cancelada') cambios.hora_cierre = now();
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('rutas')
    .update(cambios)
    .eq('empresa_id', empresaId)
    .eq('id', rutaId)
    .select('*')
    .single();
  assertOk(error, 'No se pudo actualizar el estado de la ruta.');
  return data;
}

export async function agregarParada(empresaId, rutaId, payload) {
  if (!['orden_compra_transito', 'guia_remision'].includes(payload.tipo_documento)) {
    throw new Error('Tipo de documento de parada no válido.');
  }
  if (!payload.documento_id) throw new Error('Selecciona un documento para la parada.');
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('ruta_paradas')
    .insert({
      id: mkId('rpa'),
      empresa_id: empresaId,
      ruta_id: rutaId,
      secuencia: Number(payload.secuencia || 1),
      tipo_documento: payload.tipo_documento,
      documento_id: payload.documento_id,
      estado: 'pendiente',
      observaciones: String(payload.observaciones || '').trim() || null,
    })
    .select('*')
    .single();
  assertOk(error, 'No se pudo agregar la parada.');
  return data;
}

export async function actualizarParada(empresaId, paradaId, cambios) {
  const permitidos = ['estado', 'llegada_at', 'salida_at', 'observaciones'];
  const payload = Object.fromEntries(permitidos.filter(key => key in cambios).map(key => [key, cambios[key]]));
  if (payload.estado && !ESTADOS_PARADA.some(([key]) => key === payload.estado)) throw new Error('Estado de parada no válido.');
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('ruta_paradas')
    .update(payload)
    .eq('empresa_id', empresaId)
    .eq('id', paradaId)
    .select('*')
    .single();
  assertOk(error, 'No se pudo actualizar la parada.');
  return data;
}

export async function actualizarEstadoParada(empresaId, paradaId, estado, observaciones = null) {
  const cambios = { estado };
  if (estado === 'en_curso') cambios.llegada_at = now();
  if (estado === 'completada' || estado === 'omitida') cambios.salida_at = now();
  if (observaciones !== null) cambios.observaciones = observaciones;
  return actualizarParada(empresaId, paradaId, cambios);
}

export async function reordenarParadas(empresaId, rutaId, paradas) {
  const orden = [...(paradas || [])];
  if (!orden.length) return [];
  const supabase = await getSupabaseClient();
  // Dos fases evitan colisiones con el índice único (ruta_id, secuencia).
  for (let index = 0; index < orden.length; index += 1) {
    const { error } = await supabase
      .from('ruta_paradas')
      .update({ secuencia: 100000 + index })
      .eq('empresa_id', empresaId)
      .eq('ruta_id', rutaId)
      .eq('id', orden[index].id);
    assertOk(error, 'No se pudo preparar el reordenamiento de paradas.');
  }
  for (let index = 0; index < orden.length; index += 1) {
    const { error } = await supabase
      .from('ruta_paradas')
      .update({ secuencia: index + 1 })
      .eq('empresa_id', empresaId)
      .eq('ruta_id', rutaId)
      .eq('id', orden[index].id);
    assertOk(error, 'No se pudo guardar el orden de las paradas.');
  }
  return orden.map((parada, index) => ({ ...parada, secuencia: index + 1 }));
}

export async function quitarParada(empresaId, paradaId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('ruta_paradas')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('id', paradaId);
  assertOk(error, 'No se pudo quitar la parada.');
  return paradaId;
}

export async function eliminarRuta(empresaId, rutaId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('rutas')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('id', rutaId);
  assertOk(error, 'No se pudo eliminar la ruta.');
  return rutaId;
}
