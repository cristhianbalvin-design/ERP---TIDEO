import test from 'node:test';
import assert from 'node:assert/strict';
import { ETIQUETA_ESTADO_OF, urlOperaciones } from './services/ordenesFabricacionAdminService.js';

test('arma la URL de Operaciones con parámetros y sin vacíos', () => {
  assert.equal(urlOperaciones('produccion-crear-of', { os: 'osc_1' }), '/operaciones/#/produccion-crear-of?os=osc_1');
  assert.equal(urlOperaciones('produccion-detalle-of', { id: 'abc', extra: '' }), '/operaciones/#/produccion-detalle-of?id=abc');
  assert.equal(urlOperaciones('maestranza-of'), '/operaciones/#/maestranza-of');
});

test('tiene etiqueta para todos los estados de la OF', () => {
  assert.equal(Object.keys(ETIQUETA_ESTADO_OF).length, 9);
  assert.equal(ETIQUETA_ESTADO_OF.lista_entrega, 'Lista para entrega');
});
