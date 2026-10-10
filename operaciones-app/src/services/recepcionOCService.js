import { getSupabaseClient } from '../lib/supabaseClient.js';
import { ESTADOS_OC_RECEPCIONABLES } from '../zahory-mock/pages/recepcionOCLogic.js';

export async function cargarRecepcionesOC({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance }) {
  const supabase = getSupabaseClient();
  let consulta = supabase.from('ordenes_compra')
    .select('id,codigo,proveedor_id,estado,items,porcentaje_recibido,fecha_emision,sociedad_id,moneda')
    .eq('empresa_id', empresaId)
    .in('estado', ESTADOS_OC_RECEPCIONABLES)
    .order('fecha_emision', { ascending: false });
  if (sociedadId && !vistaConsolidada) consulta = consulta.eq('sociedad_id', sociedadId);
  else if ((vistaConsolidada || !sociedadId) && Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
    consulta = consulta.in('sociedad_id', sociedadesIdsAlcance);
  }
  const [{ data: ordenes, error: errorOrdenes }, { data: almacenes, error: errorAlmacenes }] = await Promise.all([
    consulta,
    supabase.from('almacenes').select('id,empresa_id,codigo,nombre,estado').eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre'),
  ]);
  if (errorOrdenes) throw errorOrdenes;
  if (errorAlmacenes) throw errorAlmacenes;
  const ordenesIds = [...new Set((ordenes || []).map(oc => oc.id).filter(Boolean))];
  const lotesRecepciones = [];
  for (let inicio = 0; inicio < ordenesIds.length; inicio += 100) {
    lotesRecepciones.push(ordenesIds.slice(inicio, inicio + 100));
  }
  const resultadosRecepciones = await Promise.all(lotesRecepciones.map(idsLote => supabase.from('recepciones')
    .select('orden_compra_id,estado,items_recibidos').eq('empresa_id', empresaId).in('orden_compra_id', idsLote)));
  const recepciones = [];
  resultadosRecepciones.forEach(({ data, error }) => {
    if (error) throw error;
    recepciones.push(...(data || []));
  });
  const ids = [...new Set((ordenes || []).map(oc => oc.proveedor_id).filter(Boolean))];
  let proveedores = [];
  if (ids.length) {
    const { data, error } = await supabase.from('proveedores').select('id,razon_social,nombre_comercial').eq('empresa_id', empresaId).in('id', ids);
    if (error) throw error;
    proveedores = data || [];
  }
  return { ordenes: ordenes || [], almacenes: almacenes || [], recepciones, proveedores };
}

export async function cargarUbicacionesAlmacen(empresaId, almacenId) {
  const { data, error } = await getSupabaseClient().from('ubicaciones')
    .select('id,empresa_id,almacen_id,codigo,nombre,tipo,padre_id,es_general,activo,uso')
    .eq('empresa_id', empresaId).eq('almacen_id', almacenId).eq('activo', true).order('codigo');
  if (error) throw error;
  return data || [];
}

export async function registrarRecepcionOC({ empresaId, ordenCompraId, almacenId, lineas, observaciones = null }) {
  const p_items = lineas.map(({ idx, recibido, ubicacion_id }) => ({ idx, recibido, ...(ubicacion_id ? { ubicacion_id } : {}) }));
  const { data, error } = await getSupabaseClient().rpc('registrar_recepcion_oc_fisica', {
    p_empresa_id: empresaId,
    p_orden_compra_id: ordenCompraId,
    p_almacen_id: almacenId,
    p_items,
    p_observaciones: observaciones || null,
  });
  if (error) throw error;
  return data;
}
