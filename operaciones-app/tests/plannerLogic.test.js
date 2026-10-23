import { describe, expect, it } from 'vitest';
import {
  agruparPorOS,
  construirMapaCalor,
  edicionBloqueada,
  fechaEnDias,
} from '../src/zahory-mock/pages/planner/plannerLogic.js';

describe('funciones puras del Planner', () => {
  it('agrupa OTs por OS y conserva las que no tienen OS', () => {
    const grupos = agruparPorOS([
      { id: '1', os_cliente_id: 'OS-A' },
      { id: '2', os_cliente_id: 'OS-A' },
      { id: '3' },
    ]);
    expect(grupos.find(grupo => grupo.id === 'OS-A').ots).toHaveLength(2);
    expect(grupos.find(grupo => grupo.id === 'sin-os').ots[0].id).toBe('3');
  });

  it('construye carga diaria por persona y máquina', () => {
    const inicio = '2026-10-12';
    const mapa = construirMapaCalor({
      inicio,
      dias: 2,
      personas: [{ id: 'P', nombre: 'Personal' }],
      maquinas: [{ id: 'M', nombre: 'Torno', horas_dia: 6 }],
      asignaciones: [{ tecnico_id: 'P', fecha: inicio, horas_estimadas: 4 }],
      equipos: [{ maquina_id: 'M', fecha: inicio, horas_estimadas: 3 }],
    });
    expect(mapa[0].dias[0]).toMatchObject({
      fecha: inicio,
      horas: 4,
      capacidad: 8,
      porcentaje: 0.5,
    });
    expect(mapa[1].dias[0]).toMatchObject({ horas: 3, capacidad: 6, porcentaje: 0.5 });
  });

  it('bloquea edición de OT cerradas o asignaciones ya ejecutadas', () => {
    expect(edicionBloqueada({ id: '1', estado: 'cerrada' }, { estado: 'programado' })).toBe(true);
    expect(edicionBloqueada({ id: '2', estado: 'ejecucion' }, { estado: 'ejecutado' })).toBe(true);
    expect(edicionBloqueada({ id: '3', estado: 'ejecucion' }, { estado: 'programado' }))
      .toBe(false);
  });

  it('calcula días de tablero sin depender de UTC', () => {
    expect(fechaEnDias('2026-10-12', 2)).toBe('2026-10-14');
  });
});
