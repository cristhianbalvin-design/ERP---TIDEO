import test from 'node:test';
import assert from 'node:assert/strict';
import { solesPorUnidad, convertirConTasa, factorDireccional, normalizarTipoCambioCxp } from './tipoCambioConversion.js';
import { prepararVinculacionMovimientoCuenta } from './tesoreriaService.js';

test('invierte tasas históricas USD y EUR a seis decimales', () => {
  assert.equal(solesPorUnidad({ usd: 0.29 }, 'USD'), 3.448276);
  assert.equal(solesPorUnidad({ eur: 0.25 }, 'EUR'), 4);
});
test('convierte en ambas direcciones y conserva la misma moneda', () => {
  assert.equal(convertirConTasa(340, 'PEN', 'USD', 3.4), 100);
  assert.equal(convertirConTasa(100, 'USD', 'PEN', 3.4), 340);
  assert.equal(convertirConTasa(100, 'EUR', 'PEN', 4), 400);
  assert.equal(convertirConTasa(400, 'PEN', 'EUR', 4), 100);
  assert.equal(convertirConTasa(12, 'USD', 'USD', null), 12);
});
test('rechaza tasas inválidas y pares no soportados', () => {
  assert.throws(() => solesPorUnidad(null, 'USD'), /tipo de cambio válido/);
  assert.throws(() => solesPorUnidad({ usd: 0 }, 'USD'), /tipo de cambio válido/);
  for (const tasa of [null, 0, -1, NaN]) assert.throws(() => convertirConTasa(10, 'PEN', 'USD', tasa), /tipo de cambio válido/);
  assert.throws(() => convertirConTasa(10, 'USD', 'EUR', 3.4), /no soportado/);
  assert.throws(() => convertirConTasa(10, 'EUR', 'USD', 3.4), /no soportado/);
});
test('normaliza tasas históricas de CxP', () => {
  assert.equal(normalizarTipoCambioCxp(0.29), 3.448276);
  assert.equal(normalizarTipoCambioCxp(3.4), 3.4);
  assert.equal(normalizarTipoCambioCxp(null), null);
});
test('factor direccional y vinculación conservan precisión y rechazan falta de TC', () => {
  assert.equal(factorDireccional('USD', 'PEN', 3.448276), 3.448276);
  assert.ok(Math.abs(factorDireccional('PEN', 'USD', 3.448276) - 0.29) < 1e-7);
  const mov = { monto: 100, moneda: 'USD' };
  const cuenta = { id: 'banco', moneda: 'PEN' };
  assert.deepEqual(prepararVinculacionMovimientoCuenta(mov, cuenta, { usd: 0.29 }), { cuenta_bancaria_id: 'banco', tc_aplicado: 3.448276, monto_en_moneda_cuenta: 344.83 });
  assert.throws(() => prepararVinculacionMovimientoCuenta(mov, cuenta, null), /tipo de cambio válido/);
  assert.throws(() => prepararVinculacionMovimientoCuenta(mov, { moneda: 'EUR' }, null), /no soportado/);
  assert.equal(prepararVinculacionMovimientoCuenta(mov, { moneda: 'USD' }, null).monto_en_moneda_cuenta, 100);
});
