export const MOTIVOS_MOVIMIENTO = Object.freeze({
  entrada: { saldo_inicial: 'Saldo inicial', ajuste_positivo: 'Ajuste positivo', devolucion_ot: 'Devolución de OT', compra_directa_sin_oc: 'Compra directa sin OC' },
  salida: { devolucion_proveedor: 'Devolución a proveedor', merma: 'Merma', robo: 'Robo o pérdida', error_ingreso: 'Error de ingreso' },
  ajuste: { ajuste_conteo: 'Ajuste por conteo', ajuste_manual: 'Ajuste manual' },
});

const ETIQUETAS_MOTIVOS_LECTURA = Object.freeze({
  recepcion_oc: 'Recepción de OC',
  consumo_ot: 'Consumo de OT',
  despacho_guia: 'Despacho por guía',
  transferencia: 'Transferencia',
  oc_pendiente_factura: 'Ingreso pendiente de factura',
  anulacion_entrada: 'Anulación de entrada',
  anulacion_salida: 'Anulación de salida',
});

export function etiquetaMotivoMovimiento(motivo) {
  if (!motivo) return '';
  const etiqueta = Object.values(MOTIVOS_MOVIMIENTO).find(motivos => motivos[motivo])?.[motivo]
    || ETIQUETAS_MOTIVOS_LECTURA[motivo];
  return etiqueta || String(motivo).replace(/_/g, ' ').replace(/^./u, letra => letra.toLocaleUpperCase('es-PE'));
}

const cantidad = value => Number(String(value ?? '').replace(',', '.'));
const texto = value => String(value ?? '').trim();

export function calcularDiferenciaAjuste(conteo, fisico) {
  const contado = cantidad(conteo);
  return Number.isFinite(contado) ? contado - cantidad(fisico) : null;
}

export function validarMovimiento(form, { material, stock = [], ubicacion } = {}) {
  const errores = {};
  if (!material) { errores.material_id = 'Elige el material.'; return errores; }
  const esEntrada = form.accion === 'entrada';
  const esAjuste = form.accion === 'ajuste';
  const motivo = form.motivo;
  if (!MOTIVOS_MOVIMIENTO[form.accion]?.[motivo]) errores.motivo = 'Elige un motivo válido.';
  if (!form.almacen_id) errores.almacen_id = 'Elige el almacén.';
  if (!form.ubicacion_id) errores.ubicacion_id = esEntrada ? 'Elige la ubicación de destino.' : 'Elige la ubicación y el lote.';
  if (esEntrada) {
    if (!(cantidad(form.cantidad) > 0)) errores.cantidad = 'La cantidad debe ser mayor a cero.';
    if (material.tipo_control === 'lote' && !texto(form.lote)) errores.lote = 'Este material se controla por lote: indica el número de lote.';
    if (material.tipo_control === 'serie' && !texto(form.serie)) errores.serie = 'Este material se controla por serie: indica el número de serie.';
    if (material.tipo_control === 'serie' && cantidad(form.cantidad) !== 1) errores.cantidad = 'Para materiales controlados por serie, la cantidad debe ser 1.';
    if (['saldo_inicial', 'compra_directa_sin_oc'].includes(motivo) && !(cantidad(form.costo_unitario) > 0)) errores.costo_unitario = 'Indica el costo unitario (mayor a 0).';
    if (motivo === 'compra_directa_sin_oc' && !texto(form.nro_documento)) errores.nro_documento = 'Indica el número de documento de la compra.';
  } else {
    const fila = stock.find(item => item.id === form.stock_id) || stock.find(item => item.ubicacion_id === form.ubicacion_id && item.almacen_id === form.almacen_id && (item.lote || '') === (form.lote || '') && (item.serie || '') === (form.serie || ''));
    if (!fila) errores.stock_id = 'Elige la ubicación y el lote.';
    if (esAjuste) {
      const conteo = cantidad(form.conteo);
      if (form.conteo === '' || !Number.isFinite(conteo) || conteo < 0) errores.conteo = 'Indica la cantidad contada (0 o más).';
      else if (conteo === cantidad(fila?.fisico ?? fila?.disponible)) errores.conteo = 'Sin diferencia: no hay nada que ajustar.';
      else if (conteo < cantidad(fila?.reservado)) errores.conteo = `Hay ${fila.reservado} reservados en esta ubicación: no puedes contar menos. Libera primero las reservas.`;
    } else {
      if (!(cantidad(form.cantidad) > 0)) errores.cantidad = 'La cantidad debe ser mayor a cero.';
      const disponible = Math.max(cantidad(fila?.disponible ?? (cantidad(fila?.fisico) - cantidad(fila?.reservado))), 0);
      if (cantidad(form.cantidad) > disponible) errores.cantidad = `Solo hay ${disponible} ${material.unidad || 'unidades'} libres en esta ubicación${fila?.reservado ? ` (${fila.reservado} reservados)` : ''}.`;
      if (material.tipo_control === 'serie' && cantidad(form.cantidad) !== 1) errores.cantidad = 'Para materiales controlados por serie, la cantidad debe ser 1.';
      if (material.tipo_control === 'serie' && !texto(form.serie || fila?.serie)) errores.serie = 'Este material se controla por serie: indica el número de serie.';
      if (material.tipo_control === 'lote' && !texto(form.lote || fila?.lote)) errores.lote = 'Este material se controla por lote: indica el número de lote.';
    }
    if (!texto(form.observacion)) errores.observacion = esAjuste ? 'La observación es obligatoria en un ajuste.' : 'Cuenta brevemente qué pasó.';
    const uso = ubicacion?.uso || filaUso(stock, form.stock_id, form.ubicacion_id);
    if (uso && uso !== 'almacenaje' && !(esAjuste && motivo === 'ajuste_conteo') && !(form.accion === 'salida' && ['merma', 'devolucion_proveedor'].includes(motivo))) errores.motivo = `Desde ${uso === 'cuarentena' ? 'cuarentena' : 'merma'} solo se permite ${esAjuste ? 'Ajuste por conteo' : 'Merma o Devolución a proveedor'}.`;
  }
  if (!['PEN', 'USD'].includes(form.moneda || 'PEN')) errores.moneda = 'La moneda debe ser PEN o USD.';
  return errores;
}

export const MENSAJE_ORIGEN_NO_TRANSFERIBLE = 'Desde cuarentena/merma no se transfiere. Para sacar stock de cuarentena se usará la acción Liberar, aún no disponible; solo se podrá mermar o devolver al proveedor desde Movimientos.';
export const ADVERTENCIA_DESTINO_NO_DISPONIBLE = 'Aviso: entra como físico y no queda disponible.';

export function listarDestinosTransferencia(ubicaciones = [], stockOrigen) {
  return ubicaciones.filter(ubicacion => ubicacion.activo !== false
    && (ubicacion.almacen_id !== stockOrigen?.almacen_id || ubicacion.id !== stockOrigen?.ubicacion_id));
}

export function validarTransferencia(form, { material, stockOrigen, ubicacionDestino } = {}) {
  const errores = {};
  const valorCantidad = cantidad(form.cantidad);
  const disponible = Math.max(cantidad(stockOrigen?.disponible ?? (cantidad(stockOrigen?.fisico) - cantidad(stockOrigen?.reservado))), 0);
  if (!(valorCantidad > 0)) errores.cantidad = 'La cantidad debe ser mayor a cero.';
  else if (valorCantidad > disponible) errores.cantidad = `Solo hay ${disponible} ${material?.unidad || 'unidades'} libres en esta ubicación${stockOrigen?.reservado ? ` (${stockOrigen.reservado} reservados)` : ''}.`;
  if (material?.tipo_control === 'serie' && valorCantidad !== 1) errores.cantidad = 'Para materiales controlados por serie, la cantidad debe ser 1.';
  if (!form.almacen_destino_id) errores.almacen_destino_id = 'Elige el almacén de destino.';
  if (!form.ubicacion_destino_id) errores.ubicacion_destino_id = 'Elige la ubicación de destino.';
  if (form.almacen_destino_id === stockOrigen?.almacen_id && form.ubicacion_destino_id === stockOrigen?.ubicacion_id) errores.ubicacion_destino_id = 'El destino debe ser distinto del origen.';
  if (ubicacionDestino && ubicacionDestino.activo === false) errores.ubicacion_destino_id = 'El destino debe estar activo; esta ubicación está inactiva.';
  if (ubicacionDestino && form.almacen_destino_id !== ubicacionDestino.almacen_id) errores.ubicacion_destino_id = 'La ubicación seleccionada no pertenece al almacén de destino.';
  if (['cuarentena', 'merma'].includes(stockOrigen?.ubicaciones?.uso || stockOrigen?.uso)) errores.stock_origen_id = MENSAJE_ORIGEN_NO_TRANSFERIBLE;
  return errores;
}

export function advertenciaDestinoTransferencia(ubicacionDestino) {
  return ['cuarentena', 'merma'].includes(ubicacionDestino?.uso) ? ADVERTENCIA_DESTINO_NO_DISPONIBLE : '';
}

function filaUso(stock, stockId, ubicacionId) { return stock.find(item => item.id === stockId || item.ubicacion_id === ubicacionId)?.ubicaciones?.uso || ''; }

const MOTIVOS_ANULABLES = new Set(['saldo_inicial', 'ajuste_positivo', 'devolucion_ot', 'compra_directa_sin_oc', 'merma', 'robo', 'error_ingreso', 'ajuste_conteo', 'ajuste_manual']);
export function motivoNoAnulable(movimiento, puedeEditar = true) {
  if (movimiento?.anulado) return 'Este movimiento ya fue anulado.';
  if (movimiento?.motivo === 'anulacion' || movimiento?.referencia_tipo === 'anulacion') return 'Una anulación no se puede anular. Registra un nuevo movimiento si hace falta.';
  if (movimiento?.referencia_tipo === 'recepcion_oc' || movimiento?.motivo === 'recepcion_oc') return 'Las recepciones de OC se anulan desde Recepciones, porque también cambian el estado de la orden.';
  if (['transferencia', 'guia', 'guia_remision'].includes(movimiento?.referencia_tipo) || ['transferencia_entrada', 'transferencia_salida'].includes(movimiento?.tipo)) return 'Una transferencia se corrige con una transferencia inversa.';
  if (movimiento?.referencia_tipo === 'ot' || movimiento?.motivo === 'consumo_ot') return 'El consumo de una OT se corrige desde la OT.';
  if (!puedeEditar) return 'Tu rol no permite anular movimientos.';
  if (!MOTIVOS_ANULABLES.has(movimiento?.motivo) && !(movimiento?.motivo === 'devolucion_proveedor' && movimiento?.referencia_tipo === 'manual')) return 'Este movimiento no es manual y no se puede anular desde aquí.';
  return '';
}

export function movimientoAnulable(movimiento, puedeEditar = true) { return !motivoNoAnulable(movimiento, puedeEditar); }

export function mapearErrorMovimiento(error) {
  const mensaje = typeof error === 'string' ? error : error?.message || 'No se pudo completar el movimiento.';
  const mapa = { SOCIEDAD_OBLIGATORIA: 'Selecciona una sociedad antes de registrar el movimiento.', STOCK_INSUFICIENTE: 'No hay stock disponible suficiente para completar el movimiento.', CANTIDAD_INVALIDA: 'Revisa la cantidad indicada.', UBICACION_INVALIDA: 'La ubicación seleccionada no es válida.' };
  const codigo = Object.keys(mapa).find(key => mensaje.trim() === key);
  return codigo ? mapa[codigo] : mensaje;
}
