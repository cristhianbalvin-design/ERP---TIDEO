import test from 'node:test';
import assert from 'node:assert/strict';
import { construirVistaInforme } from './informeSnapshot.js';

const hallazgo = (id, extra = {}) => ({ id, incluir_en_informe: true, familia_trabajo_id: 'f', componente_parte: 'Eje', tipo_dano_codigo: 'desgaste', causa_probable_codigo: 'x', condicion: 'fuera_de_tolerancia', riesgo: 'monitorear', accion_recomendada: 'reparar', atribuible_a: 'operacion', ...extra });

test('congela dibujo, dos zonas y mediciones ligadas aunque se excluyan las generales', () => {
  const snapshot = construirVistaInforme({ id: 'd', tipo: 'mantenimiento', hallazgos: [hallazgo('h1', {
    componente_catalogo_id: 'eje', zonas: [{ zona_id: 'v', nombre: 'Vástago', orden: 1, nota: 'superficie' }, { zona_id: 'c', nombre: 'Camisa', orden: 2 }],
    mediciones: [{ medida_id: 'diam', zona_id: 'v', cota: 'Ø20', parametro: 'Diámetro', unidad: 'mm', nominal: 20, minimo: 19.9, maximo: 20.1, medido: 19.8, resultado_calculado: 'fuera_de_rango' }],
  })] }, { incluir_mediciones: false }, { componentes: [{ id: 'eje', nombre: 'Eje', svg: '<svg />', zonas: [{ id: 'v', medidas: [{ id: 'diam', nombre: 'Diámetro', cota: 'Ø20' }] }] }] });
  assert.equal(snapshot.hallazgos[0].dibujo.zonas.length, 2);
  assert.equal(snapshot.hallazgos[0].dibujo.medidas[0].nombre, 'Diámetro');
  assert.equal(snapshot.mediciones.length, 0);
});

test('hallazgo sin componente y snapshot antiguo conservan forma compatible', () => {
  const snapshot = construirVistaInforme({ id: 'd', tipo: 'fabricacion', hallazgos: [hallazgo('h1')] });
  assert.equal(Object.hasOwn(snapshot.hallazgos[0], 'dibujo'), false);
  assert.deepEqual(snapshot.mediciones, []);
});
