import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDebtSummary,
  cuentasParaFinanciamiento,
  estadoFinanciamiento,
  fechaPeriodo,
  generarAmortizacion,
  proyectarPeriodosInteresSaldo,
  tasaMensualDe,
  tcSugerido,
  teaEquivalente,
} from './financiamientosService.js';

test('tasaMensualDe convierte TEA, TNA y TEM igual que el servidor', () => {
  assert.equal(Number(tasaMensualDe(13.4, 'TEA').toFixed(6)), 0.010534);
  assert.equal(Number(tasaMensualDe(12, 'TNA').toFixed(6)), 0.01);
  assert.equal(tasaMensualDe(10, 'TEM'), 0.1);
  assert.equal(Number((teaEquivalente(0.1) * 100).toFixed(2)), 213.84);
});

test('fechaPeriodo respeta el día de corte y el fin de mes', () => {
  assert.equal(fechaPeriodo('2026-09-18', 18, 2), '2026-11-18');
  assert.equal(fechaPeriodo('2026-01-31', 31, 1), '2026-02-28');
  assert.equal(fechaPeriodo('2026-10-29', null, 1), '2026-11-29');
});

test('cuota fija con TEA usa la tasa efectiva mensual (préstamo BBVA real)', () => {
  const tabla = generarAmortizacion({ monto: 344497.84, tasaAnual: 13.4, tipoTasa: 'TEA', plazoMeses: 33, mesesGracia: 0, fechaDesembolso: '2026-11-10', diaPago: 10, tipoCuota: 'frances' });
  assert.equal(tabla.length, 33);
  assert.equal(tabla[0].interes, 3629.07);
  assert.equal(tabla[0].total, 12413.13);
  assert.equal(tabla[32].saldo, 0);
});

test('interés sobre saldo: primer interés es 10 % del capital un mes después', () => {
  const [p] = proyectarPeriodosInteresSaldo({ monto: 3000, tasa: 10, fechaDesembolso: '2026-09-18', diaPago: 18 });
  assert.deepEqual([p.fecha, p.interes, p.capital, p.saldo_base], ['2026-10-18', 300, 0, 3000]);
  const viaGenerar = generarAmortizacion({ monto: 3000, tasaAnual: 10, fechaDesembolso: '2026-09-18', diaPago: 18, tipoCuota: 'interes_saldo' });
  assert.equal(viaGenerar[0].interes, 300);
});

test('estadoFinanciamiento marca atrasado con días y monto vencido', () => {
  const f = { estado: 'vigente', tabla_amortizacion: [
    { numero: 1, fecha: '2026-10-25', total: 200, estado: 'pagada' },
    { numero: 2, fecha: '2026-11-10', total: 166, estado: 'pendiente' },
    { numero: 3, fecha: '2026-12-10', total: 166, estado: 'futura' },
  ] };
  const e = estadoFinanciamiento(f, '2026-11-12');
  assert.equal(e.estado, 'atrasado');
  assert.equal(e.diasAtraso, 2);
  assert.equal(e.montoVencido, 166);
  assert.equal(estadoFinanciamiento({ ...f, estado: 'cancelado' }, '2026-11-12').estado, 'cancelado');
});

test('buildDebtSummary suma lo que vence en el mes, lo vencido y los intereses del año por moneda', () => {
  const mic = [
    { saldo: 3000, n: 300, fecha: '2026-11-18' },
    { saldo: 1500, n: 150, fecha: '2026-11-21' },
    { saldo: 1660, n: 166, fecha: '2026-11-25' },
    { saldo: 5000, n: 500, fecha: '2026-11-25' },
    { saldo: 3000, n: 300, fecha: '2026-11-29' },
  ].map((x, i) => ({
    id: `f${i}`, estado: 'vigente', moneda: 'USD', saldo_pendiente: x.saldo,
    tabla_amortizacion: [{ numero: 2, fecha: x.fecha, interes: x.n, total: x.n, estado: 'pendiente' }],
    pagos_realizados: i === 2 ? [{ fecha_pago: '2026-10-25', interes: 200, moneda: 'USD' }] : [],
  }));
  const banco = { id: 'b', estado: 'vigente', moneda: 'PEN', saldo_pendiente: 344497.84,
    tabla_amortizacion: [{ numero: 3, fecha: '2026-11-10', interes: 3846.89, total: 12538.17, estado: 'pagada' }, { numero: 4, fecha: '2026-12-10', interes: 3629.07, total: 12413.13, estado: 'futura' }],
    pagos_realizados: [] };
  const r = buildDebtSummary([...mic, banco], '2026-11-12');
  assert.deepEqual(r.deudaTotalPorMoneda, { USD: 14160, PEN: 344497.84 });
  assert.deepEqual(r.cuotasMesPorMoneda, { USD: 1416 });
  assert.deepEqual(r.vencidoPorMoneda, {});
  assert.deepEqual(r.interesesPagadosAnioPorMoneda, { USD: 200 });
  assert.equal(r.atrasados, 0);
});

test('tcSugerido expresa unidades de la cuenta por 1 unidad del préstamo', () => {
  assert.equal(tcSugerido('USD', 'PEN', 0.2667), 3.7495);
  assert.equal(tcSugerido('PEN', 'USD', 0.2667), 0.2667);
  assert.equal(tcSugerido('USD', 'USD', 0.2667), null);
  assert.equal(tcSugerido('USD', 'PEN', null), null);
});

test('cuentasParaFinanciamiento deja activas, sin detracciones y de la sociedad del préstamo', () => {
  const cuentas = [
    { id: 'a', empresa_id: 'e', estado: 'activo', sociedad_id: 's1' },
    { id: 'b', empresa_id: 'e', estado: 'inactivo', sociedad_id: 's1' },
    { id: 'c', empresa_id: 'e', estado: 'activo', es_cuenta_detracciones: true },
    { id: 'd', empresa_id: 'e', estado: 'activo', sociedad_id: 's2' },
    { id: 'f', empresa_id: 'e', estado: 'activo', sociedad_id: null },
    { id: 'g', empresa_id: 'x', estado: 'activo' },
  ];
  assert.deepEqual(cuentasParaFinanciamiento(cuentas, { empresaId: 'e', sociedadId: 's1' }).map(c => c.id), ['a', 'f']);
  assert.deepEqual(cuentasParaFinanciamiento(cuentas, { empresaId: 'e' }).map(c => c.id), ['a', 'd', 'f']);
});
