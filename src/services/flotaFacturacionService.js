import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function liquidacionesPorFacturar(empresaId) {
  const sb = await getSupabaseClient();
  const { data, error } = await sb.rpc('flota_liquidaciones_por_facturar', { p_empresa_id: empresaId });
  if (error) throw error;
  return data || [];
}

export async function facturarLiquidacion(liquidacionId, lineaIds, datos) {
  const sb = await getSupabaseClient();
  const { data, error } = await sb.rpc('flota_facturar_liquidacion', { p_liquidacion_id: liquidacionId, p_linea_ids: lineaIds, p_datos: datos });
  if (error) throw error;
  return data;
}
