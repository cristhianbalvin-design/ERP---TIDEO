import assert from 'node:assert/strict';
import test from 'node:test';
import { agruparFotosEnFilas } from '../src/services/informeFotosFilas.js';

test('agrupa por orientación consecutiva con máximos de dos y tres fotos', () => {
  const fotos = [
    { id: 'h1', width: 1200, height: 800 }, { id: 'h2', width: 900, height: 600 },
    { id: 'h3', width: 800, height: 500 }, { id: 'v1', width: 600, height: 900 },
    { id: 'v2', width: 500, height: 800 }, { id: 'v3', width: 400, height: 700 },
    { id: 'v4', width: 300, height: 500 }, { id: 'square', width: 500, height: 500 },
  ];
  assert.deepEqual(agruparFotosEnFilas(fotos).map(row => ({
    orientacion: row.orientacion, ids: row.fotos.map(photo => photo.id),
  })), [
    { orientacion: 'horizontal', ids: ['h1', 'h2'] },
    { orientacion: 'horizontal', ids: ['h3'] },
    { orientacion: 'vertical', ids: ['v1', 'v2', 'v3'] },
    { orientacion: 'vertical', ids: ['v4'] },
    { orientacion: 'horizontal', ids: ['square'] },
  ]);
});

test('retorna una lista vacía sin fotos', () => assert.deepEqual(agruparFotosEnFilas([]), []));
