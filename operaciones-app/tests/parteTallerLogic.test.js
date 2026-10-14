import { describe, expect, it } from 'vitest';
import {
  armarMaterialesConsumidos,
  calcularTotalRepuestos,
  estadoInicialConsumos,
  resolverTecnicoAlCambiarOT,
  validarConsumosParte,
} from '../src/zahory-mock/pages/parteTallerLogic.js';

describe('parteTallerLogic', () => {
  it('conserva el técnico manual al cambiar OT y limpia el técnico que venía de una tarea', () => {
    expect(resolverTecnicoAlCambiarOT({ tarea_id: '', tecnico_id: 'tec-1', tecnico_nombre: 'Ana' }))
      .toEqual({ tarea_id: '', tecnico_id: 'tec-1', tecnico_nombre: 'Ana' });
    expect(resolverTecnicoAlCambiarOT({ tarea_id: 'tar-1', tecnico_id: 'tec-2', tecnico_nombre: 'Luis' }))
      .toEqual({ tarea_id: '', tecnico_id: '', tecnico_nombre: '' });
  });

  it('inicia repuestos y fluidos vacíos, con total cero y materiales vacíos', () => {
    const consumos = estadoInicialConsumos();
    expect(consumos).toEqual({ repuestos_consumidos: [], fluidos_consumidos: [] });
    expect(calcularTotalRepuestos(consumos.repuestos_consumidos)).toBe(0);
    expect(armarMaterialesConsumidos(consumos.repuestos_consumidos, consumos.fluidos_consumidos)).toEqual([]);
  });

  it('calcula consumos válidos e ignora cantidades o costos no numéricos sin producir NaN', () => {
    expect(calcularTotalRepuestos([
      { cantidad: 2, costo_unitario: 4.5 },
      { cantidad: 'inválida', costo_unitario: 8 },
    ])).toBe(9);
  });

  it('valida que cada repuesto consumido tenga un material', () => {
    expect(validarConsumosParte([{ cantidad: 1 }])).toBe('Selecciona un material para el repuesto 1.');
  });

  it.each([['cero', '0'], ['negativa', '-1'], ['vac\u00eda', '']])('rechaza cantidad %s', (_etiqueta, cantidad) => {
    expect(validarConsumosParte([{ material_id: 'mat-1', cantidad }])).toBe('La cantidad del repuesto 1 debe ser mayor a cero.');
  });

  it('rechaza cantidades con tres decimales', () => {
    expect(validarConsumosParte([{ material_id: 'mat-1', cantidad: '1.234' }]))
      .toBe('La cantidad del repuesto 1 admite hasta 2 decimales.');
  });

  it('rechaza materiales repetidos y acepta repuestos v\u00e1lidos y una lista vac\u00eda', () => {
    expect(validarConsumosParte([
      { material_id: 'mat-1', cantidad: 1 },
      { material_id: 'mat-1', cantidad: 2 },
    ])).toBe('No repitas el mismo material en los repuestos consumidos.');
    expect(validarConsumosParte([{ material_id: 'mat-1', cantidad: '2,5' }])).toBe('');
    expect(validarConsumosParte([])).toBe('');
  });

  it('incluye material_id y normaliza la cantidad con coma al armar materiales consumidos', () => {
    expect(armarMaterialesConsumidos([
      { material_id: 'mat-1', item_id: 'REP-1', descripcion: 'Filtro', cantidad: '2,5', unidad: 'und', costo_unitario: 4 },
    ], [])).toEqual([{
      tipo: 'repuesto', material_id: 'mat-1', item_id: 'REP-1', descripcion: 'Filtro',
      cantidad: 2.5, unidad: 'und', costo_unitario: 4,
    }]);
  });

  it('calcula total con coma decimal y cantidad vac\u00eda sin producir NaN', () => {
    expect(calcularTotalRepuestos([
      { cantidad: '2,5', costo_unitario: 4 },
      { cantidad: '', costo_unitario: 8 },
    ])).toBe(10);
  });

  it('no incluye uid al armar materiales consumidos', () => {
    expect(armarMaterialesConsumidos([
      { uid: 'cons-1', material_id: 'mat-1', item_id: 'REP-1', descripcion: 'Filtro', cantidad: 1, unidad: 'und', costo_unitario: 4 },
    ], [])).toEqual([{
      tipo: 'repuesto', material_id: 'mat-1', item_id: 'REP-1', descripcion: 'Filtro',
      cantidad: 1, unidad: 'und', costo_unitario: 4,
    }]);
  });
});
