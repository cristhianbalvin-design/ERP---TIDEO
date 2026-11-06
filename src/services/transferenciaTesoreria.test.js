import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularTransferencia, obtenerTcSugerido } from './transferenciaTesoreria.js';

const cuenta = (id, moneda) => ({ id, moneda });
const calcular = (origen, destino, monto, tipoCambio, tcReferencia) => calcularTransferencia({ cuentaOrigen: origen, cuentaDestino: destino, monto, tipoCambio, tcReferencia });
test('transferencias y conversión en ambas direcciones', () => {
  assert.equal(calcular(cuenta('a', 'PEN'), cuenta('b', 'PEN'), 100).montoRecibido, 100);
  assert.deepEqual(calcular(cuenta('a', 'PEN'), cuenta('b', 'USD'), 400, 4, 3.8), { montoRecibido: 100, diferenciaCambioPen: -20 });
  assert.deepEqual(calcular(cuenta('a', 'USD'), cuenta('b', 'PEN'), 100, 4, 3.8), { montoRecibido: 400, diferenciaCambioPen: 20 });
});
test('valida cuentas, monto y conversión', () => {
  assert.throws(() => calcular(cuenta('a', 'PEN'), cuenta('a', 'PEN'), 1), /distintas/);
  assert.throws(() => calcular(cuenta('a', 'PEN'), cuenta('b', 'PEN'), 0), /mayor a cero/);
  assert.throws(() => calcular(cuenta('a', 'PEN'), cuenta('b', 'USD'), 1), /tipo de cambio/);
  assert.throws(() => calcular(cuenta('a', 'USD'), cuenta('b', 'EUR'), 1, 4), /no está soportada/);
});
test('invierte la tasa histórica de PEN a moneda extranjera', () => {
  assert.equal(obtenerTcSugerido({ usd: 0.25 }, 'USD'), 4);
  assert.equal(obtenerTcSugerido({ eur: 0 }, 'EUR'), null);
});

test('transferencias no alteran los totales de ingresos y egresos, pero sí los saldos', async () => {
  const { calcularMovimientosMesPorMoneda, calcularSaldoCuentaBancaria, buildTesoreriaSummary } = await import('./tesoreriaService.js');
  const movimientos = [
    { tipo: 'egreso', monto: 50, moneda: 'PEN', cuenta_bancaria_id: 'a', fecha: '2026-10-01', vinculo_tipo: 'transferencia_cuenta' },
    { tipo: 'ingreso', monto: 50, moneda: 'PEN', cuenta_bancaria_id: 'b', fecha: '2026-10-01', vinculo_tipo: 'transferencia_cuenta' },
    { tipo: 'ingreso', monto: 20, moneda: 'PEN', fecha: '2026-10-01' },
  ];
  assert.deepEqual(calcularMovimientosMesPorMoneda(movimientos, 'ingreso', '2026-10'), { PEN: 20 });
  assert.deepEqual(calcularMovimientosMesPorMoneda(movimientos, 'egreso', '2026-10'), {});
  assert.equal(calcularSaldoCuentaBancaria({ id: 'a', moneda: 'PEN', saldo_inicial: 100 }, movimientos), 50);
  assert.equal(calcularSaldoCuentaBancaria({ id: 'b', moneda: 'PEN', saldo_inicial: 0 }, movimientos), 50);
  assert.deepEqual(buildTesoreriaSummary({ movimientos, periodo: '2026-10' }).ingresosPorMoneda, { PEN: 20 });
});
