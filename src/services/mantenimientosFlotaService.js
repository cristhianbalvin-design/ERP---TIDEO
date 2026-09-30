import { getSupabaseClient } from '../lib/supabaseClient.js';

const mkId = prefix => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(random).replace(/-/g, '').slice(0, 18)}`;
};

const assertOk = (error, message) => {
  if (error) throw new Error(error?.message || message);
};

const payloadMantenimiento = form => ({
  vehiculo_id: form.vehiculo_id,
  tipo_mantenimiento: form.tipo_mantenimiento,
  fecha: form.fecha,
  costo: form.costo === '' || form.costo == null ? null : Number(form.costo),
  moneda: form.moneda || 'PEN',
  taller_proveedor: form.taller_proveedor || null,
  kilometraje: form.kilometraje === '' || form.kilometraje == null ? null : Number(form.kilometraje),
  proximo_mantenimiento_fecha: form.proximo_mantenimiento_fecha || null,
  orden_compra_id: form.orden_compra_id || null,
  gasto_id: form.gasto_id || null,
  observaciones: form.observaciones || null,
});

export async function listarMantenimientosFlota(empresaId) {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('mantenimientos_flota')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });
  assertOk(error, 'No se pudieron cargar los mantenimientos de flota.');
  return data || [];
}

export async function crearMantenimientoFlota(empresaId, form) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('mantenimientos_flota').insert({
    id: mkId('mfl'),
    empresa_id: empresaId,
    ...payloadMantenimiento(form),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select().single();
  assertOk(error, 'No se pudo registrar el mantenimiento.');
  return data;
}

export async function actualizarMantenimientoFlota(id, form) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('mantenimientos_flota').update({
    ...payloadMantenimiento(form),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  assertOk(error, 'No se pudo actualizar el mantenimiento.');
  return data;
}

export async function eliminarMantenimientoFlota(id) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('mantenimientos_flota').delete().eq('id', id);
  assertOk(error, 'No se pudo eliminar el mantenimiento.');
  return id;
}
