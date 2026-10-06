import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEntradasDevengoCxp, resolverCecosCxP, resumirCecosCxP } from './cxpDistribucionCeco.js';

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

const centrosCosto = [
  { id: 'ceco-a', codigo: 'A-01', nombre: 'Administración' },
  { id: 'ceco-b', codigo: 'B-02', nombre: 'Operaciones' },
  { id: 'ceco-cabecera', codigo: 'C-03', nombre: 'Cabecera' },
];

test('sin distribución usa el CECO de cabecera con su monto', () => {
  assert.deepEqual(resolverCecosCxP(cxp(42, { monto_total: 42 })), [
    { cecoId: 'ceco-cabecera', monto: 42, distribuido: false },
  ]);
});

test('sin distribución ni cabecera queda Sin CECO', () => {
  assert.deepEqual(resolverCecosCxP(cxp(42, { centro_costo_id: null })), []);
  assert.equal(resumirCecosCxP(cxp(42, { centro_costo_id: null }), [], centrosCosto).etiqueta, 'Sin CECO');
});

test('una distribución muestra el CECO con código y nombre', () => {
  const resumen = resumirCecosCxP(cxp(42), [{ ceco_id: 'ceco-a', monto: 42 }], centrosCosto);
  assert.deepEqual(resumen.filas, [{ cecoId: 'ceco-a', monto: 42, distribuido: true }]);
  assert.equal(resumen.etiqueta, 'A-01 - Administración');
});

test('varias distribuciones muestran la etiqueta Múltiples', () => {
  const resumen = resumirCecosCxP(cxp(42), [
    { ceco_id: 'ceco-a', monto: 20 },
    { ceco_id: 'ceco-b', monto: 22 },
  ], centrosCosto);
  assert.equal(resumen.etiqueta, 'Múltiples (2)');
  assert.equal(resumen.detalle, 'A-01 - Administración | B-02 - Operaciones');
});

test('las distribuciones se ordenan establemente por CECO', () => {
  assert.deepEqual(resolverCecosCxP(cxp(42), [
    { ceco_id: 'ceco-b', monto: 20 },
    { ceco_id: 'ceco-a', monto: 10 },
    { ceco_id: 'ceco-b', monto: 12 },
  ]), [
    { cecoId: 'ceco-a', monto: 10, distribuido: true },
    { cecoId: 'ceco-b', monto: 20, distribuido: true },
    { cecoId: 'ceco-b', monto: 12, distribuido: true },
  ]);
});
