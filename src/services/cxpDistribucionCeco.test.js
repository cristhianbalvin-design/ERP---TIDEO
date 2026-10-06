import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEntradasDevengoCxp } from './cxpDistribucionCeco.js';

const cxp = (devengoAmount, overrides = {}) => ({
  id: 'cxp-1',
  centro_costo_id: 'ceco-cabecera',
  devengoAmount,
  ...overrides,
});

test('reparte proporcionalmente con redondeo exacto en la última fila ordenada', () => {
  const filas = [
    { ceco_id: 'ceco-b', monto: 1 },
    { ceco_id: 'ceco-a', monto: 1 },
    { ceco_id: 'ceco-c', monto: 1 },
  ];
  const result = crearEntradasDevengoCxp(cxp(10), filas);
  assert.deepEqual(result, [
    { cecoId: 'ceco-a', amount: 3.33, distributed: true },
    { cecoId: 'ceco-b', amount: 3.33, distributed: true },
    { cecoId: 'ceco-c', amount: 3.34, distributed: true },
  ]);
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), 10);
});

test('distribuye una fila a un solo CECO', () => {
  assert.deepEqual(
    crearEntradasDevengoCxp(cxp(25), [{ ceco_id: 'ceco-a', monto: 25 }]),
    [{ cecoId: 'ceco-a', amount: 25, distributed: true }],
  );
});

test('distribuye varias filas proporcionalmente', () => {
  assert.deepEqual(
    crearEntradasDevengoCxp(cxp(90), [
      { ceco_id: 'ceco-a', monto: 1 },
      { ceco_id: 'ceco-b', monto: 2 },
    ]),
    [
      { cecoId: 'ceco-a', amount: 30, distributed: true },
      { cecoId: 'ceco-b', amount: 60, distributed: true },
    ],
  );
});

test('un filtro CECO conserva solo su fila sin recalcular la proporción', () => {
  assert.deepEqual(
    crearEntradasDevengoCxp(cxp(90), [
      { ceco_id: 'ceco-a', monto: 1 },
      { ceco_id: 'ceco-b', monto: 2 },
    ], { hasScopedFilters: true, effectiveCecoIds: ['ceco-b'] }),
    [{ cecoId: 'ceco-b', amount: 60, distributed: true }],
  );
});

test('CxP sin distribución se excluye con filtro', () => {
  assert.deepEqual(
    crearEntradasDevengoCxp(cxp(42), [], { hasScopedFilters: true, effectiveCecoIds: ['ceco-cabecera'] }),
    [],
  );
});

test('CxP sin distribución conserva su CECO de cabecera en el reporte global', () => {
  assert.deepEqual(
    crearEntradasDevengoCxp(cxp(42)),
    [{ cecoId: 'ceco-cabecera', amount: 42, distributed: false }],
  );
});

test('el monto devengable cero produce filas distribuidas con monto cero', () => {
  assert.deepEqual(
    crearEntradasDevengoCxp(cxp(0), [
      { ceco_id: 'ceco-a', monto: 1 },
      { ceco_id: 'ceco-b', monto: 2 },
    ]),
    [
      { cecoId: 'ceco-a', amount: 0, distributed: true },
      { cecoId: 'ceco-b', amount: 0, distributed: true },
    ],
  );
});
