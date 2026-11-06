const redondear = (valor, decimales = 2) => Math.round((valor + Number.EPSILON) * 10 ** decimales) / 10 ** decimales;

export function obtenerTcSugerido(registro, moneda) {
  const tasa = Number(registro?.[String(moneda || '').toLowerCase()]);
  return Number.isFinite(tasa) && tasa > 0 ? redondear(1 / tasa, 6) : null;
}

export function calcularTransferencia({ cuentaOrigen, cuentaDestino, monto, tipoCambio, tcReferencia }) {
  if (!cuentaOrigen?.id || !cuentaDestino?.id) throw new Error('Selecciona ambas cuentas.');
  if (cuentaOrigen.id === cuentaDestino.id) throw new Error('Las cuentas deben ser distintas.');
  const origen = String(cuentaOrigen.moneda || 'PEN').toUpperCase();
  const destino = String(cuentaDestino.moneda || 'PEN').toUpperCase();
  const importe = redondear(Number(monto));
  if (!Number.isFinite(importe) || importe <= 0) throw new Error('El monto debe ser mayor a cero.');
  if (origen === destino) return { montoRecibido: importe, diferenciaCambioPen: null };
  if (!['PEN', 'USD', 'EUR'].includes(origen) || !['PEN', 'USD', 'EUR'].includes(destino) || (origen !== 'PEN' && destino !== 'PEN')) throw new Error('La conversión directa entre estas monedas no está soportada.');
  const tc = Number(tipoCambio);
  if (!Number.isFinite(tc) || tc <= 0) throw new Error('Indica un tipo de cambio mayor a cero.');
  const montoRecibido = redondear(origen === 'PEN' ? importe / tc : importe * tc);
  if (montoRecibido <= 0) throw new Error('El monto recibido debe ser mayor a cero.');
  const ref = Number(tcReferencia);
  const diferenciaCambioPen = Number.isFinite(ref) && ref > 0
    ? redondear(origen === 'PEN' ? montoRecibido * ref - importe : montoRecibido - importe * ref)
    : null;
  return { montoRecibido, diferenciaCambioPen };
}
