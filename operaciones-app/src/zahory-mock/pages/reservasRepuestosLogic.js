const ESTADOS_LINEA = Object.freeze({
  estimado: ['Estimado', 'is-gray'], reservado: ['Reservado', 'is-green'],
  reservado_parcial_solpe: ['Reservado parcial + SOLPE', 'is-amber'],
  despachado_parcial: ['Despachado parcial', 'is-cyan'], despachado: ['Despachado', 'is-green'],
  despachado_liberado: ['Despachado y liberado', 'is-cyan'],
  liberado: ['Liberado', 'is-gray'], consumido: ['Consumido', 'is-gray'], anulado: ['Anulado', 'is-gray'],
});
const numero = valor => Number(valor || 0);

export function etiquetaEstadoLinea(estado, linea) {
  if (estado === 'reservado_parcial_solpe' && linea && typeof linea === 'object' && numero(linea.reservado) === 0) return 'Sin stock · SOLPE en curso';
  return ESTADOS_LINEA[estado]?.[0] || 'Sin estado';
}
export function tonoEstadoLinea(estado) { return ESTADOS_LINEA[estado]?.[1] || 'is-gray'; }
export function estadoAgregadoOT(ot) {
  const lineas = ot?.lineas || [];
  if (!lineas.length) return { texto: 'Sin repuestos', tono: 'is-gray' };
  if (lineas.every(linea => linea.estado === 'anulado')) return { texto: 'Anulada', tono: 'is-gray' };
  if (lineas.some(linea => linea.estado === 'reservado_parcial_solpe')) return { texto: 'Reservado parcial + SOLPE', tono: 'is-amber' };
  const pendientes = lineas.reduce((suma, linea) => suma + numero(linea.pendiente), 0);
  const despachado = lineas.reduce((suma, linea) => suma + numero(linea.despachado), 0);
  const liberado = lineas.reduce((suma, linea) => suma + numero(linea.liberado), 0);
  if (pendientes === 0 && despachado > 0 && liberado === 0) return { texto: 'Despachado', tono: 'is-green' };
  if (pendientes === 0 && liberado > 0 && despachado === 0) return { texto: 'Liberado', tono: 'is-gray' };
  if (pendientes === 0 && liberado > 0 && despachado > 0) return { texto: 'Despachado y liberado', tono: 'is-cyan' };
  if (despachado > 0) return { texto: 'Despachado parcial', tono: 'is-cyan' };
  if (lineas.some(linea => numero(linea.cantidad_estimada) > numero(linea.reservado))) return { texto: 'Reserva pendiente', tono: 'is-amber' };
  return { texto: 'Reservado', tono: 'is-green' };
}
export function etiquetaConteoLineas(cantidad) { return `${cantidad} ${Number(cantidad) === 1 ? 'línea' : 'líneas'}`; }
export function etiquetaEstadoOT(estado) {
  return ({ programada: 'Programada', ejecucion: 'Ejecución', cerrada: 'Cerrada', cancelada: 'Cancelada', anulada: 'Anulada' })[estado] || String(estado || 'Sin estado');
}
export function validarCantidadReserva(valor, pendiente, sufijo = 'pendientes') {
  const texto = String(valor ?? '').trim();
  const cantidad = Number(texto.replace(',', '.'));
  if (!texto || !Number.isFinite(cantidad) || cantidad <= 0) return 'La cantidad debe ser mayor a cero.';
  if (cantidad > numero(pendiente)) return `La cantidad no puede superar ${numero(pendiente)} ${sufijo}.`;
  if (Math.round(cantidad * 100) !== cantidad * 100) return 'La cantidad admite hasta 2 decimales.';
  return '';
}
export function validarLiberacion({ cantidad, pendiente, motivo }) {
  return validarCantidadReserva(cantidad, pendiente) || (!String(motivo || '').trim() ? 'Indica un motivo para liberar.' : '');
}
export function textoUbicacionOrigen(origen) {
  if (!origen) return 'Sin ubicación (sin stock reservado)';
  const ubicacion = origen.ubicacion_codigo && origen.ubicacion_nombre ? `${origen.ubicacion_codigo} · ${origen.ubicacion_nombre}` : origen.ubicacion_nombre || origen.ubicacion_codigo || 'Ubicación general';
  const almacen = origen.almacen_codigo && origen.almacen_nombre ? `${origen.almacen_codigo} · ${origen.almacen_nombre}` : origen.almacen_nombre || origen.almacen_codigo || '';
  return almacen ? `${almacen} · ${ubicacion}` : ubicacion;
}
export function mapearErrorReserva(error) {
  const codigo = error?.code || error?.error?.code;
  if (codigo === '42501') return 'No tienes permiso para realizar esta acción.';
  if (codigo === '23514') return 'La OT cambió de estado o la cantidad supera lo pendiente. Actualiza la OT.';
  if (codigo === '40001') return 'La reserva cambió mientras trabajabas. Actualiza la OT e inténtalo de nuevo.';
  return error?.message || 'No se pudo completar la acción sobre la reserva.';
}
export function puedeOperarLinea(permisos, accion, ot, linea) {
  const clave = accion === 'despachar' || accion === 'revertir' ? 'despachar' : 'liberar';
  const cantidad = accion === 'revertir' ? numero(linea?.despachado) : numero(linea?.pendiente);
  return permisos?.[clave] === true && ['programada', 'ejecucion'].includes(ot?.estado)
    && cantidad > 0 && (accion === 'revertir' || linea?.estado !== 'anulado');
}
