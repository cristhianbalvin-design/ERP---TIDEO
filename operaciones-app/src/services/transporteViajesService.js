import { getSupabaseClient } from '../lib/supabaseClient.js';
import { resolverTarifa } from './transporteTarifasService.js';
import { normalizarPayloadViaje } from '../zahory-mock/pages/transporte/transporteUtils.js';

const VIAJE_COLUMNS = 'id,empresa_id,sociedad_id,codigo,cuenta_id,os_cliente_id,cotizacion_id,ruta_id,origen_nombre,destino_nombre,distancia_km,duracion_estimada_horas,tipo_unidad,modalidad,carga_descripcion,peso_toneladas,volumen_m3,cantidad_facturable,tarifa_id,tarifa_unitaria,moneda,minimo_facturable,ingreso_estimado,fecha_programada,transportista_id,vehiculo_id,conductor_id,estado,motivo_cancelacion,observaciones,created_by,created_at,updated_at';
const ERROR_MESSAGES = [
  [/No tienes permiso/i, 'No tienes permiso para realizar esta acción en Transporte Comercial.'],
  [/La OS cliente debe pertenecer/i, 'La orden de servicio debe pertenecer al cliente y empresa del viaje.'],
  [/La cuenta debe pertenecer/i, 'El cliente seleccionado no pertenece a esta empresa.'],
  [/Viaje no encontrado/i, 'No se encontró el viaje solicitado.'],
  [/Transición de estado no permitida/i, 'Ese cambio de estado no está permitido.'],
  [/Se requiere motivo para cancelar/i, 'Ingresa el motivo de cancelación.'],
  [/Solo se pueden editar viajes en borrador o programados/i, 'Solo se pueden editar viajes en borrador o programados.'],
  [/23505/, 'Ya existe un registro que entra en conflicto con este viaje.'],
];
const traducir = error => {
  if (!error) return;
  const source = `${error.message || ''} ${error.code || ''}`;
  const match = ERROR_MESSAGES.find(([pattern]) => pattern.test(source));
  if (match) throw new Error(match[1]);
  throw new Error(error.message || 'No se pudo completar la operación del viaje.');
};
const check = error => { if (error) traducir(error); };

export async function listarViajes(empresaId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes')
    .select(`${VIAJE_COLUMNS},cuenta:cuentas(id,nombre_comercial,razon_social),os:os_clientes(id,numero),ruta:transporte_rutas(id,codigo,nombre),vehiculo:vehiculos_transporte(placa),conductor:conductores_transporte(nombre),paradas:transporte_viaje_paradas(count)`)
    .eq('empresa_id', empresaId).order('fecha_programada', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  check(error);
  return data || [];
}

export async function obtenerViaje(empresaId, viajeId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes')
    .select(`${VIAJE_COLUMNS},cuenta:cuentas(id,nombre_comercial,razon_social),os:os_clientes(id,numero),ruta:transporte_rutas(id,codigo,nombre),vehiculo:vehiculos_transporte(placa),conductor:conductores_transporte(nombre),paradas:transporte_viaje_paradas(*),eventos:transporte_viaje_eventos(*)`)
    .eq('empresa_id', empresaId).eq('id', viajeId).maybeSingle();
  check(error);
  if (!data) return null;
  data.paradas = (data.paradas || []).sort((a, b) => a.secuencia - b.secuencia);
  data.eventos = (data.eventos || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return data;
}

const payloadViaje = (empresaId, payload) => {
  const normalized = normalizarPayloadViaje(payload);
  const fields = VIAJE_COLUMNS.split(',').filter(key => !['id','empresa_id','codigo','estado','created_by','created_at','updated_at','motivo_cancelacion'].includes(key));
  return Object.fromEntries(fields.map(key => [key, normalized[key] ?? null]).concat([['empresa_id', empresaId]]));
};
const payloadParadas = (empresaId, viajeId, stops = []) => stops.map((stop, index) => ({
  empresa_id: empresaId, viaje_id: viajeId, secuencia: index + 1, tipo: stop.tipo,
  nombre: String(stop.nombre || '').trim(), direccion: stop.direccion || null,
  latitud: stop.latitud === '' ? null : stop.latitud ?? null,
  longitud: stop.longitud === '' ? null : stop.longitud ?? null,
  guia_remision_id: stop.guia_remision_id || null,
  observaciones: stop.observaciones || null,
}));

export async function crearViaje(empresaId, payload) {
  return guardarViaje(null, empresaId, payload);
}

export async function editarViaje(empresaId, viajeId, payload) {
  return guardarViaje(viajeId, empresaId, payload);
}

async function guardarViaje(viajeId, empresaId, payload) {
  const { data, error } = await getSupabaseClient().rpc('transporte_viaje_guardar', {
    p_viaje_id: viajeId,
    p_datos: payloadViaje(empresaId, payload),
    p_paradas: payloadParadas(empresaId, viajeId, payload.paradas),
  });
  check(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function cambiarEstadoViaje(viajeId, estadoNuevo, nota = null) {
  const { data, error } = await getSupabaseClient().rpc('transporte_viaje_cambiar_estado', { p_viaje_id: viajeId, p_estado_nuevo: estadoNuevo, p_nota: nota });
  check(error);
  return data;
}

export async function eliminarViajeBorrador(empresaId, viajeId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes').delete().eq('empresa_id', empresaId).eq('id', viajeId).eq('estado', 'borrador').select('id').maybeSingle();
  check(error);
  if (!data) throw new Error('Solo se puede eliminar un viaje en borrador.');
  return data;
}

export async function listarOSCliente(empresaId, cuentaId) {
  if (!cuentaId) return [];
  const { data, error } = await getSupabaseClient().from('os_clientes').select('id,numero,tipo_cobro,cuenta_id,empresa_id')
    .eq('empresa_id', empresaId).eq('cuenta_id', cuentaId).order('created_at', { ascending: false });
  check(error);
  return data || [];
}

export { resolverTarifa };
