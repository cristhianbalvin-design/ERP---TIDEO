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

const fechaDia = value => String(value || '').slice(0, 10);
const fechaCorteValida = value => /^\d{4}-\d{2}-\d{2}$/.test(fechaDia(value)) ? fechaDia(value) : null;

export const movimientoTieneConversion = (mov, cuenta, equivalencias = {}) => {
  if (!monedasDifierenMovimientoCuenta(mov, cuenta)) return true;
  if (mov?.monto_en_moneda_cuenta != null && mov?.monto_en_moneda_cuenta !== '') return true;
  const equivalencia = equivalencias[claveEquivalenciaMovimientoCuenta(mov, cuenta)];
  return equivalencia != null && equivalencia !== '' && Number.isFinite(Number(equivalencia));
};

export const movimientoPosteriorAlCorte = (mov, cuenta) => {
  const fechaCorte = fechaCorteValida(cuenta?.fecha_saldo_inicial);
  return !fechaCorte || fechaDia(fechaMovimiento(mov)) > fechaCorte;
};

export const movimientoIncluidoEnSaldoCuenta = (mov, cuenta, equivalencias = {}) =>
  movimientoAsignadoACuenta(mov, cuenta) &&
  movimientoPosteriorAlCorte(mov, cuenta) &&
  movimientoTieneConversion(mov, cuenta, equivalencias);

export function calcularSaldoAcumuladoCuenta(cuenta, movimientos = [], equivalencias = {}) {
  return redondear2(movimientos
    .filter(mov => movimientoIncluidoEnSaldoCuenta(mov, cuenta, equivalencias))
    .reduce((saldo, mov) => {
      const monto = montoMovimientoEnCuenta(mov, cuenta, equivalencias);
      if (esIngreso(mov)) return saldo + monto;
      if (esEgreso(mov)) return saldo - monto;
      return saldo;
    }, Number(cuenta?.saldo_inicial ?? 0)));
}

const diasEnMes = (year, month) => [4, 6, 9, 11].includes(month)
  ? 30
  : month === 2
    ? ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28)
    : 31;

export const diaSiguiente = value => {
  const fecha = fechaCorteValida(value);
  if (!fecha) return null;
  let year = Number(fecha.slice(0, 4));
  let month = Number(fecha.slice(5, 7));
  let day = Number(fecha.slice(8, 10)) + 1;
  if (day > diasEnMes(year, month)) {
    day = 1;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const periodoEmpiezaDespuesDelDiaSiguienteCorte = (fechaCorte, fechaInicio) => {
  const siguiente = diaSiguiente(fechaCorte);
  const inicio = fechaCorteValida(fechaInicio);
  return Boolean(siguiente && inicio && inicio > siguiente);
};

export function analizarSaldoCuentaBancaria(cuenta, movimientos = [], equivalencias = {}) {
  if (!cuenta?.id) {
    return {
      saldo: 0,
      sin_fecha_corte: true,
      fecha_corte: null,
      movimientos_considerados: 0,
      movimientos_excluidos_por_fecha: 0,
      movimientos_sin_conversion: { cantidad: 0, monto: {}, monto_por_moneda: {} },
      saldo_parcial: false,
    };
  }

  const fechaCorte = fechaCorteValida(cuenta.fecha_saldo_inicial);
  const movimientosAsignados = movimientos.filter(mov => movimientoAsignadoACuenta(mov, cuenta));
  const movimientosActivos = movimientosAsignados.filter(mov => mov.estado !== 'anulado');
  const movimientosPosteriores = movimientosActivos.filter(mov => movimientoPosteriorAlCorte(mov, cuenta));
  const movimientosExcluidosPorFecha = fechaCorte
    ? movimientosActivos.filter(mov => fechaDia(fechaMovimiento(mov)) <= fechaCorte)
    : [];
  const movimientosSinConversion = movimientosPosteriores.filter(mov => !movimientoTieneConversion(mov, cuenta, equivalencias));
  const movimientosCalculables = movimientosPosteriores.filter(mov => movimientoTieneConversion(mov, cuenta, equivalencias));
  const montoSinConversion = sumByCurrency(movimientosSinConversion, mov => mov.monto, monedaMovimiento);

  const saldo = calcularSaldoAcumuladoCuenta(cuenta, movimientos, equivalencias);

  return {
    saldo: redondear2(saldo),
    sin_fecha_corte: !fechaCorte,
    fecha_corte: fechaCorte,
    movimientos_considerados: movimientosCalculables.filter(mov => esIngreso(mov) || esEgreso(mov)).length,
    movimientos_excluidos_por_fecha: movimientosExcluidosPorFecha.length,
    movimientos_sin_conversion: {
      cantidad: movimientosSinConversion.length,
      monto: montoSinConversion,
      monto_por_moneda: montoSinConversion,
    },
    saldo_parcial: movimientosSinConversion.length > 0,
  };
}

export function calcularSaldoCuentaBancaria(cuenta, movimientos = [], equivalencias = {}) {
  return analizarSaldoCuentaBancaria(cuenta, movimientos, equivalencias).saldo;
}

export function calcularSaldosCuentasBancarias(cuentas = [], movimientos = [], equivalencias = {}) {
  return cuentas.map(cuenta => {
    const movimientosAsignados = movimientos.filter(mov => movimientoAsignadoACuenta(mov, cuenta)).length;
    const detalleSaldo = analizarSaldoCuentaBancaria(cuenta, movimientos, equivalencias);
    return {
      ...cuenta,
      movimientos_asignados: movimientosAsignados,
      ...detalleSaldo,
    };
  });
}

export function resumirMovimientosSinCuenta(movimientos = []) {
  const filas = movimientos.filter(mov => !movimientoTieneCuentaBancaria(mov) && mov?.estado !== 'anulado');
  return {
    cantidad: filas.length,
    monto_por_moneda: sumByCurrency(filas, mov => mov.monto, monedaMovimiento),
  };
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
