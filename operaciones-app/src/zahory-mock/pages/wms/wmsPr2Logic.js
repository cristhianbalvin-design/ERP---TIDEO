// Lógica pura de Vencimientos, Devoluciones, Herramientas, Etiquetas y Reporte valorizado (PR2 del WMS).

const numero = valor => {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const redondear = (valor, decimales = 2) => Math.round(numero(valor) * 10 ** decimales) / 10 ** decimales;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// Vencimientos
export function estadoLote(lote) {
  if (lote.uso === 'cuarentena') return { id: 'cuarentena', label: 'En cuarentena', pill: 'is-gray', orden: 4 };
  if (lote.vencimiento === null || lote.vencimiento === undefined || lote.dias === null || lote.dias === undefined) {
    return { id: 'sin_fecha', label: 'Sin fecha de vencimiento', pill: 'is-gray', orden: 5 };
  }
  const dias = numero(lote.dias);
  if (dias < 0) return { id: 'vencido', label: `Vencido hace ${plural(Math.abs(dias), 'día', 'días')}`, pill: 'is-red', orden: 0 };
  if (dias === 0) return { id: 'vence_30', label: 'Vence hoy', pill: 'is-red', orden: 1 };
  if (dias <= 30) return { id: 'vence_30', label: `Vence en ${plural(dias, 'día', 'días')}`, pill: 'is-amber', orden: 1 };
  if (dias <= 90) return { id: 'vence_90', label: `Vence en ${plural(dias, 'día', 'días')}`, pill: 'is-green', orden: 2 };
  return { id: 'vigente', label: `Vence en ${plural(dias, 'día', 'días')}`, pill: 'is-green', orden: 3 };
}

export function resumenLotes(lotes = []) {
  const r = { vencidos: 0, vence30: 0, vence90: 0, valorRiesgo: 0 };
  for (const l of lotes) {
    const id = estadoLote(l).id;
    if (id === 'vencido') r.vencidos += 1;
    if (id === 'vence_30') r.vence30 += 1;
    if (id === 'vence_90') r.vence90 += 1;
    if (['vencido', 'vence_30', 'vence_90'].includes(id)) r.valorRiesgo += numero(l.valor);
  }
  r.valorRiesgo = redondear(r.valorRiesgo);
  return r;
}

// Marca el lote que sale primero (FEFO) por material y almacén: el vigente con vencimiento más próximo.
export function marcarSalePrimero(lotes = []) {
  const primero = new Map();
  for (const l of lotes) {
    const id = estadoLote(l).id;
    if (['vencido', 'cuarentena', 'sin_fecha'].includes(id) || !(numero(l.disponible) > 0)) continue;
    const clave = `${l.material_id}|${l.almacen_id}`;
    const actual = primero.get(clave);
    if (!actual || numero(l.dias) < numero(actual.dias)) primero.set(clave, l);
  }
  const ids = new Set([...primero.values()].map(l => l.stock_id));
  return lotes.map(l => ({ ...l, sale_primero: ids.has(l.stock_id) }));
}

export function filtrarLotes(lotes = [], { filtro = 'por_vencer', texto = '' } = {}) {
  const q = texto.trim().toLowerCase();
  return lotes.filter(l => {
    const id = estadoLote(l).id;
    if (filtro === 'por_vencer' && !['vence_30', 'vence_90'].includes(id)) return false;
    if (filtro === 'vencidos' && id !== 'vencido') return false;
    return !q || `${l.codigo} ${l.descripcion} ${l.lote || ''} ${l.ubicacion || ''}`.toLowerCase().includes(q);
  }).sort((a, b) => estadoLote(a).orden - estadoLote(b).orden || numero(a.dias) - numero(b.dias));
}

// ---------------------------------------------------------------------------
// Devoluciones
export const ORIGENES_DEVOLUCION = Object.freeze({
  cliente: { label: 'Cliente', pill: 'is-cyan' },
  taller: { label: 'Taller', pill: 'is-violet' },
});

export function estadoDevolucion(d) {
  if (d.estado === 'en_inspeccion') return { label: 'En inspección', pill: 'is-amber' };
  if (d.nc_estado === 'pendiente') return { label: 'Cerrada · NC pendiente', pill: 'is-cyan' };
  if (d.nc_estado === 'emitida') return { label: 'Cerrada · NC emitida', pill: 'is-green' };
  return { label: 'Cerrada', pill: 'is-green' };
}

export function resumenDevoluciones(devoluciones = [], hoy = new Date()) {
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  return {
    inspeccion: devoluciones.filter(d => d.estado === 'en_inspeccion').length,
    ncPendiente: devoluciones.filter(d => d.nc_estado === 'pendiente').length,
    cerradasMes: devoluciones.filter(d => d.estado === 'cerrada' && String(d.cerrada_at || '').startsWith(mes)).length,
  };
}

// Valida las cantidades a devolver contra lo despachado del documento. Devuelve { lineas, errores }.
export function validarLineasDevolucion(documento, cantidades = {}) {
  const errores = {};
  const lineas = [];
  const porMaterial = new Map();
  for (const l of documento?.lineas || []) porMaterial.set(l.material_id, { ...l, cantidad: numero(porMaterial.get(l.material_id)?.cantidad) + numero(l.cantidad) });
  for (const [materialId, l] of porMaterial) {
    const texto = cantidades[materialId];
    if (texto === undefined || texto === '') continue;
    const q = numero(texto);
    if (!(q > 0)) errores[materialId] = 'Indica una cantidad mayor a cero.';
    else if (q > l.cantidad) errores[materialId] = `Máximo ${redondear(l.cantidad)} (lo despachado).`;
    else lineas.push({ material_id: materialId, cantidad: redondear(q) });
  }
  return { lineas, errores };
}

// Valida el cierre de la inspección: por línea, liberado + merma = devuelto.
export function validarCierreInspeccion(devolucion, destino = {}) {
  const errores = {};
  const lineas = (devolucion?.lineas || []).map(l => {
    const liberar = numero(destino[l.linea_id]?.liberar ?? l.cantidad);
    const merma = numero(destino[l.linea_id]?.merma ?? 0);
    if (liberar < 0 || merma < 0) errores[l.linea_id] = 'Las cantidades no pueden ser negativas.';
    else if (Math.abs(liberar + merma - numero(l.cantidad)) > 1e-9) errores[l.linea_id] = `Liberado + merma debe sumar ${redondear(l.cantidad)}.`;
    return { linea_id: l.linea_id, liberar: redondear(liberar), merma: redondear(merma) };
  });
  return { lineas, errores };
}

// ---------------------------------------------------------------------------
// Herramientas
export function estadoPrestamo(p) {
  if (p.estado === 'cerrado') {
    if (numero(p.perdida) > 0) return { id: 'cerrado', label: 'Cerrado · con pérdida', pill: 'is-red' };
    if (numero(p.danada) > 0) return { id: 'cerrado', label: 'Cerrado · con daño', pill: 'is-amber' };
    return { id: 'cerrado', label: 'Devuelto', pill: 'is-green' };
  }
  const dias = numero(p.dias_vencido);
  if (dias > 0) return { id: 'vencido', label: `Vencido ${plural(dias, 'día', 'días')}`, pill: 'is-red' };
  if (dias === 0) return { id: 'activo', label: 'Devolver hoy', pill: 'is-amber' };
  return { id: 'activo', label: 'En uso', pill: 'is-cyan' };
}

export function resumenPrestamos(prestamos = [], disponibles = []) {
  const activos = prestamos.filter(p => p.estado === 'activo');
  return {
    prestadas: activos.reduce((t, p) => t + numero(p.pendiente), 0),
    vencidos: activos.filter(p => estadoPrestamo(p).id === 'vencido').length,
    disponibles: disponibles.filter(d => d.es_herramienta).reduce((t, d) => t + numero(d.disponible), 0),
  };
}

export function filtrarPrestamos(prestamos = [], { filtro = 'activos', texto = '' } = {}) {
  const q = texto.trim().toLowerCase();
  return prestamos.filter(p => {
    const id = estadoPrestamo(p).id;
    if (filtro === 'activos' && p.estado !== 'activo') return false;
    if (filtro === 'vencidos' && id !== 'vencido') return false;
    if (filtro === 'devueltos' && p.estado !== 'cerrado') return false;
    return !q || `${p.codigo} ${p.descripcion} ${p.personal || ''} ${p.personal_codigo || ''} ${p.ot_numero || ''}`.toLowerCase().includes(q);
  });
}

export function validarPrestamo(form, disponible) {
  const errores = {};
  if (!form.stock_id) errores.stock_id = 'Elige la herramienta.';
  const q = numero(form.cantidad);
  if (!(q > 0)) errores.cantidad = 'Indica una cantidad mayor a cero.';
  else if (disponible !== undefined && q > numero(disponible)) errores.cantidad = `Solo hay ${redondear(disponible)} disponibles.`;
  if (!form.personal_id) errores.personal_id = 'Elige a quién se presta.';
  if (!form.fecha_devolucion) errores.fecha_devolucion = 'Indica la fecha de devolución.';
  return errores;
}

// ---------------------------------------------------------------------------
// Etiquetas
export const FORMATOS_ETIQUETA = Object.freeze({
  a24: { id: 'a24', label: '24 por hoja (63 × 34 mm)', columnas: 3, filas: 8, anchoMm: 63.5, altoMm: 33.9, qrMm: 26, margenSupMm: 13.1, margenIzqMm: 7.2, separacionMm: 2.5 },
  a8: { id: 'a8', label: '8 por hoja (99 × 68 mm)', columnas: 2, filas: 4, anchoMm: 99.1, altoMm: 67.7, qrMm: 50, margenSupMm: 13.1, margenIzqMm: 4.7, separacionMm: 2.5 },
});

// Expande las copias y reparte en hojas según el formato.
export function paginarEtiquetas(items = [], formato = FORMATOS_ETIQUETA.a24) {
  const porHoja = formato.columnas * formato.filas;
  const todas = items.flatMap(it => Array.from({ length: Math.max(0, Math.min(99, Math.floor(numero(it.copias ?? 1)))) }, () => it));
  const hojas = [];
  for (let i = 0; i < todas.length; i += porHoja) hojas.push(todas.slice(i, i + porHoja));
  return { total: todas.length, hojas };
}

// Contenido del QR: el mismo código que se escanea en Despachos y Conteos.
export const contenidoQR = item => String(item.codigo_barras || item.codigo || '').trim();

// ---------------------------------------------------------------------------
// Reporte valorizado y ABC
export const CLASES_ABC = Object.freeze({
  A: { label: 'A · 80% del consumo', corto: 'A', pill: 'is-green' },
  B: { label: 'B · siguiente 15%', corto: 'B', pill: 'is-amber' },
  C: { label: 'C · resto', corto: 'C', pill: 'is-gray' },
  sin_movimiento: { label: 'Sin movimiento', corto: 'Sin movimiento', pill: 'is-red' },
});

export function resumenValorizado(materiales = []) {
  const r = { valor: 0, consumo: 0, sinSalida90: 0, clases: {} };
  for (const k of Object.keys(CLASES_ABC)) r.clases[k] = { n: 0, consumo: 0, valor: 0 };
  for (const m of materiales) {
    r.valor += numero(m.valor);
    r.consumo += numero(m.consumo_12m);
    if (m.sin_salida_90) r.sinSalida90 += numero(m.valor);
    const c = r.clases[m.clase] || r.clases.sin_movimiento;
    c.n += 1; c.consumo += numero(m.consumo_12m); c.valor += numero(m.valor);
  }
  r.valor = redondear(r.valor); r.consumo = redondear(r.consumo); r.sinSalida90 = redondear(r.sinSalida90);
  r.pctSinSalida = r.valor > 0 ? Math.round((r.sinSalida90 / r.valor) * 100) : 0;
  for (const c of Object.values(r.clases)) { c.consumo = redondear(c.consumo); c.valor = redondear(c.valor); }
  return r;
}

export function filasExcelValorizado(materiales = []) {
  return materiales.map(m => ({
    'Código': m.codigo, 'Descripción': m.descripcion, 'Familia': m.familia || 'General', 'Clase ABC': CLASES_ABC[m.clase]?.corto || m.clase,
    'Stock': numero(m.fisico), 'Unidad': m.unidad || '', 'Costo promedio (S/)': redondear(m.costo_promedio), 'Valor (S/)': redondear(m.valor),
    'Consumo 12 meses (S/)': redondear(m.consumo_12m), 'Última salida': m.ultima_salida ? String(m.ultima_salida).slice(0, 10) : 'Sin salidas',
  }));
}

export const textoContador = (n, uno, varios) => plural(n, uno, varios);
