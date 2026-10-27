import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function listarAlmacenesGemelo(empresaId) {
  const supabase = getSupabaseClient();
  const [almacenes, planos] = await Promise.all([
    supabase.from('almacenes').select('id,codigo,nombre,clase,estado').eq('empresa_id', empresaId).eq('estado', 'activo').order('codigo'),
    supabase.from('almacen_planos').select('almacen_id,version,updated_at').eq('empresa_id', empresaId),
  ]);
  if (almacenes.error) throw almacenes.error;
  if (planos.error) throw planos.error;
  const conPlano = new Map((planos.data || []).map(p => [p.almacen_id, p]));
  return (almacenes.data || []).map(a => ({ ...a, plano: conPlano.get(a.id) || null }));
}

/** Plano, ubicaciones, stock con materiales, últimos movimientos y movimientos de los últimos 14 días del almacén. */
export async function cargarGemelo({ empresaId, almacenId, sociedadId, vistaConsolidada, sociedadesIdsAlcance }) {
  const supabase = getSupabaseClient();
  const desde = new Date(Date.now() - 15 * 86400000).toISOString();
  const alcance = consulta => {
    if (sociedadId && !vistaConsolidada) return consulta.eq('sociedad_id', sociedadId);
    if (Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) return consulta.in('sociedad_id', sociedadesIdsAlcance);
    return consulta;
  };
  const [plano, ubicaciones, ultimos, movimientos] = await Promise.all([
    supabase.from('almacen_planos').select('almacen_id,layout,version,updated_at').eq('empresa_id', empresaId).eq('almacen_id', almacenId).maybeSingle(),
    supabase.from('ubicaciones').select('id,codigo,nombre,tipo,padre_id,es_general,activo,uso,origen_plano').eq('empresa_id', empresaId).eq('almacen_id', almacenId),
    supabase.rpc('wms_gemelo_ultimos_movimientos', { p_empresa_id: empresaId, p_almacen_id: almacenId }),
    alcance(supabase.from('kardex').select('ubicacion_id,material_id,tipo,cantidad,fecha')
      .eq('empresa_id', empresaId).eq('almacen_id', almacenId).eq('anulado', false).gte('fecha', desde).not('ubicacion_id', 'is', null)
      .order('fecha', { ascending: false }).limit(5000)),
  ]);
  for (const r of [plano, ubicaciones, ultimos, movimientos]) if (r.error) throw r.error;

  const stock = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await alcance(supabase.from('stock')
      .select('id,material_id,ubicacion_id,sociedad_id,fisico,reservado,materiales(id,codigo,descripcion,unidad,costo_promedio,moneda,stock_minimo,punto_reorden,stock_seguridad)')
      .eq('empresa_id', empresaId).eq('almacen_id', almacenId).or('fisico.gt.0,reservado.gt.0')
      .order('id', { ascending: true }).range(inicio, inicio + 999));
    if (error) throw error;
    stock.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { plano: plano.data || null, ubicaciones: ubicaciones.data || [], ultimos: ultimos.data || [], movimientos: movimientos.data || [], stock };
}

export async function guardarPlanoAlmacen({ empresaId, almacenId, layout, version }) {
  const { data, error } = await getSupabaseClient().rpc('wms_guardar_plano_almacen', {
    p_empresa_id: empresaId, p_almacen_id: almacenId, p_layout: layout, p_version: version || 0,
  });
  if (error) throw error;
  return data;
}
