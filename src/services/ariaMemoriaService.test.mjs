import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorFecha, mensajesDelPanel } from './ariaMemoriaService.js';

test('mensajes guardados se convierten al panel y solo el último conserva botones', () => {
  const m = mensajesDelPanel([
    { rol: 'user', contenido: 'hola', extra: {} },
    { rol: 'assistant', contenido: '¿Qué fondo?', extra: { herramientas: ['x'], opciones: { titulo: 'Elige', items: [] } } },
    { rol: 'user', contenido: 'Taller', extra: {} },
    { rol: 'assistant', contenido: 'Listo', extra: { borrador: { id: 'b1' }, opciones: { titulo: 'CECO', items: [] } } },
    { rol: 'system', contenido: 'no' },
  ]);
  assert.equal(m.length, 4);
  assert.deepEqual(m[1].herramientas, ['x']);
  assert.equal(m[1].opciones, null);
  assert.deepEqual(m[3].opciones, { titulo: 'CECO', items: [] }, 'el último mensaje válido conserva sus botones');
  assert.deepEqual(m[3].borrador, { id: 'b1' });
  assert.deepEqual(mensajesDelPanel(null), []);
});

test('agrupa por Hoy, Ayer, Esta semana y Anteriores', () => {
  const ahora = new Date('2026-11-10T22:00:00Z');
  const g = agruparPorFecha([
    { id: 1, actualizado_en: '2026-11-10T21:00:00Z' },
    { id: 2, actualizado_en: '2026-11-09T21:00:00Z' },
    { id: 3, actualizado_en: '2026-11-06T21:00:00Z' },
    { id: 4, actualizado_en: '2026-10-20T21:00:00Z' },
  ], ahora);
  assert.deepEqual(g.map(x => `${x.nombre}:${x.items.map(i => i.id).join(',')}`), ['Hoy:1', 'Ayer:2', 'Esta semana:3', 'Anteriores:4']);
});
