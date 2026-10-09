import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function cargarMapaUbicaciones({ empresaId, sociedadId, vistaConsolidada, sociedadesIdsAlcance }) {
  const supabase = getSupabaseClient();
  const almacenesQuery = supabase.from('almacenes').select('id,empresa_id,codigo,nombre,estado')
    .eq('empresa_id', empresaId).eq('estado', 'activo').order('nombre');
  const ubicacionesQuery = supabase.from('ubicaciones')
    .select('id,empresa_id,almacen_id,codigo,nombre,tipo,padre_id,es_general,activo')
    .eq('empresa_id', empresaId).eq('activo', true).order('codigo');
  const [almacenesResultado, ubicacionesResultado] = await Promise.all([almacenesQuery, ubicacionesQuery]);
  if (almacenesResultado.error) throw almacenesResultado.error;
  if (ubicacionesResultado.error) throw ubicacionesResultado.error;

  const stock = [];
  for (let inicio = 0; ; inicio += 1000) {
    let consulta = supabase.from('stock')
      .select('empresa_id,material_id,almacen_id,ubicacion_id,lote,serie,sociedad_id,fisico')
      .eq('empresa_id', empresaId).gt('fisico', 0)
      .order('material_id', { ascending: true }).order('almacen_id', { ascending: true })
      .order('ubicacion_id', { ascending: true }).order('lote', { ascending: true })
      .order('serie', { ascending: true }).order('sociedad_id', { ascending: true })
      .range(inicio, inicio + 999);
    if (sociedadId && !vistaConsolidada) consulta = consulta.eq('sociedad_id', sociedadId);
    else if ((vistaConsolidada || !sociedadId) && Array.isArray(sociedadesIdsAlcance) && sociedadesIdsAlcance.length) {
      consulta = consulta.in('sociedad_id', sociedadesIdsAlcance);
    }
    const { data, error } = await consulta;
    if (error) throw error;
    const pagina = data || [];
    stock.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return { almacenes: almacenesResultado.data || [], ubicaciones: ubicacionesResultado.data || [], stock };
}
