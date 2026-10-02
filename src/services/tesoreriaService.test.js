import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularSaldoCuentaBancaria,
  calcularSaldosCuentasBancarias,
  resumirMovimientosSinCuenta,
} from './tesoreriaService.js';

const cuenta = {
  id: 'cb_test',
  moneda: 'PEN',
  saldo_inicial: 100,
  fecha_saldo_inicial: '2026-09-10',
};

test('con fecha de corte solo cuenta movimientos posteriores', () => {
  const saldo = calcularSaldoCuentaBancaria(cuenta, [
    { id: 'antes', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 50, moneda: 'PEN', fecha: '2026-09-09' },
    { id: 'despues', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 25, moneda: 'PEN', fecha: '2026-09-11' },
  ]);
  assert.equal(saldo, 125);
});

test('el movimiento del mismo día de la fecha de corte no cuenta', () => {
  const resultado = calcularSaldosCuentasBancarias([cuenta], [
    { id: 'mismo-dia', cuenta_bancaria_id: 'cb_test', tipo: 'egreso', monto: 40, moneda: 'PEN', fecha: '2026-09-10' },
  ])[0];
  assert.equal(resultado.saldo, 100);
  assert.equal(resultado.movimientos_excluidos_por_fecha, 1);
});

test('sin fecha de corte cuenta todo y marca sin_fecha_corte', () => {
  const resultado = calcularSaldosCuentasBancarias([{ ...cuenta, fecha_saldo_inicial: null }], [
    { id: 'historico', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 50, moneda: 'PEN', fecha: '2020-01-01' },
  ])[0];
  assert.equal(resultado.saldo, 150);
  assert.equal(resultado.sin_fecha_corte, true);
  assert.equal(resultado.fecha_corte, null);
});

test('una moneda distinta con monto en moneda de cuenta sí cuenta', () => {
  const resultado = calcularSaldosCuentasBancarias([cuenta], [
    { id: 'usd-convertido', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 10, moneda: 'USD', monto_en_moneda_cuenta: 35, fecha: '2026-09-11' },
  ])[0];
  assert.equal(resultado.saldo, 135);
  assert.equal(resultado.movimientos_sin_conversion.cantidad, 0);
});

test('una moneda distinta sin conversión se excluye y se cuenta', () => {
  const resultado = calcularSaldosCuentasBancarias([cuenta], [
    { id: 'usd-sin-conversion', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 10, moneda: 'USD', fecha: '2026-09-11' },
  ])[0];
  assert.equal(resultado.saldo, 100);
  assert.deepEqual(resultado.movimientos_sin_conversion, {
    cantidad: 1,
    monto: { USD: 10 },
    monto_por_moneda: { USD: 10 },
  });
  assert.equal(resultado.saldo_parcial, true);
});

test('movimientos anulados no cuentan', () => {
  const resultado = calcularSaldosCuentasBancarias([cuenta], [
    { id: 'anulado', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 50, moneda: 'PEN', fecha: '2026-09-11', estado: 'anulado' },
  ])[0];
  assert.equal(resultado.saldo, 100);
});

test('movimientos de otra cuenta no cuentan', () => {
  const resultado = calcularSaldosCuentasBancarias([cuenta], [
    { id: 'otra-cuenta', cuenta_bancaria_id: 'cb_other', tipo: 'ingreso', monto: 50, moneda: 'PEN', fecha: '2026-09-11' },
  ])[0];
  assert.equal(resultado.saldo, 100);
  assert.equal(resultado.movimientos_considerados, 0);
});

test('ingreso suma y egreso resta', () => {
  const resultado = calcularSaldosCuentasBancarias([cuenta], [
    { id: 'ingreso', cuenta_bancaria_id: 'cb_test', tipo: 'ingreso', monto: 50, moneda: 'PEN', fecha: '2026-09-11' },
    { id: 'egreso', cuenta_bancaria_id: 'cb_test', tipo: 'egreso', monto: 20, moneda: 'PEN', fecha: '2026-09-12' },
  ])[0];
  assert.equal(resultado.saldo, 130);
});

test('resume movimientos no anulados sin cuenta por moneda', () => {
  assert.deepEqual(resumirMovimientosSinCuenta([
    { id: 'sin-cuenta-1', tipo: 'ingreso', monto: 20, moneda: 'PEN', estado: 'registrado' },
    { id: 'sin-cuenta-2', tipo: 'egreso', monto: 5, moneda: 'USD', estado: 'registrado' },
    { id: 'anulado', tipo: 'ingreso', monto: 99, moneda: 'PEN', estado: 'anulado' },
  ]), { cantidad: 2, monto_por_moneda: { PEN: 20, USD: 5 } });
});
