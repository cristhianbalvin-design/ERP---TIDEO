const monedas = new Set(['PEN', 'USD', 'EUR']);
const redondear6 = valor => Math.round(valor * 1e6) / 1e6;
const monedaNormalizada = valor => String(valor || '').trim().toUpperCase();

export function solesPorUnidad(historico, moneda) {
  const divisa = monedaNormalizada(moneda);
  if (!['USD', 'EUR'].includes(divisa)) throw new Error(`Moneda no soportada: ${divisa}.`);
  const valor = Number(historico?.[divisa.toLowerCase()]);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`No hay tipo de cambio válido para ${divisa}.`);
  const tasa = redondear6(1 / valor);
  if (!(tasa > 0) || !Number.isFinite(tasa)) throw new Error(`No hay tipo de cambio válido para ${divisa}.`);
  return tasa;
}

export function factorDireccional(origen, destino, tasa) {
  const desde = monedaNormalizada(origen);
  const hacia = monedaNormalizada(destino);
  if (!monedas.has(desde) || !monedas.has(hacia) || (desde !== hacia && desde !== 'PEN' && hacia !== 'PEN')) {
    throw new Error(`Par de monedas no soportado: ${desde} → ${hacia}.`);
  }
  if (desde === hacia) return 1;
  const valor = Number(tasa);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error(`No hay tipo de cambio válido para ${desde} → ${hacia}.`);
  return desde === 'PEN' ? 1 / valor : valor;
}

export function convertirConTasa(monto, origen, destino, tasa) {
  return Number(monto) * factorDireccional(origen, destino, tasa);
}

export function normalizarTipoCambioCxp(valor) {
  if (valor == null) return null;
  const tasa = Number(valor);
  if (!Number.isFinite(tasa) || tasa <= 0) throw new Error('Tipo de cambio de CxP inválido.');
  return tasa < 1 ? redondear6(1 / tasa) : tasa;
}
