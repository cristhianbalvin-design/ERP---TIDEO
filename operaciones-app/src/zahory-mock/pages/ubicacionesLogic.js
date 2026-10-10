const normalizar = valor => String(valor ?? '').toLocaleLowerCase('es-PE');
const ETIQUETAS_TIPO_UBICACION = { general: 'General', zona: 'Zona', rack: 'Rack', posicion: 'Posición', piso: 'Piso' };
export const USOS_UBICACION = { almacenaje: 'Almacenaje', recepcion: 'Recepción', cuarentena: 'Cuarentena u observados', despacho: 'Despacho', merma: 'Merma o baja' };

export function etiquetaTipoUbicacion(tipo) { return ETIQUETAS_TIPO_UBICACION[tipo] || tipo; }
export function usoUbicacion(item) { return item?.uso || 'almacenaje'; }
export function etiquetaUsoUbicacion(uso) { return USOS_UBICACION[uso] || uso || USOS_UBICACION.almacenaje; }

function compararCodigo(a, b) {
  return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true, sensitivity: 'base' });
}

export function construirArbolUbicaciones(ubicaciones = [], stock = [], almacenId = null, busqueda = '', filtroUso = '', mostrarInactivas = true) {
  const ubicacionesAlmacen = ubicaciones.filter(item => (!almacenId || item.almacen_id === almacenId) && (mostrarInactivas || item.activo !== false));
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
  const termino = normalizar(busqueda).trim();
  const filtro = filtroUso || '';
  if (!termino && !filtro) return plano;
  const coincidencias = new Set(ubicacionesAlmacen.filter(item =>
    (!termino || normalizar(`${item.codigo || ''} ${item.nombre || ''}`).includes(termino))
    && (!filtro || usoUbicacion(item) === filtro)).map(item => item.id));
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

export function contarInactivasUbicaciones(ubicaciones = [], almacenId) {
  return ubicaciones.filter(item => item.almacen_id === almacenId && item.activo === false).length;
}

export function calcularMotivoNoDesactivar(ubicacion, ubicaciones = [], stock = []) {
  if (ubicacion?.es_general) return 'La ubicación general no se puede desactivar.';
  if (stock.some(item => item.ubicacion_id === ubicacion?.id && Number(item.fisico) > 0)) return 'Tiene stock: no se puede desactivar mientras conserve existencias.';
  if (ubicaciones.some(item => item.padre_id === ubicacion?.id && item.activo !== false)) return 'Tiene sub-ubicaciones activas: desactívalas primero.';
  return '';
}

export function calcularTotalesUbicacion(ubicacion, ubicaciones = [], stock = []) {
  const porPadre = new Map();
  ubicaciones.forEach(item => {
    if (!porPadre.has(item.padre_id)) porPadre.set(item.padre_id, []);
    porPadre.get(item.padre_id).push(item);
  });
  const materiales = new Set();
  let unidades = 0;
  const vistos = new Set();
  const visitar = actual => {
    if (!actual || vistos.has(actual.id)) return;
    vistos.add(actual.id);
    stock.filter(fila => fila.ubicacion_id === actual.id && Number(fila.fisico) > 0).forEach(fila => {
      if (fila.material_id) materiales.add(fila.material_id);
      unidades += Number(fila.fisico) || 0;
    });
    (porPadre.get(actual.id) || []).forEach(visitar);
  };
  visitar(ubicacion);
  return { materiales: materiales.size, unidades };
}

export function validarFormularioUbicacion(formulario, ubicaciones = []) {
  const errores = {};
  if (formulario.modo === 'nuevo' && formulario.tipo !== 'zona' && !formulario.padre_id) {
    errores.padre = formulario.tipo === 'posicion' ? 'Elige el rack o la zona donde está la posición.' : `Elige la zona a la que pertenece el ${etiquetaTipoUbicacion(formulario.tipo).toLowerCase()}.`;
  }
  const codigo = String(formulario.codigo || '').trim();
  if (!codigo) errores.codigo = 'El código es obligatorio.';
  else if (ubicaciones.some(item => item.almacen_id === formulario.almacen_id && item.id !== formulario.id && String(item.codigo || '').toLocaleLowerCase('es-PE') === codigo.toLocaleLowerCase('es-PE'))) errores.codigo = 'Ya existe una ubicación con ese código en este almacén.';
  if (!String(formulario.nombre || '').trim()) errores.nombre = 'El nombre es obligatorio.';
  return errores;
}
