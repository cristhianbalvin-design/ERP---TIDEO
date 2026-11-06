import { describe, expect, it } from 'vitest';
import { bajoCosto, buscarMateriales, filtrarCatalogo, formatoPct, margenProducto, payloadProducto, resumenCatalogo, validarProductoCatalogo } from '../src/zahory-mock/pages/wms/catalogoVentaLogic.js';

const items = [
  { id: 'a', codigo: 'QUI-LUB-044', descripcion: 'Grasa de Litio', precio_lista: 25, costo_promedio: 10, moneda: 'PEN', disponible: 108, activo: true },
  { id: 'b', codigo: 'ELE-CAB-032', descripcion: 'Cable Apantallado', precio_lista: 80, costo_promedio: 97.25, moneda: 'PEN', disponible: 0, activo: true },
  { id: 'c', codigo: 'MOT-1', descripcion: 'Motor eléctrico', precio_lista: 900, costo_promedio: 3000, moneda: 'USD', disponible: 1, activo: true },
  { id: 'd', codigo: 'EMB-1', descripcion: 'Caja', precio_lista: 5, costo_promedio: 1, moneda: 'PEN', disponible: 4, activo: false },
];

describe('catálogo de venta', () => {
  it('margen solo en soles y aviso bajo el costo', () => {
    expect(margenProducto(items[0])).toBe(60);
    expect(margenProducto(items[2])).toBeNull();
    expect(bajoCosto(items[1])).toBe(true);
    expect(bajoCosto(items[2])).toBe(false);
    expect(formatoPct(null)).toBe('Sin dato');
  });
  it('resumen cuenta solo activos', () => {
    expect(resumenCatalogo(items)).toEqual({ activos: 3, sinStock: 1, bajoCosto: 1, margenPromedio: 19.22 });
    expect(resumenCatalogo([]).margenPromedio).toBeNull();
  });
  it('filtros y búsqueda sin tildes', () => {
    expect(filtrarCatalogo(items).map(i => i.id)).toEqual(['a', 'b', 'c']);
    expect(filtrarCatalogo(items, { filtro: 'inactivos' }).map(i => i.id)).toEqual(['d']);
    expect(filtrarCatalogo(items, { filtro: 'todos', texto: 'electrico' }).map(i => i.id)).toEqual(['c']);
    expect(buscarMateriales([{ codigo: 'ELE-CAB-015', descripcion: 'Cable' }], 'c')).toEqual([]);
    expect(buscarMateriales([{ codigo: 'ELE-CAB-015', descripcion: 'Cable' }], 'cab')).toHaveLength(1);
  });
  it('validación por campo y payload', () => {
    expect(validarProductoCatalogo({ precio_lista: '', moneda: 'PEN', descuento_maximo_pct: '120' })).toEqual({
      material: 'Elige el material de la lista.', precio_lista: 'Indica el precio de lista.', descuento_maximo_pct: 'Entre 0 y 100.' });
    expect(validarProductoCatalogo({ material: { en_catalogo: true }, precio_lista: '1', moneda: 'PEN' }).material).toMatch(/ya está/);
    expect(validarProductoCatalogo({ precio_lista: '0', moneda: 'PEN' }, { nuevo: false })).toEqual({ precio_lista: 'Indica un precio mayor a cero.' });
    expect(payloadProducto({ material: { material_id: 'm1' }, precio_lista: '45,555', moneda: 'USD', descuento_maximo_pct: '' }))
      .toEqual({ material_id: 'm1', precio_lista: 45.56, moneda: 'USD', descuento_maximo_pct: 0, activo: true });
  });
});
