const normalizar = valor => String(valor ?? '').toLocaleLowerCase('es-PE');
const ETIQUETAS_TIPO_UBICACION = { general: 'General', zona: 'Zona', rack: 'Rack', posicion: 'Posición' };

export function etiquetaTipoUbicacion(tipo) {
  return ETIQUETAS_TIPO_UBICACION[tipo] || tipo;
}

function compararCodigo(a, b) {
  return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true, sensitivity: 'base' });
}

export function construirArbolUbicaciones(ubicaciones = [], stock = [], almacenId = null, busqueda = '') {
  const ubicacionesAlmacen = ubicaciones.filter(item => item.activo !== false && (!almacenId || item.almacen_id === almacenId));
  const porId = new Map(ubicacionesAlmacen.map(item => [item.id, item]));
  const hijos = new Map();
  ubicacionesAlmacen.forEach(item => {
    const padre = porId.has(item.padre_id) ? item.padre_id : null;
    if (!hijos.has(padre)) hijos.set(padre, []);
    hijos.get(padre).push(item);
  });
  const stockAlmacen = stock.filter(item => Number(item.fisico) > 0 && (!almacenId || item.almacen_id === almacenId));
  const porUbicacion = new Map();
  stockAlmacen.forEach(item => {
    if (!porUbicacion.has(item.ubicacion_id)) porUbicacion.set(item.ubicacion_id, []);
    porUbicacion.get(item.ubicacion_id).push(item);
  });
  const acumulados = new Map();
  const calcular = (item, visitados = new Set()) => {
    if (acumulados.has(item.id)) return acumulados.get(item.id);
    if (visitados.has(item.id)) return { materiales: new Set(), unidades: 0 };
    const siguiente = new Set(visitados).add(item.id);
    const resultado = { materiales: new Set(), unidades: 0 };
    (porUbicacion.get(item.id) || []).forEach(fila => {
      if (fila.material_id) resultado.materiales.add(fila.material_id);
      resultado.unidades += Number(fila.fisico) || 0;
    });
    (hijos.get(item.id) || []).forEach(hijo => {
      const acumulado = calcular(hijo, siguiente);
      acumulado.materiales.forEach(id => resultado.materiales.add(id));
      resultado.unidades += acumulado.unidades;
    });
    acumulados.set(item.id, resultado);
    return resultado;
  };
  const ordenar = lista => [...lista].sort((a, b) => Number(Boolean(b.es_general)) - Number(Boolean(a.es_general)) || compararCodigo(a, b));
  const plano = [];
  const visitar = (padreId, nivel, vistos) => ordenar(hijos.get(padreId) || []).forEach(item => {
    if (vistos.has(item.id)) return;
    const total = calcular(item);
    plano.push({ ...item, nivel, materiales: total.materiales.size, unidades: total.unidades });
    visitar(item.id, nivel + 1, new Set(vistos).add(item.id));
  });
  visitar(null, 0, new Set());
  // Ancestros de coincidencias se conservan para que la jerarquía siga siendo legible.
  const termino = normalizar(busqueda).trim();
  if (!termino) return plano;
  const coincidencias = new Set(ubicacionesAlmacen.filter(item => normalizar(`${item.codigo || ''} ${item.nombre || ''}`).includes(termino)).map(item => item.id));
  const conservar = new Set(coincidencias);
  coincidencias.forEach(id => {
    let actual = porId.get(id);
    const vistos = new Set();
    while (actual?.padre_id && porId.has(actual.padre_id) && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      conservar.add(actual.padre_id);
      actual = porId.get(actual.padre_id);
    }
  });
  return plano.filter(item => conservar.has(item.id));
}

export function calcularChipsUbicaciones(ubicaciones = [], stock = [], almacenId) {
  const ubicacionesAlmacen = ubicaciones.filter(item => item.activo !== false && item.almacen_id === almacenId);
  const stockAlmacen = stock.filter(item => item.almacen_id === almacenId && Number(item.fisico) > 0);
  const general = ubicacionesAlmacen.find(item => item.es_general);
  const materiales = filas => new Set(filas.map(fila => fila.material_id).filter(Boolean)).size;
  return {
    ubicaciones: ubicacionesAlmacen.length,
    materialesAlmacenados: materiales(stockAlmacen),
    sinUbicar: general ? materiales(stockAlmacen.filter(fila => fila.ubicacion_id === general.id)) : 0,
  };
}
