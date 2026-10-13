import { getSupabaseClient } from '../lib/supabaseClient.js';

async function ejecutarRpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) {
    const fallo = new Error(error.message || 'No se pudo completar la acción sobre la reserva.');
    fallo.code = error.code;
    throw fallo;
  }
  return data;
}

export function listarReservasOT({ empresa_id, ot_id = null }) {
  return ejecutarRpc('wms_reservas_ot', { p_empresa_id: empresa_id, p_ot_id: ot_id });
}

export function pedirRepuestosParte({ empresa_id, ot_id, parte_id, lineas }) {
  return ejecutarRpc('wms_pedir_repuestos_parte', {
    p_empresa_id: empresa_id, p_ot_id: ot_id, p_parte_id: parte_id, p_lineas: lineas,
  });
}

export function despacharReservaOT({ empresa_id, ot_id, lineas, recibe_en_taller = null, observacion = null }) {
  return ejecutarRpc('wms_despachar_reserva_ot', {
    p_empresa_id: empresa_id, p_ot_id: ot_id, p_lineas: lineas,
    p_recibe_en_taller: recibe_en_taller, p_observacion: observacion,
  });
}

export function liberarReservaOT({ empresa_id, ot_segmento_repuesto_id, cantidad, motivo, observacion = null }) {
  return ejecutarRpc('wms_liberar_reserva_ot', {
    p_empresa_id: empresa_id, p_ot_segmento_repuesto_id: ot_segmento_repuesto_id, p_cantidad: cantidad,
    p_motivo: motivo, p_observacion: observacion,
  });
}

export function revertirDespachoOT({ empresa_id, ot_id, lineas, motivo, observacion = null }) {
  return ejecutarRpc('wms_revertir_despacho_ot', {
    p_empresa_id: empresa_id, p_ot_id: ot_id, p_lineas: lineas,
    p_motivo: motivo, p_observacion: observacion,
  });
}

export function conciliarCierreOT({ empresa_id, ot_id }) {
  return ejecutarRpc('wms_conciliar_cierre_ot', { p_empresa_id: empresa_id, p_ot_id: ot_id });
}
