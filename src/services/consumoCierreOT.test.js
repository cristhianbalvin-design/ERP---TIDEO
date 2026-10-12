import test from 'node:test';
import assert from 'node:assert/strict';
import { restarDespachadoDelConsumo } from './consumoCierreOT.js';

const item = (material_id, cantidad, id = material_id) => ({ id, material_id, cantidad });

test('conserva cantidades cuando no hay despachos conciliados', () => {
  assert.deepEqual(restarDespachadoDelConsumo([item('m1', 4)]), [item('m1', 4)]);
});
test('resta despacho parcial del consumo', () => {
  assert.deepEqual(restarDespachadoDelConsumo([item('m1', 5)], [item('m1', 2)]), [item('m1', 3)]);
});
test('omite un consumo cuando el despacho cubre o supera todo', () => {
  assert.deepEqual(restarDespachadoDelConsumo([item('m1', 2)], [item('m1', 9)]), []);
});
test('reparte el descuento entre varios ítems del mismo material en orden', () => {
  assert.deepEqual(restarDespachadoDelConsumo([item('m1', 2, 'primero'), item('m1', 4, 'segundo')], [item('m1', 3)]), [item('m1', 3, 'segundo')]);
});
test('omite material solo despachado y conserva otros materiales', () => {
  assert.deepEqual(restarDespachadoDelConsumo([item('m1', 2), item('m2', 3)], [item('m1', 2)]), [item('m2', 3)]);
});
