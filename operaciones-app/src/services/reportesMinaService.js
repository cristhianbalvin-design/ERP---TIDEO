import { getSupabaseClient } from '../lib/supabaseClient.js';

async function ejecutarRpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) {
    const fallo = new Error(error.message || 'No se pudo completar la acción sobre el reporte de mina.');
    fallo.code = error.code;
    throw fallo;
  }
  return data;
}

export function listarReportesMina({ empresa_id, sociedad_id = null }) {
  return ejecutarRpc('ops_reportes_mina_listar', { p_empresa_id: empresa_id, p_sociedad_id: sociedad_id });
}

export function contextoReporteMina({ empresa_id, sociedad_id = null }) {
  return ejecutarRpc('ops_reportes_mina_contexto', { p_empresa_id: empresa_id, p_sociedad_id: sociedad_id });
}

export function guardarReporteMina({ empresa_id, reporte, enviar = false }) {
  return ejecutarRpc('ops_guardar_reporte_mina', { p_empresa_id: empresa_id, p_reporte: reporte, p_enviar: enviar });
}

export function revisarReporteMina({ empresa_id, parte_id, accion, observacion = null }) {
  return ejecutarRpc('ops_revisar_reporte_mina', {
    p_empresa_id: empresa_id, p_parte_id: parte_id, p_accion: accion, p_observacion: observacion,
  });
}

export function buscarMaterialesMina({ empresa_id, sociedad_id = null, busqueda }) {
  return ejecutarRpc('buscar_materiales_ot', {
    p_empresa_id: empresa_id, p_sociedad_id: sociedad_id, p_busqueda: busqueda, p_limite: 20,
  });
}
