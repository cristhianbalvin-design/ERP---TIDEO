import test from 'node:test';
import assert from 'node:assert/strict';
import { construirVistaInforme } from '../src/zahory-mock/pages/informeSnapshot.js';

test('informe toma fecha de recepción y usa created_at como respaldo', () => {
  const diagnosis = { id: 'd1', tipo: 'mantenimiento', recepcion_id: 'r1', created_at: '2026-09-01T10:00:00Z', hallazgos: [] };
  assert.equal(construirVistaInforme(diagnosis, {}, {}, { fecha_ingreso: '2026-08-15' }).cabecera.fecha_recepcion, '2026-08-15');
  assert.equal(construirVistaInforme(diagnosis).cabecera.fecha_recepcion, diagnosis.created_at);
});

test('serie y horómetro ausentes permanecen opcionales en el snapshot', () => {
  const snapshot = construirVistaInforme({ id: 'd1', tipo: 'mantenimiento', hallazgos: [] });
  assert.equal(snapshot.cabecera.numero_serie, null);
  assert.equal(snapshot.cabecera.horometro, null);
});
