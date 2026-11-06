import test from 'node:test';
import assert from 'node:assert/strict';
import { convertirEgresoCajaChica } from './cajaChicaConversion.js';

test('convierte PEN desde pago USD y conserva los datos originales', () => {
  assert.deepEqual(convertirEgresoCajaChica({ monedaPago: 'USD', monto: 10, monedaFondo: 'PEN', tipoCambio: 3.47 }), {
    monto: 34.7, moneda: 'PEN', moneda_original: 'USD', monto_original: 10, tipo_cambio: 3.47,
  });
});

test('convierte USD desde pago PEN', () => {
  assert.deepEqual(convertirEgresoCajaChica({ monedaPago: 'PEN', monto: 34.7, monedaFondo: 'USD', tipoCambio: 3.47 }), {
    monto: 10, moneda: 'USD', moneda_original: 'PEN', monto_original: 34.7, tipo_cambio: 3.47,
  });
});

test('misma moneda no agrega datos originales y permite redondear monto', () => {
  assert.deepEqual(convertirEgresoCajaChica({ monedaPago: 'USD', monto: 10.126, monedaFondo: 'USD' }), {
    monto: 10.13, moneda: 'USD',
  });
});

test('rechaza conversiones cuando falta tipo de cambio', () => {
  assert.throws(() => convertirEgresoCajaChica({ monedaPago: 'USD', monto: 10, monedaFondo: 'PEN' }), /tipo de cambio/i);
});

test('rechaza conversiones directas USD a EUR', () => {
  assert.throws(() => convertirEgresoCajaChica({ monedaPago: 'USD', monto: 10, monedaFondo: 'EUR', tipoCambio: 3.47 }), /USD y EUR/i);
});

test('rechaza monto cero', () => {
  assert.throws(() => convertirEgresoCajaChica({ monedaPago: 'PEN', monto: 0, monedaFondo: 'PEN' }), /mayor que cero/i);
});
