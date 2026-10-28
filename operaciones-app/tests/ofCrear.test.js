import { describe, expect, it } from 'vitest';
import { agruparRuta, filtrarOS, modoCreacion, textoHoras, totalesVistaPrevia } from '../src/zahory-mock/pages/of/ofCrearLogic.js';

const ops = [
  { secuencia: 1, trabajo: 'Armado, pruebas y entrega', actividad: 'Armado y prueba de cilindro', tarea: 'Armado', horas: 5, horas_maquina: 0, costo: 42.4, bahia: null },
  { secuencia: 2, trabajo: 'Armado, pruebas y entrega', actividad: 'Armado y prueba de cilindro', tarea: 'Prueba', horas: 2, horas_maquina: 2, costo: 20.4, bahia: 'Zona de mecanizado' },
  { secuencia: 3, trabajo: 'Fabricación de vástagos', actividad: 'Torneado', tarea: 'Torneado', horas: 3, horas_maquina: 0, costo: 25.44, bahia: null },
];

describe('nueva OF', () => {
  it('agrupa la ruta por Trabajo › Actividad y suma horas', () => {
    const r = agruparRuta(ops);
    expect(r.map(t => [t.nombre, t.tareas, t.horas, t.horasMaquina])).toEqual([
      ['Armado, pruebas y entrega', 2, 7, 2],
      ['Fabricación de vástagos', 1, 3, 0],
    ]);
    expect(r[0].actividades[0].operaciones).toHaveLength(2);
  });

  it('calcula totales con céntimos y no copia nada en una OF adicional', () => {
    const vista = { operaciones: ops, materiales: [{ subtotal: 110 }, { subtotal: 110.005 }] };
    expect(totalesVistaPrevia(vista)).toMatchObject({ operaciones: 3, materiales: 2, horas: 10, horasMaquina: 2, costoOps: 88.24, costo: 308.25, sinBahia: 2 });
    expect(totalesVistaPrevia(vista, false)).toMatchObject({ operaciones: 0, costo: 0 });
  });

  it('elige el modo según la OS', () => {
    expect(modoCreacion(null)).toBe('sin_os');
    expect(modoCreacion({ of_existente: { numero: 'OF-26-0001' }, hoja: {}, operaciones: ops })).toBe('adicional');
    expect(modoCreacion({ hoja: null, operaciones: [] })).toBe('sin_hoja');
    expect(modoCreacion({ hoja: { numero: 'HC' }, operaciones: [] })).toBe('hoja_sin_fabricacion');
    expect(modoCreacion({ hoja: { numero: 'HC' }, operaciones: ops })).toBe('copiar');
  });

  it('busca OS sin acentos y describe las horas', () => {
    const lista = [{ numero: 'OSC-1', cliente: 'Minería Sur', nombre: 'Cilindro' }, { numero: 'OSC-2', cliente: 'Otra', nombre: 'Vástago', hoja_numero: 'HC-9' }];
    expect(filtrarOS(lista, 'mineria').map(o => o.numero)).toEqual(['OSC-1']);
    expect(filtrarOS(lista, 'hc-9').map(o => o.numero)).toEqual(['OSC-2']);
    expect(textoHoras(10, 2)).toBe('10 h-hombre · 2 h-máquina');
    expect(textoHoras(3, 0)).toBe('3 h-hombre');
  });
});
