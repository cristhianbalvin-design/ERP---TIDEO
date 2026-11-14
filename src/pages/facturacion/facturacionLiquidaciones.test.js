import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularVistaLiquidacion } from './facturacionLiquidaciones.js';

test('suma bases y penalidades y calcula IGV y detracción', () => {
  const r = calcularVistaLiquidacion([{ importe_base: 50000, penalidad: 2443.30 }], 'PEN');
  assert.deepEqual([r.subtotal, r.igv, r.total, r.detraccion, r.neto], [47556.70, 8560.21, 56116.91, 5612, 50504.91]);
});
test('umbral estricto en soles y tipo de cambio para USD', () => {
  assert.equal(calcularVistaLiquidacion([{ importe_base: 700 / 1.18 }], 'PEN').aplica, false);
  assert.equal(calcularVistaLiquidacion([{ importe_base: 600 }], 'PEN').aplica, true);
  assert.equal(calcularVistaLiquidacion([{ importe_base: 200 }], 'USD').baseSoles, null);
  assert.equal(calcularVistaLiquidacion([{ importe_base: 200 }], 'USD', 3).aplica, true);
  assert.equal(calcularVistaLiquidacion([], 'PEN').total, 0);
});
