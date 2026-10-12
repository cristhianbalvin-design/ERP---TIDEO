import { getSupabaseClient } from '../lib/supabaseClient.js';

async function ejecutarRpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) throw new Error(error.message || 'No se pudo completar el movimiento.');
  return data;
}

export function registrarMovimientoManual({ empresa_id, accion, motivo, material_id, almacen_id, ubicacion_id, sociedad_id, cantidad, costo_unitario = null, moneda = 'PEN', lote = null, serie = null, vencimiento = null, nro_documento = null, observacion = null }) {
  const opcional = valor => typeof valor === 'string' ? valor.trim() || null : valor ?? null;
  return ejecutarRpc('wms_registrar_movimiento_manual', {
    p_empresa_id: empresa_id, p_accion: accion, p_motivo: motivo, p_material_id: material_id,
    p_almacen_id: almacen_id, p_ubicacion_id: ubicacion_id, p_sociedad_id: sociedad_id,
    p_cantidad: cantidad, p_costo_unitario: costo_unitario, p_moneda: String(moneda ?? '').trim() || 'PEN',
    p_lote: opcional(lote), p_serie: opcional(serie), p_vencimiento: opcional(vencimiento),
    p_nro_documento: opcional(nro_documento), p_observacion: opcional(observacion),
  });
}

export function anularMovimiento({ empresa_id, kardex_id, motivo }) {
  return ejecutarRpc('wms_anular_movimiento', { p_empresa_id: empresa_id, p_kardex_id: kardex_id, p_motivo: motivo });
}

export function transferirStock({ empresa_id, stock_origen_id, almacen_destino_id, ubicacion_destino_id, cantidad, observacion = null }) {
  return ejecutarRpc('wms_transferir_stock', {
    p_empresa_id: empresa_id, p_stock_origen_id: stock_origen_id,
    p_almacen_destino_id: almacen_destino_id, p_ubicacion_destino_id: ubicacion_destino_id,
    p_cantidad: cantidad, p_observacion: typeof observacion === 'string' ? observacion.trim() || null : observacion ?? null,
  });
}

export function liberarCuarentena({ empresa_id, stock_origen_id, almacen_destino_id, ubicacion_destino_id, cantidad, motivo, observacion = null }) {
  const nota = typeof observacion === 'string' ? observacion.trim() || null : observacion ?? null;
  return ejecutarRpc('wms_liberar_cuarentena', {
    p_empresa_id: empresa_id, p_stock_origen_id: stock_origen_id,
    p_almacen_destino_id: almacen_destino_id, p_ubicacion_destino_id: ubicacion_destino_id,
    p_cantidad: cantidad, p_motivo: motivo, p_observacion: nota,
  });
}
