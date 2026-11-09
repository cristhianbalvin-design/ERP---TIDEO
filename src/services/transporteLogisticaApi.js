// Acceso a datos de la Hoja de Ruta combinada. Cada función recibe el cliente de Supabase
// de la app que la usa (Operaciones o el panel administrativo con la app del conductor).
import { ESTADOS_ACTIVOS, fechaLima, hoyLima, inicioDiaLima, ordenarParadas, sumarDias } from '../lib/transporteLogistica.js';

const limpiarMensaje = error => {
  const texto = String(error?.message || error || '').trim();
  if (/permission denied|42501/i.test(texto)) return 'No tienes permiso para esta acción.';
  if (/Failed to fetch|NetworkError/i.test(texto)) return 'Sin conexión. Revisa la señal e intenta de nuevo.';
  return texto || 'No se pudo completar la operación.';
};
const check = error => { if (error) throw new Error(limpiarMensaje(error)); };

const rpc = async (sb, nombre, params) => {
  const { data, error } = await sb.rpc(nombre, params);
  check(error);
  return Array.isArray(data) ? data[0] : data;
};

const VIAJE_LISTA = 'id,empresa_id,codigo,tipo_viaje,estado,cuenta_id,origen_nombre,destino_nombre,tipo_unidad,'
  + 'fecha_programada,vehiculo_id,conductor_id,transportista_id,observaciones,peso_toneladas,'
  + 'carga_descripcion,carga_bultos,carga_unidad_bultos,referencia_cliente,legacy_ruta_id,created_at,'
  + 'cuenta:cuentas(id,nombre_comercial,razon_social),'
  + 'vehiculo:vehiculos_transporte(id,placa,tipo,capacidad_toneladas),'
  + 'conductor:conductores_transporte(id,nombre,dni,brevete,vigencia_brevete),'
  + 'paradas:transporte_viaje_paradas(id,secuencia,tipo,nombre,direccion,latitud,longitud,estado,documento_tipo,'
  + 'oc_transito_id,guia_remision_id,compra_gasto_id,pedido_id,descripcion,ventana_inicio,ventana_fin,llegada_at,'
  + 'salida_at,recibe_nombre,recibe_dni,firma_url,foto_url,foto_carga_url,bultos_recibidos,novedad,observaciones,'
  + 'latitud_evidencia,longitud_evidencia)';

const normalizar = viaje => viaje && ({ ...viaje, paradas: ordenarParadas(viaje.paradas) });

export async function listarViajesHojaRuta(sb, empresaId, fecha) {
  const desde = inicioDiaLima(sumarDias(fecha, -45));
  const inicio = inicioDiaLima(fecha);
  const fin = inicioDiaLima(sumarDias(fecha, 1));
  const { data, error } = await sb.from('transporte_viajes').select(VIAJE_LISTA)
    .eq('empresa_id', empresaId)
    .or(`and(fecha_programada.gte.${inicio},fecha_programada.lt.${fin}),`
      + `and(fecha_programada.gte.${desde},fecha_programada.lt.${inicio},estado.in.(${ESTADOS_ACTIVOS.join(',')}))`)
    .order('fecha_programada', { ascending: true, nullsFirst: false });
  check(error);
  return (data || []).map(normalizar);
}

export async function obtenerViajeCompleto(sb, viajeId) {
  const { data, error } = await sb.from('transporte_viajes')
    .select(`${VIAJE_LISTA},contacto:contactos(id,nombre,telefono,cargo),requisitos,tipo_carga,volumen_m3,`
      + 'hitos:transporte_viaje_hitos(*),inspeccion:transporte_viaje_inspecciones(*),gastos:transporte_viaje_gastos(*),'
      + 'eventos:transporte_viaje_eventos(*)')
    .eq('id', viajeId).maybeSingle();
  check(error);
  if (!data) return null;
  const viaje = normalizar(data);
  viaje.inspeccion = Array.isArray(data.inspeccion) ? data.inspeccion[0] || null : data.inspeccion || null;
  viaje.hitos = (data.hitos || []).sort((a, b) => new Date(a.ocurrido_at) - new Date(b.ocurrido_at));
  viaje.gastos = (data.gastos || []).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  viaje.eventos = (data.eventos || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return viaje;
}

// Hitos, inspección y gastos de un viaje (para el detalle en Operaciones).
export async function obtenerOperacionViaje(sb, viajeId) {
  const [hitos, inspeccion, gastos] = await Promise.all([
    sb.from('transporte_viaje_hitos').select('*').eq('viaje_id', viajeId).order('ocurrido_at'),
    sb.from('transporte_viaje_inspecciones').select('*').eq('viaje_id', viajeId).maybeSingle(),
    sb.from('transporte_viaje_gastos').select('*').eq('viaje_id', viajeId).order('fecha'),
  ]);
  check(hitos.error); check(inspeccion.error); check(gastos.error);
  return { hitos: hitos.data || [], inspeccion: inspeccion.data || null, gastos: gastos.data || [] };
}

// Viajes del conductor: los suyos si su usuario está vinculado a un conductor; si no, los de la
// empresa que puede ver (como hacía la vista anterior de rutas).
export async function listarViajesConductor(sb, empresaId, userId) {
  const hoy = hoyLima();
  const { data: propios, error: e1 } = await sb.from('conductores_transporte')
    .select('id,nombre').eq('empresa_id', empresaId).eq('usuario_id', userId).eq('activo', true);
  check(e1);
  const ids = (propios || []).map(c => c.id);
  let query = sb.from('transporte_viajes').select(VIAJE_LISTA).eq('empresa_id', empresaId)
    .gte('fecha_programada', inicioDiaLima(sumarDias(hoy, -30))).lt('fecha_programada', inicioDiaLima(sumarDias(hoy, 1)))
    .in('estado', ['programado', 'despachado', 'en_ruta', 'con_incidente', 'entregado']);
  if (ids.length) query = query.in('conductor_id', ids);
  const { data, error } = await query.order('fecha_programada');
  check(error);
  const viajes = (data || []).map(normalizar)
    .filter(v => v.estado !== 'entregado' || fechaLima(v.fecha_programada) === hoy);
  return { viajes, conductores: propios || [], vinculado: ids.length > 0 };
}

export async function listarPedidosRuta(sb, empresaId, estados = ['pendiente']) {
  const { data, error } = await sb.from('transporte_pedidos_ruta').select('*')
    .eq('empresa_id', empresaId).in('estado', estados)
    .order('fecha_requerida', { ascending: true, nullsFirst: false }).order('created_at');
  check(error);
  return data || [];
}

export async function pedidoActivoDeDocumento(sb, { ocTransitoId, guiaId }) {
  let query = sb.from('transporte_pedidos_ruta').select('*,viaje:transporte_viajes(id,codigo,estado,fecha_programada)')
    .in('estado', ['pendiente', 'asignado', 'completado'])
    .order('created_at', { ascending: false }).limit(1);
  query = ocTransitoId ? query.eq('oc_transito_id', ocTransitoId) : query.eq('guia_remision_id', guiaId);
  const { data, error } = await query;
  check(error);
  return data?.[0] || null;
}

export const crearPedidoRuta = (sb, empresaId, datos) =>
  rpc(sb, 'transporte_pedido_ruta_crear', { p_empresa_id: empresaId, p_datos: datos });
export const retirarPedidoRuta = (sb, pedidoId) => rpc(sb, 'transporte_pedido_ruta_retirar', { p_pedido_id: pedidoId });

export const guardarRutaLogistica = (sb, empresaId, viajeId, datos, paradas, programar = false) =>
  rpc(sb, 'transporte_ruta_logistica_guardar', {
    p_empresa_id: empresaId, p_viaje_id: viajeId || null, p_datos: datos, p_paradas: paradas, p_programar: programar,
  });
export const agregarPedidosARuta = (sb, viajeId, pedidoIds) =>
  rpc(sb, 'transporte_ruta_agregar_pedidos', { p_viaje_id: viajeId, p_pedido_ids: pedidoIds });

export const iniciarViaje = (sb, viajeId, datos = {}) => rpc(sb, 'transporte_viaje_iniciar', { p_viaje_id: viajeId, p_datos: datos });
export const registrarHito = (sb, viajeId, hito, datos = {}) =>
  rpc(sb, 'transporte_viaje_hito_registrar', { p_viaje_id: viajeId, p_hito: hito, p_datos: datos });
export const marcarLlegada = (sb, paradaId, datos = {}) => rpc(sb, 'transporte_parada_llegada', { p_parada_id: paradaId, p_datos: datos });
export const completarParada = (sb, paradaId, datos) => rpc(sb, 'transporte_parada_completar', { p_parada_id: paradaId, p_datos: datos });
export const terminarRutaLogistica = (sb, viajeId, datos = {}) =>
  rpc(sb, 'transporte_viaje_terminar_logistica', { p_viaje_id: viajeId, p_datos: datos });
export const agregarParadaLibre = (sb, viajeId, datos) => rpc(sb, 'transporte_parada_libre_agregar', { p_viaje_id: viajeId, p_datos: datos });
export const registrarInspeccion = (sb, viajeId, datos) => rpc(sb, 'transporte_viaje_inspeccion_registrar', { p_viaje_id: viajeId, p_datos: datos });
export const autorizarSalida = (sb, viajeId, nota) => rpc(sb, 'transporte_viaje_autorizar_salida', { p_viaje_id: viajeId, p_nota: nota });
export const registrarGasto = (sb, viajeId, datos) => rpc(sb, 'transporte_viaje_gasto_registrar', { p_viaje_id: viajeId, p_datos: datos });
export const reportarIncidente = (sb, viajeId, datos) => rpc(sb, 'transporte_viaje_incidente_reportar', { p_viaje_id: viajeId, p_datos: datos });
export const registrarLectura = (sb, viajeId, datos) => rpc(sb, 'transporte_viaje_lectura_registrar', { p_viaje_id: viajeId, p_datos: datos });
export const continuarViaje = (sb, viajeId, nota) =>
  rpc(sb, 'transporte_viaje_cambiar_estado', { p_viaje_id: viajeId, p_estado_nuevo: 'en_ruta', p_nota: nota || 'Continúa la ruta' });

export async function listarUsuariosEmpresa(sb, empresaId) {
  const { data, error } = await sb.rpc('transporte_usuarios_empresa', { p_empresa_id: empresaId });
  check(error);
  return data || [];
}

// Para el PDF: convierte una URL (firma o foto) en data URL; si falla devuelve null.
export async function imagenComoDataUrl(url) {
  if (!url) return null;
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();
    return await new Promise(resolve => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
