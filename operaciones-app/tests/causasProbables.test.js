import { describe, expect, it } from 'vitest';
import { agruparCausasProbables, buscarCausasProbables } from '../src/zahory-mock/pages/causasProbables.js';
import { buscarTiposDano, coincideConErrores } from '../src/zahory-mock/pages/dibujoHallazgoLogic.js';

const causes = [
  { codigo: 'contaminacion_fluido', etiqueta: 'Contaminación del fluido', orden: 20 },
  { codigo: 'falta_mantenimiento', etiqueta: 'Falta de mantenimiento', orden: 40 },
  { codigo: 'lubricacion_deficiente', etiqueta: 'Lubricación deficiente', orden: 50 },
];

describe('búsqueda de causas probables', () => {
  it('tolera tildes y mayúsculas', () => {
    expect(buscarCausasProbables(causes, 'CONTAMINACION').items[0].codigo).toBe('contaminacion_fluido');
  });
  it('encuentra por tokens y sinónimos técnicos', () => {
    expect(buscarCausasProbables(causes, 'aceite sucio').items[0].codigo).toBe('contaminacion_fluido');
    expect(buscarCausasProbables(causes, 'sin lubricacion').items[0].codigo).toBe('lubricacion_deficiente');
  });
  it('mantiene el orden del catálogo al estar vacío y ofrece limpiar al componente', () => {
    expect(buscarCausasProbables(causes, '').items.map(row => row.codigo)).toEqual(causes.map(row => row.codigo));
    expect(agruparCausasProbables(causes)[0].label).toBe('Los más usados');
    expect(buscarCausasProbables(causes, 'sin resultado').items).toEqual([]);
  });
});

describe('tolerancia a errores de escritura', () => {
  it('encuentra causas con una o dos letras equivocadas', () => {
    expect(buscarCausasProbables(causes, 'lubricasion').items[0].codigo).toBe('lubricacion_deficiente');
    expect(buscarCausasProbables(causes, 'mantenimento').items[0].codigo).toBe('falta_mantenimiento');
  });
  it('encuentra tipos de daño con errores y no inventa coincidencias', () => {
    const tipos = [{ codigo: 'corrosion', etiqueta: 'Corrosión' }, { codigo: 'desgaste', etiqueta: 'Desgaste' }];
    expect(buscarTiposDano(tipos, 'corrocion').items[0].codigo).toBe('corrosion');
    expect(buscarTiposDano(tipos, 'desgate').items[0].codigo).toBe('desgaste');
    expect(buscarTiposDano(tipos, 'xyzab').items).toEqual([]);
  });
  it('no aplica tolerancia a palabras cortas', () => {
    expect(coincideConErrores('fuga', 'fuego')).toBe(false);
  });
});
