const toAmount = value => Number(value || 0);
const toCents = value => Math.round((toAmount(value) + Number.EPSILON) * 100);
const fromCents = value => value / 100;

/** Construye los devengos CxP por CECO y aplica el alcance del reporte. */
export const crearEntradasDevengoCxp = (
  cxp,
  distribuciones = [],
  { hasScopedFilters = false, effectiveCecoIds = null } = {},
) => {
  const filas = (distribuciones || [])
    .filter(fila => fila?.ceco_id != null)
    .slice()
    .sort((a, b) => String(a.ceco_id).localeCompare(String(b.ceco_id)));

  if (!filas.length) {
    if (hasScopedFilters) return [];
    return [{ cecoId: cxp?.centro_costo_id || null, amount: toAmount(cxp?.devengoAmount), distributed: false }];
  }

  const totalDistribuido = filas.reduce((total, fila) => total + toAmount(fila.monto), 0);
  const montoDevengableCents = toCents(cxp?.devengoAmount);
  let asignadoCents = 0;
  const entradas = filas.map((fila, index) => {
    const esUltima = index === filas.length - 1;
    const montoCents = esUltima
      ? montoDevengableCents - asignadoCents
      : totalDistribuido > 0
        ? Math.round(montoDevengableCents * toAmount(fila.monto) / totalDistribuido)
        : 0;
    asignadoCents += montoCents;
    return { cecoId: fila.ceco_id, amount: fromCents(montoCents), distributed: true };
  });

  if (!hasScopedFilters) return entradas;
  const permitidos = new Set(effectiveCecoIds || []);
  return entradas.filter(entrada => permitidos.has(entrada.cecoId));
};
