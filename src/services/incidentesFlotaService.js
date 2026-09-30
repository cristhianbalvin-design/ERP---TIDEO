import { getSupabaseClient } from '../lib/supabaseClient.js';

const mkId = prefix => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(random).replace(/-/g, '').slice(0, 18)}`;
};

const assertOk = (error, message) => {
  if (error) throw new Error(error?.message || message);
};

const payloadIncidente = form => ({
  ruta_id: form.ruta_id || null,
  parada_id: form.parada_id || null,
  vehiculo_id: form.vehiculo_id || null,
  conductor_id: form.conductor_id || null,
  tipo: form.tipo,
  severidad: form.severidad,
  descripcion: String(form.descripcion || '').trim(),
  estado: form.estado || 'abierto',
  foto_url: form.foto_url || null,
  latitud: form.latitud == null ? null : Number(form.latitud),
  longitud: form.longitud == null ? null : Number(form.longitud),
  ...(form.reportado_por ? { reportado_por: form.reportado_por } : {}),
});

export async function listarIncidentesFlota(empresaId, filtros = {}) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('incidentes_flota')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  if (filtros.ruta_id) query = query.eq('ruta_id', filtros.ruta_id);
  if (filtros.estado) query = query.eq('estado', filtros.estado);
  const { data, error } = await query;
  assertOk(error, 'No se pudieron cargar los incidentes de flota.');
  return data || [];
}

export async function crearIncidenteFlota(empresaId, form) {
  const supabase = await getSupabaseClient();
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('incidentes_flota')
    .insert({
      id: mkId('inc'),
      empresa_id: empresaId,
      ...payloadIncidente(form),
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('*')
    .single();
  assertOk(error, 'No se pudo registrar el incidente de flota.');
  return data;
}
