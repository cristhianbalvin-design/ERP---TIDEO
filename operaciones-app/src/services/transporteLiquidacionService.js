// Liquidación de transporte comercial y rendición de gastos del conductor.
import { getSupabaseClient } from '../lib/supabaseClient.js';

const check = error => { if (error) throw new Error(error.message || 'No se pudo completar la operación.'); };
const VIAJE = 'id,codigo,estado,tipo_viaje,cuenta_id,os_cliente_id,fecha_programada,origen_nombre,destino_nombre,'
  + 'carga_descripcion,peso_toneladas,ingreso_estimado,moneda,cantidad_facturable,tarifa_unitaria,transportista_id,conductor_id,'
  + 'cuenta:cuentas(id,razon_social,nombre_comercial),os:os_clientes(id,numero),vehiculo:vehiculos_transporte(placa,tipo),'
  + 'conductor:conductores_transporte(id,nombre),transportista:transportistas(id,razon_social,nombre_comercial,tipo_operador)';

async function rpc(nombre, args) {
  const { data, error } = await getSupabaseClient().rpc(nombre, args);
  check(error);
  return data;
}

export async function consultarPermisosLiquidacion(empresaId) {
  const sb = getSupabaseClient();
  const acciones = ['ver', 'crear', 'editar', 'aprobar', 'anular'];
  const res = await Promise.all(acciones.map(accion => sb.rpc('usuario_puede', {
    target_empresa_id: empresaId, target_pantalla: 'transporte_comercial', target_accion: accion })));
  res.forEach(r => check(r.error));
  return Object.fromEntries(acciones.map((a, i) => [a, Boolean(res[i].data)]));
}

export async function listarLiquidaciones(empresaId) {
  const { data, error } = await getSupabaseClient().from('transporte_liquidaciones')
    .select('*,cuenta:cuentas(id,razon_social,nombre_comercial),viajes:transporte_liquidacion_viajes(id,activo)')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false });
  check(error);
  return (data || []).map(l => ({ ...l, n_viajes: (l.viajes || []).filter(v => v.activo).length }));
}

export async function obtenerLiquidacionActivaViaje(viajeId) {
  const { data, error } = await getSupabaseClient().from('transporte_liquidacion_viajes')
    .select('liquidacion_id').eq('viaje_id', viajeId).eq('activo', true).maybeSingle();
  check(error);
  return data?.liquidacion_id || null;
}

// Viajes comerciales entregados que aún no están en una liquidación.
export async function listarPorLiquidar(empresaId) {
  const { data, error } = await getSupabaseClient().from('transporte_viajes').select(VIAJE)
    .eq('empresa_id', empresaId).eq('tipo_viaje', 'comercial').eq('estado', 'entregado')
    .order('fecha_programada', { ascending: true });
  check(error);
  return data || [];
}

async function facturasDeOs(osIds) {
  if (!osIds.length) return {};
  const { data, error } = await getSupabaseClient().from('facturas')
    .select('id,numero,total,moneda,estado,os_cliente_id').in('os_cliente_id', osIds).neq('estado', 'anulada');
  check(error);
  return (data || []).reduce((acc, f) => { (acc[f.os_cliente_id] ||= []).push(f); return acc; }, {});
}

export async function obtenerLiquidacion(empresaId, id) {
  const sb = getSupabaseClient();
  const { data: liq, error } = await sb.from('transporte_liquidaciones')
    .select('*,cuenta:cuentas(id,razon_social,nombre_comercial,ruc)').eq('empresa_id', empresaId).eq('id', id).maybeSingle();
  check(error);
  if (!liq) return null;
  const { data: lineas, error: e2 } = await sb.from('transporte_liquidacion_viajes')
    .select(`*,cargos:transporte_liquidacion_cargos(*),viaje:transporte_viajes(${VIAJE})`)
    .eq('liquidacion_id', id).eq('activo', true);
  check(e2);
  const viajeIds = (lineas || []).map(l => l.viaje_id);
  const [gastos, rendiciones, facturas] = await Promise.all([
    viajeIds.length ? sb.from('transporte_viaje_gastos').select('*').in('viaje_id', viajeIds).order('fecha') : { data: [] },
    viajeIds.length ? sb.from('transporte_rendiciones').select('*').in('viaje_id', viajeIds) : { data: [] },
    facturasDeOs([...new Set((lineas || []).map(l => l.viaje?.os_cliente_id).filter(Boolean))]),
  ]);
  check(gastos.error); check(rendiciones.error);
  const ordenadas = (lineas || []).sort((a, b) => String(a.viaje?.fecha_programada).localeCompare(String(b.viaje?.fecha_programada)));
  return {
    ...liq,
    lineas: ordenadas.map(l => ({
      ...l,
      cargos: (l.cargos || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
      gastos: (gastos.data || []).filter(g => g.viaje_id === l.viaje_id),
      rendicion: (rendiciones.data || []).find(r => r.viaje_id === l.viaje_id) || null,
      facturasOs: facturas[l.viaje?.os_cliente_id] || [],
    })),
  };
}

export async function listarRendiciones(empresaId) {
  const { data, error } = await getSupabaseClient().from('transporte_rendiciones')
    .select('*,viaje:transporte_viajes(id,codigo,estado,tipo_viaje,fecha_programada,origen_nombre,destino_nombre,conductor:conductores_transporte(nombre))')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false });
  check(error);
  const ids = (data || []).map(r => r.viaje_id);
  let pendientes = {};
  if (ids.length) {
    const { data: gs, error: e2 } = await getSupabaseClient().from('transporte_viaje_gastos')
      .select('viaje_id,estado').in('viaje_id', ids);
    check(e2);
    pendientes = (gs || []).reduce((acc, g) => {
      acc[g.viaje_id] ||= { total: 0, pendientes: 0 };
      acc[g.viaje_id].total += 1;
      if (g.estado === 'pendiente') acc[g.viaje_id].pendientes += 1;
      return acc;
    }, {});
  }
  return (data || []).map(r => ({ ...r, n_gastos: pendientes[r.viaje_id]?.total || 0, n_pendientes: pendientes[r.viaje_id]?.pendientes || 0 }));
}

export async function obtenerRendicion(empresaId, viajeId) {
  const sb = getSupabaseClient();
  const [ren, viaje, gastos] = await Promise.all([
    sb.from('transporte_rendiciones').select('*').eq('empresa_id', empresaId).eq('viaje_id', viajeId).maybeSingle(),
    sb.from('transporte_viajes').select(VIAJE).eq('empresa_id', empresaId).eq('id', viajeId).maybeSingle(),
    sb.from('transporte_viaje_gastos').select('*').eq('viaje_id', viajeId).order('fecha'),
  ]);
  check(ren.error); check(viaje.error); check(gastos.error);
  if (!viaje.data) return null;
  return { rendicion: ren.data, viaje: viaje.data, gastos: gastos.data || [] };
}

export const crearLiquidacion = (empresaId, cuentaId, desde, hasta, viajeIds) =>
  rpc('transporte_liquidacion_crear', { p_empresa_id: empresaId, p_cuenta_id: cuentaId, p_desde: desde, p_hasta: hasta, p_viaje_ids: viajeIds });
export const agregarViajesLiquidacion = (liqId, viajeIds) =>
  rpc('transporte_liquidacion_agregar_viajes', { p_liq_id: liqId, p_viaje_ids: viajeIds });
export const quitarViajeLiquidacion = (liqId, viajeId) => rpc('transporte_liquidacion_quitar_viaje', { p_liq_id: liqId, p_viaje_id: viajeId });
export const guardarCargo = (lvId, cargoId, tipo, descripcion, monto) => rpc('transporte_liquidacion_cargo_guardar',
  { p_lv_id: lvId, p_cargo_id: cargoId || null, p_tipo: tipo, p_descripcion: descripcion, p_monto: monto });
export const eliminarCargo = cargoId => rpc('transporte_liquidacion_cargo_eliminar', { p_cargo_id: cargoId });
export const ajustarEspera = (lvId, minutos, precioHora, motivo) => rpc('transporte_liquidacion_espera_ajustar',
  { p_lv_id: lvId, p_minutos: minutos, p_precio_hora: precioHora, p_motivo: motivo });
export const guardarCostoTercero = (lvId, monto) => rpc('transporte_liquidacion_costo_tercero', { p_lv_id: lvId, p_monto: monto });
export const accionLiquidacion = (liqId, accion, datos = {}) =>
  rpc('transporte_liquidacion_accion', { p_liq_id: liqId, p_accion: accion, p_datos: datos });
export const guardarFondo = (viajeId, monto, referencia) =>
  rpc('transporte_rendicion_fondo', { p_viaje_id: viajeId, p_monto: monto, p_referencia: referencia });
export const revisarGasto = (gastoId, aprobar, motivo) =>
  rpc('transporte_gasto_revisar', { p_gasto_id: gastoId, p_aprobar: aprobar, p_motivo: motivo || null });
export const accionRendicion = (viajeId, accion) => rpc('transporte_rendicion_accion', { p_viaje_id: viajeId, p_accion: accion });
