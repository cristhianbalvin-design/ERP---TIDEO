import { getSupabaseClient } from '../lib/supabaseClient.js';

const TARIFAS_COLUMNAS = [
  'id',
  'empresa_id',
  'ruta_id',
  'cuenta_id',
  'tipo_unidad',
  'modalidad',
  'tarifa',
  'moneda',
  'minimo_facturable',
  'vigente_desde',
  'vigente_hasta',
  'estado',
  'notas',
  'created_by',
  'created_at',
  'updated_at',
];

export const TARIFAS_COLUMNS = TARIFAS_COLUMNAS.join(',');

const errorAmigable = error => {
  const message = String(error?.message || '');

  if (error?.code === '23505') {
    return new Error('Ya existe un registro con esta combinación.');
  }
  if (message.includes('El rango de vigencia se solapa con otra tarifa activa de la misma combinación.')) {
    return new Error(message);
  }
  if (error?.code === '23514' && /viaje|ruta/i.test(message)) {
    return new Error('Las tarifas por viaje deben tener una ruta asociada.');
  }
  if (error?.code === '42501') {
    return new Error('No tienes permiso para realizar esta acción en Transporte Comercial.');
  }
  return error;
};

const lanzar = error => {
  if (error) throw errorAmigable(error);
};

export async function listarTarifas(empresaId) {
  const { data, error } = await getSupabaseClient()
    .from('transporte_tarifas')
    .select(TARIFAS_COLUMNS)
    .eq('empresa_id', empresaId)
    .order('vigente_desde', { ascending: false });

  lanzar(error);
  return data || [];
}

export async function obtenerTarifa(empresaId, tarifaId) {
  const { data, error } = await getSupabaseClient()
    .from('transporte_tarifas')
    .select(TARIFAS_COLUMNS)
    .eq('empresa_id', empresaId)
    .eq('id', tarifaId)
    .maybeSingle();

  lanzar(error);
  return data || null;
}

const conUsuario = async payload => {
  const { data, error } = await getSupabaseClient().auth.getUser();
  lanzar(error);
  return { ...payload, created_by: data?.user?.id || null };
};

export async function crearTarifa(empresaId, payload) {
  const body = await conUsuario({ ...payload, empresa_id: empresaId });
  const { data, error } = await getSupabaseClient()
    .from('transporte_tarifas')
    .insert(body)
    .select(TARIFAS_COLUMNS)
    .single();

  lanzar(error);
  return data;
}

export async function actualizarTarifa(empresaId, tarifaId, payload) {
  const { data, error } = await getSupabaseClient()
    .from('transporte_tarifas')
    .update(payload)
    .eq('empresa_id', empresaId)
    .eq('id', tarifaId)
    .select(TARIFAS_COLUMNS)
    .single();

  lanzar(error);
  return data;
}

export async function cambiarEstadoTarifa(empresaId, tarifaId, estado) {
  return actualizarTarifa(empresaId, tarifaId, { estado });
}

export async function resolverTarifa({
  empresaId,
  rutaId = null,
  cuentaId = null,
  tipoUnidad,
  modalidad,
  moneda = null,
  fecha,
}) {
  const { data, error } = await getSupabaseClient().rpc('resolver_tarifa_transporte', {
    p_empresa_id: empresaId,
    p_ruta_id: rutaId,
    p_cuenta_id: cuentaId,
    p_tipo_unidad: tipoUnidad,
    p_modalidad: modalidad,
    p_moneda: moneda || null,
    p_fecha: fecha,
  });

  lanzar(error);
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function listarCuentasTransporte(empresaId) {
  const { data, error } = await getSupabaseClient()
    .from('cuentas')
    .select('id,empresa_id,nombre_comercial,razon_social,ruc,estado')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .order('nombre_comercial');

  lanzar(error);
  return data || [];
}

export async function listarTiposUnidadTransporte(empresaId) {
  const { data, error } = await getSupabaseClient()
    .from('vehiculos_transporte')
    .select('tipo')
    .eq('empresa_id', empresaId)
    .not('tipo', 'is', null)
    .order('tipo');

  lanzar(error);
  return [...new Set((data || []).map(row => row.tipo).filter(Boolean))];
}
