import { describe, expect, it } from 'vitest';
import { calcularChipsUbicaciones, construirArbolUbicaciones, etiquetaTipoUbicacion } from '../src/zahory-mock/pages/ubicacionesLogic.js';

const ubicaciones = [
  { id: 'g', almacen_id: 'a', codigo: 'GEN', nombre: 'General', tipo: 'general', es_general: true, activo: true },
  { id: 'z2', almacen_id: 'a', codigo: 'Z-2', nombre: 'Zona dos', tipo: 'zona', activo: true },
  { id: 'r10', almacen_id: 'a', codigo: 'R-10', nombre: 'Rack diez', tipo: 'rack', padre_id: 'z2', activo: true },
  { id: 'p1', almacen_id: 'a', codigo: 'P-1', nombre: 'Posición uno', tipo: 'posicion', padre_id: 'r10', activo: true },
  { id: 'z1', almacen_id: 'a', codigo: 'Z-1', nombre: 'Zona uno', tipo: 'zona', activo: true },
  { id: 'other', almacen_id: 'b', codigo: 'Z-0', nombre: 'Otra zona', tipo: 'zona', activo: true },
];
const stock = [
  { almacen_id: 'a', ubicacion_id: 'g', material_id: 'm1', fisico: 2 },
  { almacen_id: 'a', ubicacion_id: 'p1', material_id: 'm1', fisico: 3 },
  { almacen_id: 'a', ubicacion_id: 'p1', material_id: 'm2', fisico: 4 },
  { almacen_id: 'a', ubicacion_id: 'r10', material_id: 'm2', fisico: 1 },
  { almacen_id: 'b', ubicacion_id: 'other', material_id: 'm3', fisico: 10 },
];

describe('construirArbolUbicaciones', () => {
  it('construye el árbol con nivel de sangría, General primero y código con orden natural', () => {
    const filas = construirArbolUbicaciones(ubicaciones, stock, 'a');
    expect(filas.map(({ id, nivel }) => [id, nivel])).toEqual([['g', 0], ['z1', 0], ['z2', 0], ['r10', 1], ['p1', 2]]);
    expect(filas[0]).toMatchObject({ materiales: 1, unidades: 2 });
  });

  it('acumula unidades descendientes y cuenta materiales distintos sin duplicarlos', () => {
    const zona = construirArbolUbicaciones(ubicaciones, stock, 'a').find(item => item.id === 'z2');
    expect(zona).toMatchObject({ materiales: 2, unidades: 8 });
  });

  it('al buscar conserva los ancestros de cada coincidencia', () => {
    expect(construirArbolUbicaciones(ubicaciones, stock, 'a', 'posición uno').map(item => item.id)).toEqual(['z2', 'r10', 'p1']);
  });
});

describe('calcularChipsUbicaciones', () => {
  it('calcula ubicaciones activas y materiales distintos del almacén y de General', () => {
    expect(calcularChipsUbicaciones(ubicaciones, stock, 'a')).toEqual({ ubicaciones: 5, materialesAlmacenados: 2, sinUbicar: 1 });
  });
});

describe('etiquetaTipoUbicacion', () => {
  it('presenta los tipos de ubicación con etiquetas legibles', () => {
    expect(['general', 'zona', 'rack', 'posicion'].map(etiquetaTipoUbicacion)).toEqual(['General', 'Zona', 'Rack', 'Posición']);
  });
});
