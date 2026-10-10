import { describe, expect, it } from 'vitest';
import { armarPayloadRecepcion, cantidadRecibidaPorItemOc, componerObservacion, ordenarUbicacionesPorJerarquia, pendientePorLinea, textoUbicacionDestino, validarCantidades } from '../src/zahory-mock/pages/recepcionOCLogic.js';

describe('recepcionOCLogic', () => {
  it('calcula pendientes con item_id y fallback histórico por material o descripción', () => {
    const oc = { id: 'oc-1', items: [
      { item_id: 'a', material_id: 'm1', descripcion: 'Aceite', cantidad: 10 },
      { item_id: 'b', material_id: 'm2', descripcion: 'Filtro', cantidad: 5 },
    ] };
    const recepciones = [{ orden_compra_id: 'oc-1', items_recibidos: [
      { item_id: 'a', material_id: 'm1', recibido: 3 },
      { material_id: 'm2', descripcion: 'Filtro', recibido: 2 },
    ] }];
    expect(pendientePorLinea(oc, recepciones, 0)).toBe(7);
    expect(pendientePorLinea(oc, recepciones, 1)).toBe(3);
    expect(cantidadRecibidaPorItemOc(recepciones, 'oc-1', oc.items[1], oc.items)).toBe(2);
  });

  it('no usa fallback cuando el item_id recibido pertenece a otra línea de la OC', () => {
    const oc = { id: 'oc-1', items: [
      { item_id: 'a', material_id: 'm1', descripcion: 'Aceite', cantidad: 10 },
      { item_id: 'b', material_id: 'm2', descripcion: 'Filtro', cantidad: 5 },
    ] };
    const recepciones = [{ orden_compra_id: 'oc-1', items_recibidos: [
      { item_id: 'a', descripcion: 'Filtro', recibido: 2 },
    ] }];

    expect(pendientePorLinea(oc, recepciones, 1)).toBe(5);
  });

  it('usa fallback si el item_id recibido no existe en ninguna línea de la OC', () => {
    const oc = { id: 'oc-1', items: [
      { item_id: 'a', material_id: 'm1', descripcion: 'Aceite', cantidad: 10 },
      { item_id: 'b', material_id: 'm2', descripcion: 'Filtro', cantidad: 5 },
    ] };
    const recepciones = [{ orden_compra_id: 'oc-1', items_recibidos: [
      { item_id: 'historico-404', descripcion: 'filtro', recibido: 2 },
    ] }];

    expect(pendientePorLinea(oc, recepciones, 1)).toBe(3);
  });

  it('valida rangos, genera observación y arma solo cantidades positivas', () => {
    const lineas = [{ item_id: 'x', material_id: 'm', descripcion: 'Filtro', pendiente: 4 }, { item_id: 'y', material_id: 'n', descripcion: 'Aceite', pendiente: 2 }, { item_id: 'z', descripcion: 'Manual', pendiente: 1 }];
    expect(validarCantidades(lineas, [4, 0, 0])).toBe(true);
    expect(validarCantidades(lineas, [5, 0, 0])).toBe(false);
    expect(componerObservacion(lineas, { 1: true })).toBe('Líneas observadas: Aceite');
    expect(componerObservacion(lineas, {})).toBe(null);
    expect(armarPayloadRecepcion(null, lineas, [4, 0, 1], { 0: 'u1' })).toEqual([{ idx: 0, recibido: 4, ubicacion_id: 'u1' }]);
  });

  it('ordena ubicaciones por jerarquía y conserva niveles de sangría', () => {
    const resultado = ordenarUbicacionesPorJerarquia([
      { id: 'p', codigo: 'P1', padre_id: 'r', activo: true },
      { id: 'r', codigo: 'R1', padre_id: null, activo: true },
      { id: 'g', codigo: 'GEN', es_general: true, padre_id: null, activo: true },
    ]);
    expect(resultado.map(item => [item.id, item.nivel])).toEqual([['g', 0], ['r', 0], ['p', 1]]);
  });

  it('ordena posiciones directas de zona y pisos, omite inactivas y anota usos no almacenables', () => {
    const resultado = ordenarUbicacionesPorJerarquia([
      { id: 'piso', codigo: 'PISO', tipo: 'piso', padre_id: 'z', activo: true },
      { id: 'pos', codigo: 'POS', tipo: 'posicion', padre_id: 'z', activo: true, uso: 'cuarentena' },
      { id: 'off', codigo: 'OFF', padre_id: 'z', activo: false },
      { id: 'z', codigo: 'Z', tipo: 'zona', activo: true },
    ]);
    expect(resultado.map(item => [item.id, item.nivel])).toEqual([['z', 0], ['piso', 1], ['pos', 1]]);
    expect(textoUbicacionDestino({ codigo: 'Q-1', nombre: 'Zona', uso: 'cuarentena' })).toBe('Q-1 · Zona (cuarentena u observados)');
    expect(textoUbicacionDestino({ codigo: 'Z-1', nombre: 'Zona', uso: 'almacenaje' })).toBe('Z-1 · Zona');
  });
});
