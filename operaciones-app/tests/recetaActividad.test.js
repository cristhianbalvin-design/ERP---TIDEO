import { describe, expect, it } from 'vitest';
import { proponerLineasRecetaActividad } from '../src/zahory-mock/pages/recetaActividad.js';

const plantillas = [
  { actividad_id: 'act-1', tarea_id: 'task-2', cargo_id: null, orden: 2 },
  { actividad_id: 'act-1', tarea_id: 'task-1', cargo_id: 'cargo-1', orden: 1 },
  { actividad_id: 'act-2', tarea_id: 'task-3', cargo_id: null, orden: 1 },
];

describe('proponerLineasRecetaActividad', () => {
  it('devuelve las tareas faltantes ordenadas y con el cargo sugerido', () => {
    expect(proponerLineasRecetaActividad('fabricacion', 'act-1', plantillas, [])).toEqual([
      { actividad_id: 'act-1', tarea_id: 'task-1', cargo_id: 'cargo-1', orden: 1 },
      { actividad_id: 'act-1', tarea_id: 'task-2', cargo_id: null, orden: 2 },
    ]);
  });

  it('omite duplicados por actividad+tarea y conserva la misma tarea bajo otra actividad', () => {
    const lineas = [
      { familia_trabajo_id: 'fam-1', actividad_id: 'act-1', tarea_id: 'task-1' },
      { familia_trabajo_id: 'fam-1', actividad_id: 'act-2', tarea_id: 'task-2' },
    ];
    expect(proponerLineasRecetaActividad('fabricacion', 'act-1', plantillas, lineas)).toEqual([
      { actividad_id: 'act-1', tarea_id: 'task-2', cargo_id: null, orden: 2 },
    ]);
  });

  it('no propone tareas en mantenimiento ni sin actividad elegida', () => {
    expect(proponerLineasRecetaActividad('mantenimiento', 'act-1', plantillas, [])).toEqual([]);
    expect(proponerLineasRecetaActividad('fabricacion', null, plantillas, [])).toEqual([]);
  });
});
