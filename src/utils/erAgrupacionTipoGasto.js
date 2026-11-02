const SIN_TIPO = 'Sin tipo de gasto';

/** Agrupa los detalles de una línea del ER por tipo, conservando importes por moneda. */
export function agruparDetallesPorTipoGasto(details = []) {
  const grupos = new Map();

  for (const detail of details || []) {
    const nombre = typeof detail?.subcategoria === 'string' ? detail.subcategoria.trim() : '';
    const tipoGasto = nombre || SIN_TIPO;
    if (!grupos.has(tipoGasto)) grupos.set(tipoGasto, { tipoGasto, totals: {}, details: [] });

    const grupo = grupos.get(tipoGasto);
    const moneda = String(detail?.currency || 'PEN').trim().toUpperCase() || 'PEN';
    const importe = Number(detail?.amount || 0);
    if (Number.isFinite(importe)) grupo.totals[moneda] = (grupo.totals[moneda] || 0) + importe;
    grupo.details.push(detail);
  }

  return [...grupos.values()];
}

export { SIN_TIPO as SIN_TIPO_GASTO_ER };
