import { getSupabaseClient } from '../lib/supabaseClient.js';
import { resolverTarifa } from './transporteTarifasService.js';
import { incluirOSActual, normalizarPayloadViaje } from '../zahory-mock/pages/transporte/transporteUtils.js';

const VIAJE_COLUMNS = [
  'id', 'empresa_id', 'sociedad_id', 'codigo', 'cuenta_id', 'os_cliente_id', 'cotizacion_id',
  'ruta_id', 'origen_nombre', 'destino_nombre', 'distancia_km', 'duracion_estimada_horas',
  'tipo_unidad', 'modalidad', 'carga_descripcion', 'peso_toneladas', 'volumen_m3',
  'cantidad_facturable', 'tarifa_id', 'tarifa_unitaria', 'moneda', 'minimo_facturable',
  'ingreso_estimado', 'fecha_programada', 'transportista_id', 'vehiculo_id', 'conductor_id',
  'estado', 'motivo_cancelacion', 'observaciones', 'referencia_cliente', 'contacto_id',
  'tipo_carga', 'carga_bultos', 'carga_unidad_bultos', 'requisitos', 'created_by', 'created_at',
  'updated_at',
].join(',');
const ERROR_MESSAGES = [
  [/No tienes permiso/i, 'No tienes permiso para realizar esta acción en Transporte Comercial.'],
  [/La OS cliente debe pertenecer/i, 'La orden de servicio debe pertenecer al cliente y empresa del viaje.'],
  [/La cuenta debe pertenecer/i, 'El cliente seleccionado no pertenece a esta empresa.'],
  [/Viaje no encontrado/i, 'No se encontró el viaje solicitado.'],
  [/Transición de estado no permitida/i, 'Ese cambio de estado no está permitido.'],
  [/Se requiere motivo para cancelar/i, 'Ingresa el motivo de cancelación.'],
  [/Solo se pueden editar viajes en borrador o programados/i, 'Solo se pueden editar viajes en borrador o programados.'],
  [/Se requiere motivo de excepción para despachar: ([^.]*)/i, 'Escribe el motivo de la excepción para despachar.'],
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
    .select(`${VIAJE_COLUMNS},cuenta:cuentas(id,nombre_comercial,razon_social),os:os_clientes(id,numero),ruta:transporte_rutas(id,codigo,nombre),vehiculo:vehiculos_transporte(placa),conductor:conductores_transporte(nombre),paradas:transporte_viaje_paradas(secuencia,tipo,nombre,latitud,longitud),eventos:transporte_viaje_eventos(estado_anterior,estado_nuevo,nota,created_at)`)
    .eq('empresa_id', empresaId).order('fecha_programada', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  check(error);
  return (data || []).map(row => ({ ...row,
    paradas: (row.paradas || []).sort((a, b) => a.secuencia - b.secuencia),
    eventos: (row.eventos || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) }));
}

export async function obtenerViaje(empresaId, viajeId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes')
    .select(`${VIAJE_COLUMNS},cuenta:cuentas(id,nombre_comercial,razon_social),os:os_clientes(id,numero),ruta:transporte_rutas(id,codigo,nombre),vehiculo:vehiculos_transporte(id,placa,tipo,marca,modelo,capacidad_toneladas,capacidad_m3,nro_certificado_habilitacion,vigencia_certificado_habilitacion),conductor:conductores_transporte(id,nombre,dni,brevete,categoria_brevete,vigencia_brevete),transportista:transportistas(id,razon_social,nombre_comercial,tipo_operador),paradas:transporte_viaje_paradas(*),eventos:transporte_viaje_eventos(*)`)
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
  lugar_id: stop.lugar_id || null,
  ventana_inicio: stop.ventana_inicio || null,
  ventana_fin: stop.ventana_fin || null,
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

export async function asignarViaje(viajeId, { transportistaId, vehiculoId, conductorId, despachar = false, nota = null }) {
  const { data, error } = await getSupabaseClient().rpc('transporte_viaje_asignar', {
    p_viaje_id: viajeId, p_transportista_id: transportistaId, p_vehiculo_id: vehiculoId,
    p_conductor_id: conductorId, p_despachar: despachar, p_nota: nota,
  });
  check(error);
  return data;
}

export async function agregarNotaViaje(viajeId, nota) {
  const { error } = await getSupabaseClient().rpc('transporte_viaje_agregar_nota', { p_viaje_id: viajeId, p_nota: nota });
  check(error);
}

export async function eliminarViajeBorrador(empresaId, viajeId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes').delete().eq('empresa_id', empresaId).eq('id', viajeId).eq('estado', 'borrador').select('id').maybeSingle();
  check(error);
  if (!data) throw new Error('Solo se puede eliminar un viaje en borrador.');
  return data;
}

export async function listarOSCliente(empresaId, cuentaId, osActualId = null) {
  if (!cuentaId) return [];
  const { data, error } = await getSupabaseClient().from('os_clientes')
    .select('id,numero,tipo_cobro,cuenta_id,empresa_id,estado')
    .eq('empresa_id', empresaId).eq('cuenta_id', cuentaId).neq('estado', 'anulada')
    .order('created_at', { ascending: false });
  check(error);
  const rows = data || [];
  if (osActualId && !rows.some(row => row.id === osActualId)) {
    const { data: saved, error: savedError } = await getSupabaseClient().from('os_clientes')
      .select('id,numero,tipo_cobro,cuenta_id,empresa_id,estado')
      .eq('empresa_id', empresaId).eq('cuenta_id', cuentaId).eq('id', osActualId).maybeSingle();
    check(savedError);
    return incluirOSActual(rows, saved);
  }
  return rows;
}

export async function listarContactosTransporte(cuentaId) {
  if (!cuentaId) return [];
  const { data, error } = await getSupabaseClient().from('contactos')
    .select('id,cuenta_id,nombre,cargo,telefono,email,es_principal,estado')
    .eq('cuenta_id', cuentaId).eq('estado', 'activo')
    .order('es_principal', { ascending: false }).order('nombre');
  check(error);
  return data || [];
}

export { resolverTarifa };
