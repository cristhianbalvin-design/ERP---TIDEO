export const ESTADOS_OC_RECEPCIONABLES = ['emitida', 'confirmada', 'en_transito', 'recibida_parcial'];

const itemId = item => String(item?.item_id || '').trim();
const descripcion = item => String(item?.descripcion || '').trim().toLowerCase();

export function itemRecepcionCoincideConOc(recepcionItem, ocItem, ocItems = []) {
  const ocId = itemId(ocItem);
  const recId = itemId(recepcionItem);
  if (recId && ocId === recId) return true;
  if (recId && ocItems.some(item => itemId(item) === recId)) return false;
  return Boolean((ocItem?.material_id && recepcionItem?.material_id && ocItem.material_id === recepcionItem.material_id)
    || (descripcion(ocItem) && descripcion(ocItem) === descripcion(recepcionItem)));
}

export function cantidadRecibidaPorItemOc(recepciones = [], ordenCompraId, itemOc, ocItems = []) {
  return recepciones
    .filter(recepcion => String(recepcion?.orden_compra_id || recepcion?.oc_id || '') === String(ordenCompraId))
    .reduce((total, recepcion) => {
      const items = recepcion?.items_recibidos || recepcion?.items || [];
      return total + items.filter(item => itemRecepcionCoincideConOc(item, itemOc, ocItems))
        .reduce((suma, item) => suma + (Number(item?.recibido) || 0), 0);
    }, 0);
}

export function pendientePorLinea(oc, recepciones, idx) {
  const linea = (oc?.items || [])[idx] || {};
  return Math.max(0, (Number(linea.cantidad) || 0) - cantidadRecibidaPorItemOc(recepciones, oc?.id, linea, oc?.items || []));
}

export function validarCantidades(lineas, cantidades) {
  return lineas.every((linea, idx) => {
    if (cantidades[idx] === '' || cantidades[idx] === null || cantidades[idx] === undefined) return false;
    const cantidad = Number(cantidades[idx]);
    return Number.isFinite(cantidad) && cantidad >= 0 && cantidad <= linea.pendiente;
  });
}

export function componerObservacion(lineas, observadas) {
  const nombres = lineas.filter((_, idx) => observadas[idx]).map(linea => linea.descripcion || linea.codigo || 'Línea');
  return nombres.length ? `Líneas observadas: ${nombres.join(', ')}` : null;
}

export function armarPayloadRecepcion(oc, lineas, cantidades, ubicaciones) {
  return lineas.map((linea, idx) => ({ idx, recibido: Number(cantidades[idx]) || 0, ubicacion_id: ubicaciones[idx] || null }))
    .filter(item => item.recibido > 0 && lineaHabilitada(lineas[item.idx]));
}

export function lineaHabilitada(linea) { return Boolean(linea?.material_id) && Number(linea?.pendiente) > 0; }

export function ordenarUbicacionesPorJerarquia(ubicaciones = []) {
  const porId = new Map(ubicaciones.map(item => [item.id, item]));
  const hijos = new Map();
  ubicaciones.forEach(item => {
    const padre = porId.has(item.padre_id) ? item.padre_id : null;
    if (!hijos.has(padre)) hijos.set(padre, []);
    hijos.get(padre).push(item);
  });
  const ordenar = items => items.sort((a, b) => Number(Boolean(b.es_general)) - Number(Boolean(a.es_general))
    || String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true }));
  const salida = [];
  const visitar = (padre, nivel, vistos) => ordenar(hijos.get(padre) || []).forEach(item => {
    if (vistos.has(item.id)) return;
    salida.push({ ...item, nivel });
    const siguiente = new Set(vistos).add(item.id);
    visitar(item.id, nivel + 1, siguiente);
  });
  visitar(null, 0, new Set());
  return salida;
}
