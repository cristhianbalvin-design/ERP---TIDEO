const redondearCentimos = monto => Math.round((monto + Number.EPSILON) * 100) / 100;

export function convertirEgresoCajaChica({ monedaPago, monto, monedaFondo, tipoCambio }) {
  const pago = String(monedaPago || '').toUpperCase();
  const fondo = String(monedaFondo || '').toUpperCase();
  const original = Number(monto);

  if (!Number.isFinite(original) || original <= 0) {
    throw new Error('El monto del egreso debe ser mayor que cero.');
  }
  if (!['PEN', 'USD', 'EUR'].includes(pago) || !['PEN', 'USD', 'EUR'].includes(fondo)) {
    throw new Error('La moneda del pago o del fondo no está soportada.');
  }

  if (pago === fondo) {
    return { monto: redondearCentimos(original), moneda: fondo };
  }
  if (pago !== 'PEN' && fondo !== 'PEN') {
    throw new Error('No se admite convertir directamente entre USD y EUR.');
  }

  const tc = Number(tipoCambio);
  if (!Number.isFinite(tc) || tc <= 0) {
    throw new Error('No hay tipo de cambio disponible para la fecha del egreso.');
  }

  const convertido = fondo === 'PEN' ? original * tc : original / tc;
  return {
    monto: redondearCentimos(convertido),
    moneda: fondo,
    moneda_original: pago,
    monto_original: redondearCentimos(original),
    tipo_cambio: tc,
  };
}
