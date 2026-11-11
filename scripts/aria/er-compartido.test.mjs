import test from 'node:test';
import assert from 'node:assert/strict';
import { desactualizadas } from './er-compartido.mjs';

test('la Edge de Aria usa el mismo Estado de Resultados que la pantalla', () => {
  assert.deepEqual(desactualizadas(), [], 'Ejecuta: node scripts/aria/er-compartido.mjs');
});
