import { getSupabaseClient } from '../lib/supabaseClient.js';

const COLUMNS = [
  'id', 'empresa_id', 'cuenta_id', 'nombre', 'tipo', 'direccion', 'referencia', 'ubigeo',
  'distrito', 'provincia', 'departamento', 'latitud', 'longitud', 'contacto_nombre',
  'contacto_telefono', 'horario_atencion', 'requisitos_acceso', 'restricciones', 'estado',
  'notas', 'created_at', 'updated_at',
].join(',');
const nullable = value => value === '' || value == null ? null : value;
const payloadLugar = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [
  key, typeof value === 'string' ? nullable(value.trim()) : value,
]));
const check = error => { if (error) throw error; };

export async function listarLugares(empresaId, filtros = {}) {
  let query = getSupabaseClient().from('transporte_lugares').select(COLUMNS)
    .eq('empresa_id', empresaId).eq('estado', filtros.estado || 'activo').order('nombre');
  if (filtros.cuentaId === 'general') query = query.is('cuenta_id', null);
  else if (filtros.cuentaId) query = query.eq('cuenta_id', filtros.cuentaId);
  if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
  if (filtros.busqueda) query = query.ilike('nombre', `%${filtros.busqueda}%`);
  const { data, error } = await query;
  check(error);
  return data || [];
}

export async function obtenerLugar(empresaId, lugarId) {
  const { data, error } = await getSupabaseClient().from('transporte_lugares').select(COLUMNS)
    .eq('empresa_id', empresaId).eq('id', lugarId).maybeSingle();
  check(error); return data || null;
}

export async function crearLugar(empresaId, values) {
  const { data: auth, error: authError } = await getSupabaseClient().auth.getUser(); check(authError);
  const { data, error } = await getSupabaseClient().from('transporte_lugares')
    .insert({ ...payloadLugar(values), empresa_id: empresaId, created_by: auth?.user?.id || null })
    .select(COLUMNS).single();
  check(error); return data;
}

export async function actualizarLugar(empresaId, lugarId, values) {
  const { data, error } = await getSupabaseClient().from('transporte_lugares')
    .update(payloadLugar(values)).eq('empresa_id', empresaId).eq('id', lugarId)
    .select(COLUMNS).single();
  check(error); return data;
}

export async function inactivarLugar(empresaId, lugarId) { return actualizarLugar(empresaId, lugarId, { estado: 'inactivo' }); }
