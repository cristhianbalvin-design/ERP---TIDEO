const redondear = n => Math.round((n + Number.EPSILON) * 100) / 100;
export function calcularVistaLiquidacion(lineas, moneda, tipoCambio) {
  const base = redondear(lineas.reduce((s, l) => s + Number(l.importe_base || 0), 0));
  const penalidad = redondear(lineas.reduce((s, l) => s + Number(l.penalidad || 0), 0));
  const subtotal = redondear(base - penalidad);
  const igv = redondear(subtotal * 0.18);
  const total = redondear(subtotal + igv);
  const tc = Number(tipoCambio);
  const baseSoles = moneda === 'USD' ? (tc > 0 ? redondear(total * tc) : null) : total;
  const aplica = baseSoles !== null && baseSoles > 700;
  const detraccion = aplica ? (moneda === 'USD' ? redondear(total * 0.1) : Math.round(total * 0.1)) : 0;
  return { base, penalidad, subtotal, igv, total, baseSoles, aplica, detraccion, neto: redondear(total - detraccion) };
}
