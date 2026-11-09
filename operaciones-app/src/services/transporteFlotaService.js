import { getSupabaseClient } from '../lib/supabaseClient.js';

// Flota de Transporte Comercial: transportistas, unidades y conductores.
// Las tablas son las mismas que usan las guías de remisión del panel administrativo.
const TRANSPORTISTA_COLUMNS = 'id,empresa_id,ruc,razon_social,nombre_comercial,nro_mtc,direccion,telefono,email,tipo_operador,activo,created_at,updated_at';
const VEHICULO_COLUMNS = 'id,empresa_id,transportista_id,placa,marca,modelo,anio,tipo,capacidad_toneladas,capacidad_m3,nro_certificado_habilitacion,vigencia_certificado_habilitacion,activo,created_at,updated_at';
const CONDUCTOR_COLUMNS = 'id,empresa_id,transportista_id,nombre,dni,brevete,categoria_brevete,vigencia_brevete,activo,created_at,updated_at';

const nuevoId = prefijo => {
  const raw = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefijo}_${String(raw).replace(/-/g, '').slice(0, 18)}`;
};
const limpiar = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [
  key, typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value ?? null,
]));
const MENSAJES = [
  [/transportistas_empresa_id_ruc_key|duplicate key.*ruc/i, 'Ya existe un transportista con ese RUC.'],
  [/row-level security|42501/i, 'No tienes permiso para modificar la flota.'],
  [/vehiculos_transporte_capacidad_chk/i, 'La capacidad no puede ser negativa.'],
];
const check = error => {
  if (!error) return;
  const source = `${error.message || ''} ${error.code || ''}`;
  const match = MENSAJES.find(([pattern]) => pattern.test(source));
  throw new Error(match ? match[1] : error.message || 'No se pudo guardar en la flota.');
};

export async function listarFlota(empresaId) {
  const client = getSupabaseClient();
  const [transportistas, vehiculos, conductores] = await Promise.all([
    client.from('transportistas').select(TRANSPORTISTA_COLUMNS).eq('empresa_id', empresaId).order('razon_social'),
    client.from('vehiculos_transporte').select(VEHICULO_COLUMNS).eq('empresa_id', empresaId).order('placa'),
    client.from('conductores_transporte').select(CONDUCTOR_COLUMNS).eq('empresa_id', empresaId).order('nombre'),
  ]);
  check(transportistas.error); check(vehiculos.error); check(conductores.error);
  return { transportistas: transportistas.data || [], vehiculos: vehiculos.data || [], conductores: conductores.data || [] };
}

// Viajes en curso para saber qué unidad o conductor está ocupado.
export async function listarViajesEnCurso(empresaId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes')
    .select('id,codigo,estado,vehiculo_id,conductor_id')
    .eq('empresa_id', empresaId).in('estado', ['despachado', 'en_ruta', 'con_incidente']);
  check(error);
  return data || [];
}

async function guardar(tabla, columnas, prefijo, empresaId, id, values) {
  const payload = limpiar(values);
  const query = id
    ? getSupabaseClient().from(tabla).update(payload).eq('empresa_id', empresaId).eq('id', id)
    : getSupabaseClient().from(tabla).insert({ ...payload, id: nuevoId(prefijo), empresa_id: empresaId });
  const { data, error } = await query.select(columnas).single();
  check(error);
  return data;
}

export const guardarTransportista = (empresaId, id, values) =>
  guardar('transportistas', TRANSPORTISTA_COLUMNS, 'tra', empresaId, id, values);
export const guardarVehiculo = (empresaId, id, values) =>
  guardar('vehiculos_transporte', VEHICULO_COLUMNS, 'veh', empresaId, id, values);
export const guardarConductor = (empresaId, id, values) =>
  guardar('conductores_transporte', CONDUCTOR_COLUMNS, 'con', empresaId, id, values);
