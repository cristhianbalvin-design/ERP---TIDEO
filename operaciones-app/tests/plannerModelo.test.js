import { describe, expect, it } from 'vitest';
import { apilar, bloquesRecurso, diferenciaHabiles, infoOT, sumarHabiles, ventanaHabil } from '../src/zahory-mock/pages/planner/plannerModelo.js';
import { diferenciasTaller } from '../src/zahory-mock/pages/planner/Configurator.jsx';

const base = { personas: [{ id: 'p' }], asignaciones: [], equipos: [] };

describe('modelo del Planner v8', () => {
  it('arma la ventana hábil con el día anterior y salta fines de semana', () => {
    const dias = ventanaHabil('2026-10-14', 5);
    expect(dias).toEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19']);
    expect(sumarHabiles('2026-10-16', 1)).toBe('2026-10-19');
    expect(diferenciaHabiles('2026-10-16', '2026-10-20')).toBe(2);
    expect(diferenciaHabiles('2026-10-20', '2026-10-16')).toBe(-2);
  });

  it('marca atrasada, en riesgo, a tiempo y cerrada según el compromiso', () => {
    const tarea = { id: 't', horas_estimadas: 16, horas_reales: 0 };
    const asig = fecha => ({ id: fecha, ot_id: 'o', tecnico_id: 'p', fecha, estado: 'programado' });
    const datos = { ...base, asignaciones: [asig('2026-10-15'), asig('2026-10-16')] };
    const ot = comp => ({ id: 'o', estado: 'programada', ot_tareas: [tarea], orden_servicio: comp ? { fecha_fin: comp } : null });
    expect(infoOT(ot('2026-10-15'), datos, '2026-10-14').st).toBe('bad');
    expect(infoOT(ot('2026-10-16'), datos, '2026-10-14').st).toBe('warn');
    expect(infoOT(ot('2026-10-30'), datos, '2026-10-14').st).toBe('ok');
    expect(infoOT({ ...ot(null), estado: 'cerrada' }, datos, '2026-10-14').st).toBe('done');
  });

  it('agrupa asignaciones contiguas de una tarea en un bloque y apila los que se cruzan', () => {
    const dias = ventanaHabil('2026-10-14', 5);
    const fila = (id, tarea, fecha) => ({ id, ot_id: 'o', tarea_id: tarea, tecnico_id: 'p', fecha, horas_estimadas: 8, estado: 'programado' });
    const bloques = bloquesRecurso([fila('1', 'a', '2026-10-14'), fila('2', 'a', '2026-10-15'), fila('3', 'b', '2026-10-15')], 'tecnico_id', 'p', dias);
    expect(bloques).toHaveLength(2);
    const a = bloques.find(b => b.tareaId === 'a');
    expect([a.s, a.e, a.h]).toEqual([1, 2, 16]);
    expect(bloques.every(b => b.filas === 2)).toBe(true);
    expect(apilar([]).length).toBe(0);
  });

  it('calcula altas, cambios y bajas del borrador del taller', () => {
    const datos = { bahias: [{ id: 'b1', nombre: 'A', categoria: 'general' }], puestos: [{ id: 'p1', bahia_id: 'b1', nombre: 'P', capacidad: 1 }], maquinas: [] };
    const diferencias = diferenciasTaller(datos, {
      bahias: [{ id: 'b1', nombre: 'A2', categoria: 'general' }, { id: 'nuevo-bahia-1', nombre: 'B', categoria: 'sold' }],
      puestos: [],
      maquinas: [],
    });
    expect(diferencias.bahiasEditadas.map(b => b.nombre)).toEqual(['A2']);
    expect(diferencias.bahiasNuevas.map(b => b.nombre)).toEqual(['B']);
    expect(diferencias.puestosQuitados.map(p => p.id)).toEqual(['p1']);
  });
});
