import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNotificacionSistemaEvent, mapNotificacionSistema, mergeNotificacionesSistema } from './services/notificacionesRealtime.js';

const row = (id, overrides = {}) => ({ id, texto: `Aviso ${id}`, leida: false, created_at: '2026-10-21T12:00:00Z', ...overrides });

test('mapea filas persistidas al formato de la campana', () => {
  const result = mapNotificacionSistema(row('a', { mensaje: 'Mensaje', titulo: 'Título', prioridad: 'alta', leida: true }));
  assert.equal(result.text, 'Mensaje');
  assert.equal(result.title, 'Título');
  assert.equal(result.read, true);
  assert.equal(result.priority, 'alta');
  assert.equal(result._db, true);
});

test('fusiona por id conservando locales y evitando duplicados', () => {
  const local = { id: 'local', text: 'Local', read: false };
  const previous = [mapNotificacionSistema(row('a', { texto: 'anterior' })), local];
  const result = mergeNotificacionesSistema(previous, [row('b'), row('a', { texto: 'actualizado' })]);
  assert.deepEqual(result.map(item => item.id), ['b', 'a', 'local']);
  assert.equal(result[1].text, 'actualizado');
  assert.equal(result[2], local);
});

test('evento INSERT agrega al inicio y UPDATE modifica por id', () => {
  const initial = [mapNotificacionSistema(row('a'))];
  const inserted = applyNotificacionSistemaEvent(initial, row('b'));
  assert.deepEqual(inserted.map(item => item.id), ['b', 'a']);
  const updated = applyNotificacionSistemaEvent(inserted, row('a', { leida: true }));
  assert.equal(updated.find(item => item.id === 'a').read, true);
  assert.equal(updated.length, 2);
});
