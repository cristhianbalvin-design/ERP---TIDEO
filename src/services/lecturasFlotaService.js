import { getSupabaseClient } from '../lib/supabaseClient.js';

const mkId = prefix => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(random).replace(/-/g, '').slice(0, 18)}`;
};

const assertOk = (error, message) => {
  if (error) throw new Error(error?.message || message);
};

const payloadLectura = form => ({
  vehiculo_id: form.vehiculo_id,
  ruta_id: form.ruta_id || null,
  parada_id: form.parada_id || null,
  conductor_id: form.conductor_id || null,
  tipo_lectura: form.tipo_lectura,
  valor: Number(form.valor),
  unidad: form.unidad,
  foto_url: form.foto_url || null,
  fecha: form.fecha || new Date().toISOString(),
  observaciones: form.observaciones || null,
});

export async function listarLecturasFlota(empresaId, filtros = {}) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  let query = supabase
    .from('lecturas_flota')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  if (filtros.vehiculo_id) query = query.eq('vehiculo_id', filtros.vehiculo_id);
  if (filtros.ruta_id) query = query.eq('ruta_id', filtros.ruta_id);
  const { data, error } = await query;
  assertOk(error, 'No se pudieron cargar las lecturas de flota.');
  return data || [];
}

export async function crearLecturaFlota(empresaId, form) {
  const supabase = await getSupabaseClient();
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('lecturas_flota')
    .insert({
      id: mkId('lec'),
      empresa_id: empresaId,
      ...payloadLectura(form),
      created_at: timestamp,
      updated_at: timestamp,
    })
    .select('*')
    .single();
  assertOk(error, 'No se pudo registrar la lectura de flota.');
  return data;
}
