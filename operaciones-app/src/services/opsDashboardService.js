import { getSupabaseClient } from '../lib/supabaseClient.js';

export async function cargarDashboardGerencial(empresaId, sociedadId, desde, hasta) {
  if (!empresaId) throw new Error('No se pudo identificar la empresa operativa.');
  const { data, error } = await getSupabaseClient().rpc('ops_dashboard_gerencial', {
    p_empresa_id: empresaId, p_sociedad_id: sociedadId || null, p_desde: desde, p_hasta: hasta,
  });
  if (error) throw new Error(`No se pudo cargar el dashboard: ${error.message || 'error desconocido'}`);
  return data;
}
