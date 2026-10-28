import { getSupabaseClient } from '../lib/supabaseClient.js';

async function ejecutarRpc(nombre, parametros) {
  const { data, error } = await getSupabaseClient().rpc(nombre, parametros);
  if (error) {
    const fallo = new Error(error.message || 'No se pudo completar la acción en el almacén.');
    fallo.code = error.code;
    throw fallo;
  }
  return data;
}

async function consultar(promesa, mensaje) {
  const { data, error } = await promesa;
  if (error) {
    const fallo = new Error(error.message || mensaje);
    fallo.code = error.code;
    throw fallo;
  }
  return data;
}

export const MODULOS_WMS_POR_DEFECTO = Object.freeze({
  consumo: true, venta: false, custodia: false, conteos: true, codigos: true, lotes: false, herramientas: false,
});

// Configuración del WMS ------------------------------------------------------
export async function obtenerConfiguracionWms({ empresa_id }) {
  const fila = await consultar(
    getSupabaseClient().from('empresa_wms_config').select('modulos, umbral_aprobacion_ajuste').eq('empresa_id', empresa_id).maybeSingle(),
    'No se pudo leer la configuración del almacén.',
  );
  return {
    modulos: { ...MODULOS_WMS_POR_DEFECTO, ...(fila?.modulos || {}) },
    umbral_aprobacion_ajuste: Number(fila?.umbral_aprobacion_ajuste ?? 500),
  };
}

export function listarAlmacenesWms({ empresa_id }) {
  return consultar(
    getSupabaseClient().from('almacenes').select('id, codigo, nombre, clase, proposito, estado').eq('empresa_id', empresa_id).order('codigo'),
    'No se pudieron leer los almacenes.',
  );
}

export function guardarConfiguracionWms({ empresa_id, modulos, umbral, almacenes = [] }) {
  return ejecutarRpc('wms_guardar_configuracion', {
    p_empresa_id: empresa_id, p_modulos: modulos, p_umbral: umbral, p_almacenes: almacenes,
  });
}

// Despachos ------------------------------------------------------------------
export async function listarColaDespachos({ empresa_id, almacen_id = null }) {
  return (await ejecutarRpc('wms_cola_despachos', { p_empresa_id: empresa_id, p_almacen_id: almacen_id || null })) || [];
}

export function despacharDemanda({ empresa_id, demanda_id, lineas, guia = null }) {
  return ejecutarRpc('wms_despachar_demanda', {
    p_empresa_id: empresa_id, p_demanda_id: demanda_id, p_lineas: lineas, p_guia: guia,
  });
}

export function reintentarReserva({ empresa_id, demanda_id }) {
  return ejecutarRpc('wms_reintentar_reserva', { p_empresa_id: empresa_id, p_demanda_id: demanda_id });
}

// Mínimos y reposición -------------------------------------------------------
export async function listarStockMinimos({ empresa_id, almacen_id = null }) {
  return (await ejecutarRpc('wms_stock_minimos', { p_empresa_id: empresa_id, p_almacen_id: almacen_id || null })) || [];
}

export function guardarParametrosStock({ empresa_id, filas }) {
  return ejecutarRpc('wms_guardar_parametros', { p_empresa_id: empresa_id, p_filas: filas });
}

export function listarCentrosCostoActivos({ empresa_id }) {
  return consultar(
    getSupabaseClient().from('centros_costo').select('id, codigo, nombre').eq('empresa_id', empresa_id).eq('estado', 'activo').order('codigo'),
    'No se pudieron leer los centros de costo.',
  );
}

// Conteos --------------------------------------------------------------------
export function listarConteos({ empresa_id }) {
  return consultar(
    getSupabaseClient().from('inventario_conteos')
      .select('id, codigo, nombre, tipo, almacen_id, zona, estado, items, ajustes_generados, creado_por, cerrado_por, cerrado_at, created_at, sociedad_id')
      .eq('empresa_id', empresa_id).order('created_at', { ascending: false }).limit(50),
    'No se pudieron leer los conteos.',
  );
}

export function iniciarConteo({ empresa_id, almacen_id, sociedad_id, tipo, nombre, ubicacion_prefijo = null, clase = null }) {
  return ejecutarRpc('wms_iniciar_conteo', {
    p_empresa_id: empresa_id, p_almacen_id: almacen_id, p_sociedad_id: sociedad_id ?? null, p_tipo: tipo, p_nombre: nombre,
    p_ubicacion_prefijo: ubicacion_prefijo || null, p_clase: clase || null,
  });
}

export function guardarConteo({ empresa_id, conteo_id, contados }) {
  return ejecutarRpc('wms_guardar_conteo', { p_empresa_id: empresa_id, p_conteo_id: conteo_id, p_contados: contados });
}

export function cerrarConteo({ empresa_id, conteo_id }) {
  return ejecutarRpc('wms_cerrar_conteo', { p_empresa_id: empresa_id, p_conteo_id: conteo_id });
}

export function aprobarConteo({ empresa_id, conteo_id, aprobar = true }) {
  return ejecutarRpc('wms_aprobar_conteo', { p_empresa_id: empresa_id, p_conteo_id: conteo_id, p_aprobar: aprobar });
}

// Custodia de terceros -------------------------------------------------------
export async function obtenerResumenCustodia({ empresa_id, almacen_id = null }) {
  const data = await ejecutarRpc('wms_custodia_resumen', { p_empresa_id: empresa_id, p_almacen_id: almacen_id || null });
  return { almacenes: [], clientes: [], libres: [], stock: [], cuentas: [], ...(data || {}) };
}

export function asignarPosicionesCustodia({ empresa_id, almacen_id, cuenta_id, ubicaciones }) {
  return ejecutarRpc('wms_custodia_asignar', {
    p_empresa_id: empresa_id, p_almacen_id: almacen_id, p_cuenta_id: cuenta_id ?? null, p_ubicaciones: ubicaciones,
  });
}

export function guardarTarifaCustodia({ empresa_id, cuenta_id, almacen_id, tarifa_posicion_dia, tarifa_movimiento, moneda = 'PEN' }) {
  return ejecutarRpc('wms_custodia_guardar_tarifa', {
    p_empresa_id: empresa_id, p_cuenta_id: cuenta_id, p_almacen_id: almacen_id,
    p_tarifa_posicion_dia: tarifa_posicion_dia, p_tarifa_movimiento: tarifa_movimiento, p_moneda: moneda,
  });
}

export function registrarIngresoCustodia({ empresa_id, ubicacion_id, material_id, cantidad, sociedad_id, documento = null, observacion = null }) {
  return ejecutarRpc('wms_custodia_ingreso', {
    p_empresa_id: empresa_id, p_ubicacion_id: ubicacion_id, p_material_id: material_id, p_cantidad: cantidad,
    p_sociedad_id: sociedad_id ?? null, p_documento: documento, p_observacion: observacion,
  });
}

export function crearRetiroCustodia({ empresa_id, almacen_id, cuenta_id, sociedad_id, lineas, fecha = null, observacion = null }) {
  return ejecutarRpc('wms_custodia_crear_retiro', {
    p_empresa_id: empresa_id, p_almacen_id: almacen_id, p_cuenta_id: cuenta_id, p_sociedad_id: sociedad_id ?? null,
    p_lineas: lineas, p_fecha: fecha, p_observacion: observacion,
  });
}

export function calcularLiquidacionCustodia({ empresa_id, cuenta_id, almacen_id, desde, hasta }) {
  return ejecutarRpc('wms_custodia_liquidacion', {
    p_empresa_id: empresa_id, p_cuenta_id: cuenta_id, p_almacen_id: almacen_id, p_desde: desde, p_hasta: hasta,
  });
}

export function enviarLiquidacionAVentas({ empresa_id, cuenta_id, almacen_id, desde, hasta, sociedad_id }) {
  return ejecutarRpc('wms_custodia_enviar_ventas', {
    p_empresa_id: empresa_id, p_cuenta_id: cuenta_id, p_almacen_id: almacen_id, p_desde: desde, p_hasta: hasta,
    p_sociedad_id: sociedad_id ?? null,
  });
}

// Vencimientos y lotes -------------------------------------------------------
export async function listarLotes({ empresa_id, almacen_id = null }) {
  return (await ejecutarRpc('wms_lotes', { p_empresa_id: empresa_id, p_almacen_id: almacen_id || null })) || [];
}

export function moverLoteACuarentena({ empresa_id, stock_id, cantidad = null }) {
  return ejecutarRpc('wms_lote_a_cuarentena', { p_empresa_id: empresa_id, p_stock_id: stock_id, p_cantidad: cantidad });
}

// Devoluciones ---------------------------------------------------------------
export async function listarDevoluciones({ empresa_id }) {
  const data = await ejecutarRpc('wms_devoluciones_listar', { p_empresa_id: empresa_id });
  return { devoluciones: [], guias: [], ots: [], ...(data || {}) };
}

export function registrarDevolucion({ empresa_id, origen, referencia_id, motivo, lineas, observacion = null }) {
  return ejecutarRpc('wms_devolucion_registrar', {
    p_empresa_id: empresa_id, p_origen: origen, p_referencia_id: referencia_id, p_motivo: motivo, p_lineas: lineas, p_observacion: observacion,
  });
}

export function cerrarDevolucion({ empresa_id, devolucion_id, lineas }) {
  return ejecutarRpc('wms_devolucion_cerrar', { p_empresa_id: empresa_id, p_devolucion_id: devolucion_id, p_lineas: lineas });
}

// Préstamo de herramientas ---------------------------------------------------
export async function obtenerPrestamos({ empresa_id }) {
  const data = await ejecutarRpc('wms_prestamos_resumen', { p_empresa_id: empresa_id });
  return { prestamos: [], disponibles: [], personal: [], ots: [], ...(data || {}) };
}

export function prestarHerramienta({ empresa_id, stock_id, cantidad, personal_id, fecha_devolucion, ot_id = null, observacion = null }) {
  return ejecutarRpc('wms_prestar', {
    p_empresa_id: empresa_id, p_stock_id: stock_id, p_cantidad: cantidad, p_personal_id: personal_id,
    p_fecha_devolucion: fecha_devolucion, p_ot_id: ot_id || null, p_observacion: observacion,
  });
}

export function recibirHerramienta({ empresa_id, prestamo_id, cantidad, estado, observacion = null }) {
  return ejecutarRpc('wms_recibir_prestamo', {
    p_empresa_id: empresa_id, p_prestamo_id: prestamo_id, p_cantidad: cantidad, p_estado: estado, p_observacion: observacion,
  });
}

// Etiquetas ------------------------------------------------------------------
export function listarUbicacionesEtiqueta({ empresa_id, almacen_id }) {
  return consultar(
    getSupabaseClient().from('ubicaciones').select('id, codigo, nombre, uso, es_general').eq('empresa_id', empresa_id).eq('almacen_id', almacen_id).order('codigo'),
    'No se pudieron leer las ubicaciones.',
  );
}

export function buscarMaterialesEtiqueta({ empresa_id, texto = '' }) {
  let q = getSupabaseClient().from('materiales').select('id, codigo, descripcion, unidad, codigo_barras').eq('empresa_id', empresa_id).order('codigo').limit(200);
  const termino = texto.trim().replace(/[%_,()]/g, ' ');
  if (termino) q = q.or(`codigo.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
  return consultar(q, 'No se pudieron leer los materiales.');
}

// Reporte valorizado y ABC ---------------------------------------------------
export async function obtenerReporteValorizado({ empresa_id, almacen_id = null }) {
  const data = await ejecutarRpc('wms_reporte_valorizado', { p_empresa_id: empresa_id, p_almacen_id: almacen_id || null });
  return { materiales: [], almacenes: [], ...(data || {}) };
}
