import { describe, expect, it } from 'vitest';
import {
  armarMaterialesConsumidos,
  calcularTotalRepuestos,
  estadoInicialConsumos,
  resolverTecnicoAlCambiarOT,
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
});
