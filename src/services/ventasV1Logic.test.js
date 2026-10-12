import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./finanzasService.js', import.meta.url), 'utf8');
const start = source.indexOf('export function calcularTotalesVentaPreview');
const end = source.indexOf('const stripAccents', start);
const pureSalesHelpers = source.slice(start, end).replaceAll('export function', 'function');
const helpers = runInNewContext(`${pureSalesHelpers}; ({ calcularTotalesVentaPreview, estadoVisibleVenta, saldoVenta })`);
const { calcularTotalesVentaPreview, estadoVisibleVenta, saldoVenta } = helpers;

test('calcula el subtotal e IGV por línea como venta_guardar', () => {
  assert.deepEqual({ ...calcularTotalesVentaPreview([
    { cantidad: 3, precio_unitario: 0.335, afecto_igv: true },
    { cantidad: 1, precio_unitario: 10, afecto_igv: false },
  ]) }, { subtotal: 11.01, igv: 0.18, total: 11.19 });
});

test('una venta sin comprobante no calcula IGV', () => {
  assert.deepEqual({ ...calcularTotalesVentaPreview([
    { cantidad: 2, precio_unitario: 50.125, afecto_igv: true },
  ], 'sin_comprobante') }, { subtotal: 100.25, igv: 0, total: 100.25 });
});

test('deriva estado visible de cobro parcial y saldo sin cruzar monedas', () => {
  const venta = { estado: 'confirmada', monto_total: 120, monto_cobrado: 45, moneda: 'USD' };
  assert.deepEqual({ ...estadoVisibleVenta(venta) }, { estado: 'confirmada', cobroParcial: true, saldo: 75 });
  assert.equal(saldoVenta({ monto_total: 10, monto_cobrado: 12 }), 0);
  assert.equal(estadoVisibleVenta({ estado: 'confirmada', monto_total: 10, monto_cobrado: 10 }).cobroParcial, false);
});
