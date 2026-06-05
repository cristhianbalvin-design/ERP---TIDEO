import { formatCurrencyTotals, sumByCurrency } from '../lib/currency.js';
import { convertirMonto } from './tipoCambioService.js';

const fechaMovimiento = mov =>
  mov?.fecha || mov?.fecha_movimiento || mov?.fecha_operacion || mov?.created_at || mov?.creado_en || '';

const isInPeriod = (mov, period) => String(fechaMovimiento(mov) || '').slice(0, 7) === period;

const tipoMovimiento = mov => String(mov?.tipo || '').toLowerCase();
const esIngreso = mov => ['ingreso', 'credito', 'crédito'].includes(tipoMovimiento(mov));
const esEgreso = mov => ['egreso', 'debito', 'débito'].includes(tipoMovimiento(mov));
const monedaMovimiento = mov => mov?.moneda || 'PEN';
const normalizarMoneda = moneda => String(moneda || 'PEN').trim().toUpperCase();
const redondear2 = value => Math.round((Number(value) || 0) * 100) / 100;
export const claveEquivalenciaMovimientoCuenta = (mov, cuenta) => `${mov?.id || ''}:${cuenta?.id || mov?.cuenta_bancaria_id || ''}`;

const perteneceCuenta = (mov, cuentaId) => {
  if (!cuentaId) return true;
  return mov?.cuenta_bancaria_id === cuentaId || mov?.cuenta_id === cuentaId;
};

export const movimientoTieneCuentaBancaria = mov => Boolean(mov?.cuenta_bancaria_id);

export function obtenerFactorTcAplicado(origen, destino, tc) {
  const monedaOrigen = normalizarMoneda(origen);
  const monedaDestino = normalizarMoneda(destino);
  if (monedaOrigen === monedaDestino) return 1;
  if (!tc) return null;
  if (monedaOrigen === 'PEN' && monedaDestino === 'USD') return tc.usd || null;
  if (monedaOrigen === 'USD' && monedaDestino === 'PEN') return tc.usd ? redondear2(1 / tc.usd) : null;
  if (monedaOrigen === 'PEN' && monedaDestino === 'EUR') return tc.eur || null;
  if (monedaOrigen === 'EUR' && monedaDestino === 'PEN') return tc.eur ? redondear2(1 / tc.eur) : null;
  return null;
}

export function prepararVinculacionMovimientoCuenta(movimiento, cuentaBancaria, tipoCambio) {
  const monedaMov = normalizarMoneda(monedaMovimiento(movimiento));
  const monedaCuenta = normalizarMoneda(cuentaBancaria?.moneda);
  const mismoMoneda = monedaMov === monedaCuenta;
  const monto = redondear2(movimiento?.monto);
  const montoEnMonedaCuenta = mismoMoneda
    ? monto
    : convertirMonto(monto, monedaMov, monedaCuenta, tipoCambio);

  return {
    cuenta_bancaria_id: cuentaBancaria?.id || null,
    tc_aplicado: mismoMoneda ? 1 : obtenerFactorTcAplicado(monedaMov, monedaCuenta, tipoCambio),
    monto_en_moneda_cuenta: redondear2(montoEnMonedaCuenta),
  };
}

export function prepararDesvinculacionMovimientoCuenta() {
  return {
    cuenta_bancaria_id: null,
    tc_aplicado: null,
    monto_en_moneda_cuenta: null,
  };
}

export const movimientoAsignadoACuenta = (mov, cuenta) =>
  Boolean(cuenta?.id) && mov?.cuenta_bancaria_id === cuenta.id && mov?.estado !== 'anulado';

export const monedasDifierenMovimientoCuenta = (mov, cuenta) =>
  normalizarMoneda(monedaMovimiento(mov)) !== normalizarMoneda(cuenta?.moneda);

export const montoMovimientoEnCuenta = (mov, cuenta, equivalencias = {}) => {
  const monedaCuenta = normalizarMoneda(cuenta?.moneda);
  const monedaMov = normalizarMoneda(monedaMovimiento(mov));
  if (monedaMov === monedaCuenta) return Number(mov?.monto || 0);
  if (mov?.monto_en_moneda_cuenta != null && mov?.monto_en_moneda_cuenta !== '') {
    return Number(mov.monto_en_moneda_cuenta || 0);
  }
  return Number(equivalencias[claveEquivalenciaMovimientoCuenta(mov, cuenta)] || 0);
};

export function calcularSaldoCuentaBancaria(cuenta, movimientos = [], equivalencias = {}) {
  if (!cuenta?.id) return 0;
  const saldoInicial = Number(cuenta?.saldo_inicial ?? 0);
  return movimientos
    .filter(mov => movimientoAsignadoACuenta(mov, cuenta))
    .reduce((saldo, mov) => {
      const monto = montoMovimientoEnCuenta(mov, cuenta, equivalencias);
      if (esIngreso(mov)) return saldo + monto;
      if (esEgreso(mov)) return saldo - monto;
      return saldo;
    }, saldoInicial);
}

export function calcularSaldosCuentasBancarias(cuentas = [], movimientos = [], equivalencias = {}) {
  return cuentas.map(cuenta => {
    const movimientosAsignados = movimientos.filter(mov => movimientoAsignadoACuenta(mov, cuenta)).length;
    return {
      ...cuenta,
      movimientos_asignados: movimientosAsignados,
      saldo: redondear2(calcularSaldoCuentaBancaria(cuenta, movimientos, equivalencias)),
    };
  });
}

export function calcularTotalesPorMonedaCuentas(cuentas = []) {
  return cuentas.reduce((acc, cuenta) => {
    const moneda = normalizarMoneda(cuenta?.moneda);
    return { ...acc, [moneda]: (acc[moneda] || 0) + Number(cuenta?.saldo || 0) };
  }, {});
}

export function calcularMovimientosSinCuentaPorMoneda(movimientos = []) {
  const rows = movimientos.filter(mov => !movimientoTieneCuentaBancaria(mov) && mov?.estado !== 'anulado');
  const ingresos = sumByCurrency(rows.filter(esIngreso), mov => mov.monto, monedaMovimiento);
  const egresos = sumByCurrency(rows.filter(esEgreso), mov => mov.monto, monedaMovimiento);
  return Object.keys({ ...ingresos, ...egresos }).reduce((acc, moneda) => ({
    ...acc,
    [moneda]: Number(ingresos[moneda] || 0) - Number(egresos[moneda] || 0),
  }), {});
}

export function calcularMovimientosMesPorMoneda(movimientos = [], tipo = 'ingreso', periodo = new Date().toISOString().slice(0, 7)) {
  const predicadoTipo = tipo === 'egreso' ? esEgreso : esIngreso;
  return sumByCurrency(
    movimientos.filter(mov =>
      mov?.estado !== 'anulado' &&
      predicadoTipo(mov) &&
      (!periodo || String(fechaMovimiento(mov) || '').slice(0, 7) === periodo)
    ),
    mov => mov.monto,
    monedaMovimiento
  );
}

export function buildTesoreriaSummary({
  movimientos = [],
  empresa,
  periodo = new Date().toISOString().slice(0, 7),
  saldosIniciales = {},
  cuentaBancariaId = '',
} = {}) {
  const movimientosEmpresa = movimientos.filter(mov =>
    (!empresa?.id || mov.empresa_id === empresa.id) &&
    perteneceCuenta(mov, cuentaBancariaId)
  );
  const movimientosPeriodo = movimientosEmpresa.filter(mov =>
    !periodo || isInPeriod(mov, periodo)
  );

  const ingresosPorMoneda = sumByCurrency(
    movimientosPeriodo.filter(esIngreso),
    mov => mov.monto,
    monedaMovimiento
  );
  const egresosPorMoneda = sumByCurrency(
    movimientosPeriodo.filter(esEgreso),
    mov => mov.monto,
    monedaMovimiento
  );
  const saldoPorMoneda = { ...saldosIniciales };

  const ingresosHistoricos = sumByCurrency(movimientosEmpresa.filter(esIngreso), mov => mov.monto, monedaMovimiento);
  const egresosHistoricos = sumByCurrency(movimientosEmpresa.filter(esEgreso), mov => mov.monto, monedaMovimiento);

  Object.entries(ingresosHistoricos).forEach(([moneda, monto]) => {
    saldoPorMoneda[moneda] = (saldoPorMoneda[moneda] || 0) + monto;
  });
  Object.entries(egresosHistoricos).forEach(([moneda, monto]) => {
    saldoPorMoneda[moneda] = (saldoPorMoneda[moneda] || 0) - monto;
  });

  return {
    movimientosEmpresa,
    movimientosPeriodo,
    ingresosPorMoneda,
    egresosPorMoneda,
    saldoPorMoneda,
    saldoDisplay: formatCurrencyTotals(saldoPorMoneda),
    ingresosDisplay: formatCurrencyTotals(ingresosPorMoneda),
    egresosDisplay: formatCurrencyTotals(egresosPorMoneda),
  };
}
