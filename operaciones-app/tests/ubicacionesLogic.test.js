import { describe, expect, it } from 'vitest';
import { calcularChipsUbicaciones, calcularMotivoNoDesactivar, calcularTotalesUbicacion, construirArbolUbicaciones, etiquetaTipoUbicacion, validarFormularioUbicacion } from '../src/zahory-mock/pages/ubicacionesLogic.js';

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

  it('combina búsqueda y uso, conserva ancestros y oculta inactivas según el interruptor', () => {
    const ampliadas = [...ubicaciones, { id: 'piso', almacen_id: 'a', codigo: 'PISO', nombre: 'Piso', tipo: 'piso', uso: 'cuarentena', padre_id: 'z2', activo: true }, { id: 'off', almacen_id: 'a', codigo: 'OFF', nombre: 'Inactiva', tipo: 'zona', activo: false }];
    expect(construirArbolUbicaciones(ampliadas, stock, 'a', 'piso', 'cuarentena', false).map(item => item.id)).toEqual(['z2', 'piso']);
    expect(construirArbolUbicaciones(ampliadas, stock, 'a', '', '', false).map(item => item.id)).not.toContain('off');
    expect(construirArbolUbicaciones(ampliadas, stock, 'a', '', '', true).map(item => item.id)).toContain('off');
  });
});

describe('calcularChipsUbicaciones', () => {
  it('calcula ubicaciones activas y materiales distintos del almacén y de General', () => {
    expect(calcularChipsUbicaciones(ubicaciones, stock, 'a')).toEqual({ ubicaciones: 5, materialesAlmacenados: 2, sinUbicar: 1 });
  });
});

describe('etiquetaTipoUbicacion', () => {
  it('presenta los tipos de ubicación con etiquetas legibles', () => {
    expect(['general', 'zona', 'rack', 'posicion', 'piso'].map(etiquetaTipoUbicacion)).toEqual(['General', 'Zona', 'Rack', 'Posición', 'Piso']);
  });
});

describe('reglas de detalle y formulario', () => {
  it('calcula motivo de desactivación con prioridad general, stock y sub-ubicaciones', () => {
    const item = { id: 'z', activo: true };
    expect(calcularMotivoNoDesactivar({ ...item, es_general: true }, [], [])).toBe('La ubicación general no se puede desactivar.');
    expect(calcularMotivoNoDesactivar(item, [], [{ ubicacion_id: 'z', fisico: 1 }])).toBe('Tiene stock: no se puede desactivar mientras conserve existencias.');
    expect(calcularMotivoNoDesactivar(item, [{ id: 'r', padre_id: 'z', activo: true }], [])).toBe('Tiene sub-ubicaciones activas: desactívalas primero.');
    expect(calcularMotivoNoDesactivar(item, [{ id: 'r', padre_id: 'z', activo: false }], [])).toBe('');
  });
  it('agrega materiales distintos y unidades desde la ubicación y sus descendientes', () => {
    expect(calcularTotalesUbicacion({ id: 'z' }, [{ id: 'p', padre_id: 'z' }], [{ ubicacion_id: 'z', material_id: 'm1', fisico: 2 }, { ubicacion_id: 'p', material_id: 'm1', fisico: 3 }, { ubicacion_id: 'p', material_id: 'm2', fisico: 4 }])).toEqual({ materiales: 2, unidades: 9 });
  });
  it('valida padre, código único sin distinguir mayúsculas y nombre', () => {
    const base = { modo: 'nuevo', almacen_id: 'a', tipo: 'rack', codigo: 'z-1', nombre: 'Rack', padre_id: '' };
    expect(validarFormularioUbicacion(base, ubicaciones).padre).toBe('Elige la zona a la que pertenece el rack.');
    expect(validarFormularioUbicacion({ ...base, padre_id: 'z2' }, ubicaciones).codigo).toBe('Ya existe una ubicación con ese código en este almacén.');
    expect(validarFormularioUbicacion({ ...base, padre_id: 'z2', codigo: 'NUEVO', nombre: ' ' }, ubicaciones).nombre).toBe('El nombre es obligatorio.');
  });
});
