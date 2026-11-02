import test from 'node:test';
import assert from 'node:assert/strict';
import { esCategoriaInversionCajaChica } from './estadoResultadosService.js';

test('identifica categorías de inversión por tipo_sistema aunque tengan otro nombre', () => {
  const config = [{ nombre: 'Activos capitalizables', tipo_sistema: 'inversiones' }];
  assert.equal(esCategoriaInversionCajaChica('Activos capitalizables', config), true);
  assert.equal(esCategoriaInversionCajaChica('Gastos de oficina', config), false);
});

test('conserva categorías que no resuelven como inversiones en ER', () => {
  assert.equal(esCategoriaInversionCajaChica('Categoría sin configuración', []), false);
});
