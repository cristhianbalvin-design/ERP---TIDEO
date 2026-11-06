import test from 'node:test';
import assert from 'node:assert/strict';
import { cambiosNoGastoEdicion, cxpPendiente } from './egresoNoGastoEdicion.js';

for (const [anterior, nuevo, esperado] of [
  [false, false, null],
  [false, true, true],
  [true, false, false],
  [true, true, true],
]) {
  for (const pendiente of [false, true]) {
    test(`edicion ${anterior} -> ${nuevo}, CxP pendiente: ${pendiente}`, () => {
      assert.deepEqual(cambiosNoGastoEdicion({ es_no_gasto: anterior }, { es_no_gasto: nuevo }, pendiente), {
        gasto: esperado === null ? {} : { excluir_de_er: esperado },
        cxp: esperado === null || !pendiente ? null : { no_devengar_er: esperado },
      });
    });
  }
}

test('solo cuentas no pagadas ni anuladas y con saldo son pendientes', () => {
  assert.equal(cxpPendiente({ estado: 'por_pagar', saldo: 10 }), true);
  assert.equal(cxpPendiente({ estado: 'pagada', saldo: 10 }), false);
  assert.equal(cxpPendiente({ estado: 'anulada', saldo: 10 }), false);
  assert.equal(cxpPendiente({ estado: 'por_pagar', saldo: 0 }), false);
  assert.equal(cxpPendiente({ estado: 'por_pagar', monto_total: 10, monto_pagado: 4 }), true);
});
