// Catálogo de venta: cálculos y validación (sin dependencias de React para poder probarlos).
const num = v => Number(String(v ?? '').replace(',', '.'));
const r2 = v => Math.round(Number(v || 0) * 100) / 100;

// Margen sobre el precio de lista; solo comparable cuando el precio está en soles (el costo promedio es en soles).
export function margenProducto({ precio_lista, costo_promedio, moneda = 'PEN' }) {
  const precio = Number(precio_lista || 0);
  if (moneda !== 'PEN' || !(precio > 0)) return null;
  return r2(((precio - Number(costo_promedio || 0)) / precio) * 100);
}

export function bajoCosto(p) {
  return (p.moneda || 'PEN') === 'PEN' && Number(p.costo_promedio || 0) > 0 && Number(p.precio_lista || 0) < Number(p.costo_promedio || 0);
}

export function resumenCatalogo(items = []) {
  const activos = items.filter(i => i.activo !== false);
  const margenes = activos.map(margenProducto).filter(m => m !== null);
  return {
    activos: activos.length,
    sinStock: activos.filter(i => !(Number(i.disponible) > 0)).length,
    bajoCosto: activos.filter(bajoCosto).length,
    margenPromedio: margenes.length ? r2(margenes.reduce((s, m) => s + m, 0) / margenes.length) : null,
  };
}

const normalizar = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarCatalogo(items = [], { filtro = 'activos', texto = '' } = {}) {
  const q = normalizar(texto).trim();
  return items.filter(i => (filtro === 'todos' || (filtro === 'activos' ? i.activo !== false : i.activo === false))
    && (!q || normalizar(`${i.codigo} ${i.descripcion}`).includes(q)));
}

export function buscarMateriales(materiales = [], texto = '', limite = 20) {
  const q = normalizar(texto).trim();
  if (q.length < 2) return [];
  return materiales.filter(m => normalizar(`${m.codigo} ${m.descripcion}`).includes(q)).slice(0, limite);
}

// Validación por campo: todos los errores a la vez. El precio bajo el costo es aviso, no error.
export function validarProductoCatalogo(f = {}, { nuevo = true } = {}) {
  const errores = {};
  if (nuevo && !f.material) errores.material = 'Elige el material de la lista.';
  else if (nuevo && f.material?.en_catalogo) errores.material = 'Ese material ya está en el catálogo.';
  const p = String(f.precio_lista ?? '').trim();
  if (p === '') errores.precio_lista = 'Indica el precio de lista.';
  else if (!(num(p) > 0)) errores.precio_lista = 'Indica un precio mayor a cero.';
  if (!['PEN', 'USD'].includes(f.moneda)) errores.moneda = 'Elige la moneda.';
  const d = String(f.descuento_maximo_pct ?? '').trim();
  if (d !== '' && !(num(d) >= 0 && num(d) <= 100)) errores.descuento_maximo_pct = 'Entre 0 y 100.';
  return errores;
}

export function payloadProducto(f = {}) {
  return {
    material_id: f.material?.material_id || null,
    precio_lista: r2(num(f.precio_lista)),
    moneda: f.moneda || 'PEN',
    descuento_maximo_pct: String(f.descuento_maximo_pct ?? '').trim() === '' ? 0 : r2(num(f.descuento_maximo_pct)),
    activo: f.activo !== false,
  };
}

export function formatoPct(v) {
  return v === null || v === undefined ? 'Sin dato' : `${Number(v).toFixed(1)}%`;
}
