const numero = valor => Number(valor ?? 0) || 0;

export function consolidarStockPorMaterial(stock = [], catalogo = null) {
  const grupos = new Map();
  const catalogoPorId = new Map((catalogo || []).map(material => [material.id, material]));
  for (const fila of stock) {
    const id = fila.material_id || fila.materiales?.id;
    if (!id) continue;
    const material = fila.materiales || fila.material || catalogoPorId.get(id) || {};
    let grupo = grupos.get(id);
    if (!grupo) {
      grupo = {
        id,
        codigo: material.codigo || id,
        descripcion: material.descripcion || id,
        familia: material.familia || 'General',
        unidad: material.unidad || 'und',
        tipo_control: material.tipo_control || 'sin_control',
        costo_promedio: numero(material.costo_promedio),
        costo_promedio_usd: numero(material.costo_promedio_usd),
        moneda: material.moneda || 'PEN',
        stock_minimo: numero(material.stock_minimo),
        punto_reorden: material.punto_reorden,
        stock_seguridad: numero(material.stock_seguridad),
        filas: [],
      };
      grupos.set(id, grupo);
    } else {
      Object.assign(grupo, {
        codigo: material.codigo || grupo.codigo,
        descripcion: material.descripcion || grupo.descripcion,
        familia: material.familia || grupo.familia,
        unidad: material.unidad || grupo.unidad,
        tipo_control: material.tipo_control || grupo.tipo_control,
        costo_promedio: numero(material.costo_promedio ?? grupo.costo_promedio),
        costo_promedio_usd: numero(material.costo_promedio_usd ?? grupo.costo_promedio_usd),
        moneda: material.moneda || grupo.moneda,
        stock_minimo: numero(material.stock_minimo ?? grupo.stock_minimo),
        punto_reorden: material.punto_reorden ?? grupo.punto_reorden,
        stock_seguridad: numero(material.stock_seguridad ?? grupo.stock_seguridad),
      });
    }
    grupo.filas.push({
      ...fila,
      fisico: numero(fila.fisico ?? fila.disponible),
      reservado: numero(fila.reservado),
      almacen: fila.almacenes?.nombre || fila.almacenes?.codigo || fila.almacen || fila.almacen_id,
      ubicacion: fila.ubicaciones?.nombre || fila.ubicaciones?.codigo || fila.ubicacion_nombre || 'General',
      ubicacion_codigo: fila.ubicaciones?.codigo || fila.ubicacion_codigo || '',
      uso: fila.ubicaciones?.uso || fila.uso || 'almacenaje',
      lote: fila.lote || '—',
    });
  }
  return [...grupos.values()];
}

export function calcularStockMaterial(material, filas = material?.filas || []) {
  const fisico = filas.reduce((total, fila) => total + numero(fila.fisico), 0);
  const reservado = filas.reduce((total, fila) => total + numero(fila.reservado), 0);
  const noDisponible = filas.reduce((total, fila) => total + (['cuarentena', 'merma'].includes(fila.uso) ? numero(fila.fisico) : 0), 0);
  const disponible = Math.max(fisico - reservado - noDisponible, 0);
  const reorden = numero(material?.punto_reorden || material?.stock_minimo) + numero(material?.stock_seguridad);
  const estado = disponible === 0 ? 'agotado' : reorden > 0 && disponible <= reorden ? 'bajo' : 'normal';
  const moneda = String(material?.moneda || 'PEN').toUpperCase();
  const costoPromedio = moneda === 'USD' ? numero(material?.costo_promedio_usd) : numero(material?.costo_promedio);
  return { fisico, reservado, noDisponible, disponible, reorden, costoPromedio, moneda, valor: fisico * costoPromedio, estado };
}

const TIPOS = {
  entrada: ['Entrada', 'is-green'],
  salida: ['Salida', 'is-amber'],
  transferencia_entrada: ['Transf. entrada', 'is-cyan'],
  transferencia_salida: ['Transf. salida', 'is-cyan'],
  ajuste: ['Ajuste', 'is-gray'],
};

export function etiquetaTipoMovimiento(tipo) {
  return TIPOS[tipo]?.[0] || String(tipo || 'Movimiento').replaceAll('_', ' ').replace(/^\p{L}/u, letra => letra.toLocaleUpperCase('es-PE'));
}

export function claseTipoMovimiento(tipo) {
  return TIPOS[tipo]?.[1] || 'is-gray';
}

export function signoMovimiento(movimiento) {
  const cantidad = numero(movimiento?.cantidad);
  if (cantidad < 0) return -1;
  if (cantidad > 0) {
    if (['salida', 'transferencia_salida'].includes(movimiento?.tipo)) return -1;
    return 1;
  }
  return ['salida', 'transferencia_salida'].includes(movimiento?.tipo) ? -1 : 1;
}

export function cantidadConSigno(movimiento) {
  return Math.abs(numero(movimiento?.cantidad)) * signoMovimiento(movimiento);
}

export function esTransferencia(movimiento) {
  return ['transferencia_entrada', 'transferencia_salida'].includes(movimiento?.tipo)
    || movimiento?.referencia_tipo === 'transferencia';
}

export function resolverEtiquetaUbicacionAlmacen(id, tipo, { almacenes = [], ubicaciones = [], stock = [], registro } = {}) {
  if (id == null || id === '') return '—';
  const esAlmacen = tipo === 'almacen';
  const catalogo = esAlmacen ? almacenes : ubicaciones;
  const relacion = esAlmacen ? 'almacenes' : 'ubicaciones';
  const campoId = esAlmacen ? 'almacen_id' : 'ubicacion_id';
  const items = [catalogo.find(registro => registro.id === id), stock.find(fila => fila[campoId] === id)?.[relacion], registro].filter(Boolean);
  const item = items.find(registro => registro.codigo && registro.nombre) || items[0];
  const codigo = item?.codigo;
  const nombre = item?.nombre;
  if (codigo && nombre) return `${codigo} · ${nombre}`;
  return nombre || codigo || id;
}

export function etiquetaValorizacion(movimiento) {
  if (movimiento?.anulado) return 'Anulado';
  return ['pendiente_factura', 'provisional'].includes(movimiento?.valorizacion_estado) ? 'Provisional' : 'Definitiva';
}
