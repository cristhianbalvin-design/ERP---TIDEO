import { formatCurrencyTotals, sumByCurrency } from '../lib/currency.js';

const isInPeriod = (date, period) => String(date || '').slice(0, 7) === period;

export function buildTesoreriaSummary({
  movimientos = [],
  empresa,
  periodo = '2026-04',
  saldosIniciales = { PEN: 490900 },
} = {}) {
  const movimientosEmpresa = movimientos.filter(mov =>
    (!empresa?.id || mov.empresa_id === empresa.id) &&
    (!periodo || isInPeriod(mov.fecha, periodo))
  );

  const ingresosPorMoneda = sumByCurrency(
    movimientosEmpresa.filter(mov => mov.tipo === 'ingreso' || mov.tipo === 'credito'),
    mov => mov.monto,
    mov => mov.moneda || 'PEN'
  );
  const egresosPorMoneda = sumByCurrency(
    movimientosEmpresa.filter(mov => mov.tipo === 'egreso' || mov.tipo === 'debito'),
    mov => mov.monto,
    mov => mov.moneda || 'PEN'
  );
  const saldoPorMoneda = { ...saldosIniciales };

  Object.entries(ingresosPorMoneda).forEach(([moneda, monto]) => {
    saldoPorMoneda[moneda] = (saldoPorMoneda[moneda] || 0) + monto;
  });
  Object.entries(egresosPorMoneda).forEach(([moneda, monto]) => {
    saldoPorMoneda[moneda] = (saldoPorMoneda[moneda] || 0) - monto;
  });

  return {
    movimientosEmpresa,
    ingresosPorMoneda,
    egresosPorMoneda,
    saldoPorMoneda,
    saldoDisplay: formatCurrencyTotals(saldoPorMoneda),
    ingresosDisplay: formatCurrencyTotals(ingresosPorMoneda),
    egresosDisplay: formatCurrencyTotals(egresosPorMoneda),
  };
}
