import test from 'node:test';
import assert from 'node:assert/strict';
import { repartirStock, repartirLiberacionReserva } from './stockUbicaciones.js';

test('una fila conserva la asignación única anterior', () => {
  const fila = { id: 's1', disponible: 8 };
  assert.deepEqual(repartirStock([fila], 3), { asignaciones: [{ fila, cantidad: 3 }], faltante: 0 });
});

test('reparte parcialmente entre varias filas', () => {
  const filas = [{ id: 'a', disponible: 2 }, { id: 'b', disponible: 5 }];
  const r = repartirStock(filas, 4);
  assert.deepEqual(r.asignaciones.map(a => [a.fila.id, a.cantidad]), [['b', 4]]);
  assert.equal(r.faltante, 0);
});

test('filtra por ubicación indicada', () => {
  const filas = [{ id: 'a', ubicacion_id: 'u1', disponible: 5 }, { id: 'b', ubicacion_id: 'u2', disponible: 5 }];
  assert.deepEqual(repartirStock(filas, 3, 'u2').asignaciones.map(a => a.fila.id), ['b']);
});

test('devuelve faltante cuando no alcanza el stock', () => {
  assert.equal(repartirStock([{ id: 'a', disponible: 2 }], 5).faltante, 3);
});

test('ordena por vencimiento, disponible e id estable', () => {
  const filas = [
    { id: 'z', disponible: 3, vencimiento: null },
    { id: 'b', disponible: 2, vencimiento: '2026-01-01' },
    { id: 'c', disponible: 4, vencimiento: '2026-01-01' },
    { id: 'a', disponible: 4, vencimiento: '2026-01-01' },
  ];
  const r = repartirStock(filas, 14);
  assert.deepEqual(r.asignaciones.map(a => a.fila.id), ['a', 'c', 'b', 'z']);
  assert.equal(r.faltante, 1);
});

test('libera reservas en varias filas', () => {
  const filas = [{ id: 'a', reservado: 2, disponible: 1 }, { id: 'b', reservado: 4, disponible: 3 }];
  const r = repartirLiberacionReserva(filas, 5);
  assert.deepEqual(r.asignaciones.map(a => [a.fila.id, a.cantidad]), [['b', 4], ['a', 1]]);
  assert.equal(r.faltante, 0);
});

test('cantidades cero o negativas no asignan nada', () => {
  const filas = [{ id: 'a', disponible: 5, reservado: 5 }];
  assert.deepEqual(repartirStock(filas, 0), { asignaciones: [], faltante: 0 });
  assert.deepEqual(repartirStock(filas, -2), { asignaciones: [], faltante: 0 });
  assert.deepEqual(repartirLiberacionReserva(filas, 0), { asignaciones: [], faltante: 0 });
  assert.deepEqual(repartirLiberacionReserva(filas, -2), { asignaciones: [], faltante: 0 });
});
