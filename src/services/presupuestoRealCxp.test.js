import test from 'node:test';
import assert from 'node:assert/strict';
import { crearFilasRealPresupuestoCxp } from './presupuestoRealCxp.js';

const empresaId = 'empresa-1';
const cuenta = (overrides = {}) => ({
  id: 'cxp-1',
  empresa_id: empresaId,
  orden_compra_id: 'oc-1',
  fecha_emision: '2026-05-15',
  monto_total: 90,
  moneda: 'PEN',
  categoria_er: 'Servicios técnicos',
  estado: 'pendiente',
  concepto: 'Servicio de prueba',
  ...overrides,
});
const filas = (cxp, options = {}) => crearFilasRealPresupuestoCxp({
  cxp: [cxp], empresaId, periodo: '2026-05', ...options,
});

test('incluye una CxP de OC sin distribución en el CECO de cabecera', () => {
  const result = filas(cuenta({ centro_costo_id: 'ceco-a' }));
  assert.deepEqual(result, [{
    cxpId: 'cxp-1', fecha: '2026-05-15', categoriaEr: 'Servicios técnicos', cecoId: 'ceco-a', monto: 90,
    concepto: 'Servicio de prueba', proveedor: undefined, documento: undefined, moneda: 'PEN',
  }]);
});

test('reparte una CxP entre varios CECO', () => {
  const result = filas(cuenta(), {
    cxpDistribucionesCeco: [
      { cxp_id: 'cxp-1', ceco_id: 'ceco-b', monto: 2, empresa_id: empresaId },
      { cxp_id: 'cxp-1', ceco_id: 'ceco-a', monto: 1, empresa_id: empresaId },
    ],
  });
  assert.deepEqual(result.map(({ cecoId, monto }) => ({ cecoId, monto })), [
    { cecoId: 'ceco-a', monto: 30 },
    { cecoId: 'ceco-b', monto: 60 },
  ]);
});

test('el filtro de CECO conserva una sola fila distribuida', () => {
  const result = filas(cuenta(), {
    efectivoCecos: ['ceco-b'],
    cxpDistribucionesCeco: [
      { cxp_id: 'cxp-1', ceco_id: 'ceco-a', monto: 1, empresa_id: empresaId },
      { cxp_id: 'cxp-1', ceco_id: 'ceco-b', monto: 2, empresa_id: empresaId },
    ],
  });
  assert.deepEqual(result.map(({ cecoId, monto }) => ({ cecoId, monto })), [{ cecoId: 'ceco-b', monto: 60 }]);
});

test('no cuenta una CxP ya cubierta por compras_gastos', () => {
  assert.deepEqual(filas(cuenta(), { comprasGastos: [{ cxp_id: 'cxp-1' }] }), []);
});

test('no cuenta una CxP anulada ni una excluida del devengo', () => {
  assert.deepEqual(filas(cuenta({ estado: 'anulada' })), []);
  assert.deepEqual(filas(cuenta({ no_devengar_er: true })), []);
});

test('acepta períodos mensual y anual, y excluye fechas fuera de período', () => {
  assert.equal(filas(cuenta()).length, 1);
  assert.equal(crearFilasRealPresupuestoCxp({ cxp: [cuenta()], empresaId, periodo: '2026' }).length, 1);
  assert.deepEqual(filas(cuenta({ fecha_emision: '2026-06-01' })), []);
});
