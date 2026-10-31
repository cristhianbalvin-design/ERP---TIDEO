export function pasoInicialNuevoEgreso({ registroEditar }) {
  return registroEditar ? 2 : 1;
}

export function normalizarNombreCategoriaEgreso(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function derivarCategoriasEgresoDesdeTipos(tipos = []) {
  const categorias = new Map();
  for (const tipo of tipos) {
    const nombre = String(tipo?.categoria_er || '').trim();
    if (!nombre || categorias.has(nombre)) continue;
    categorias.set(nombre, {
      id: `tipo_${nombre}`,
      nombre,
      seccion: null,
      es_capitalizacion: Boolean(tipo?.es_capitalizacion),
      es_respaldo_tipos: true,
    });
  }
  return [...categorias.values()];
}

export function resolverCategoriaEgreso(categoria, categorias = [], tipos = []) {
  const nombre = String(categoria || '').trim();
  if (!nombre) return '';
  if (categorias.length) {
    const exacta = categorias.find(item => item.nombre === nombre);
    if (exacta) return exacta.nombre;
    const normalizada = normalizarNombreCategoriaEgreso(nombre);
    return categorias.find(item => normalizarNombreCategoriaEgreso(item.nombre) === normalizada)?.nombre || '';
  }
  if (!tipos.length) return nombre;
  const respaldos = derivarCategoriasEgresoDesdeTipos(tipos);
  return respaldos.find(item => item.nombre === nombre)?.nombre || '';
}

export function categoriaInicialEgreso({ registroEditar, draft, preconfig, tipoSel, categorias = [], tipos = [] }) {
  const categoria = registroEditar?.categoria
    || draft?.categoria
    || preconfig?.categoria
    || tipoSel?.categoria_er
    || draft?.tipoSel?.categoria_er
    || preconfig?.tipoSel?.categoria_er
    || '';
  return categorias.length || tipos.length ? resolverCategoriaEgreso(categoria, categorias, tipos) : String(categoria || '').trim();
}

export function categoriaAlSeleccionarTipo(tipo, categorias = [], tipos = []) {
  return resolverCategoriaEgreso(tipo?.categoria_er, categorias, tipos);
}

export function categoriaEgresoValida(categoria) {
  return Boolean(String(categoria || '').trim());
}

export function mensajeDestinoEgreso({ edicion = false, yaPagado = false, metodoPago = '' } = {}) {
  if (edicion) return 'Gasto existente actualizado; no se crea una CxP nueva.';
  if (!yaPagado) return 'Alta: gasto registrado en compras_gastos + CxP pendiente creada.';
  if (metodoPago === 'Caja chica') return 'Alta: gasto registrado en compras_gastos + registro en caja_chica.';
  return 'Alta pagada: gasto registrado + CxP pagada + movimiento de tesorería.';
}

export const MENSAJE_CATEGORIA_EGRESO_REQUERIDA = 'Selecciona una categoría del Estado de Resultados para registrar el egreso.';
