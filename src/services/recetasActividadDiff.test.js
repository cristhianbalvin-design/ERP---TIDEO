import { describe, expect, it } from 'vitest';
import { calcularDiffRecetaActividad } from './recetasActividadDiff.js';

describe('calcularDiffRecetaActividad', () => {
  it('inserta y normaliza el orden consecutivo desde uno', () => {
    const diff = calcularDiffRecetaActividad([], [
      { tarea_id: 'tarea-b', cargo_id: '' },
      { tarea_id: 'tarea-a', cargo_id: 'cargo-1' },
    ]);

    expect(diff.insertar).toEqual([
      { tarea_id: 'tarea-b', cargo_id: null, orden: 1 },
      { tarea_id: 'tarea-a', cargo_id: 'cargo-1', orden: 2 },
    ]);
    expect(diff.actualizar).toEqual([]);
    expect(diff.eliminar).toEqual([]);
  });

  it('detecta cambios de orden y cargo, tareas nuevas y tareas quitadas', () => {
    const diff = calcularDiffRecetaActividad([
      { tarea_id: 'tarea-a', cargo_id: 'cargo-1', orden: 1 },
      { tarea_id: 'tarea-b', cargo_id: null, orden: 2 },
      { tarea_id: 'tarea-c', cargo_id: null, orden: 3 },
    ], [
      { tarea_id: 'tarea-b', cargo_id: 'cargo-2' },
      { tarea_id: 'tarea-a', cargo_id: 'cargo-1' },
      { tarea_id: 'tarea-nueva', cargo_id: null },
    ]);

    expect(diff.insertar).toEqual([{ tarea_id: 'tarea-nueva', cargo_id: null, orden: 3 }]);
    expect(diff.actualizar).toEqual([
      { tarea_id: 'tarea-b', cargo_id: 'cargo-2', orden: 1 },
      { tarea_id: 'tarea-a', cargo_id: 'cargo-1', orden: 2 },
    ]);
    expect(diff.eliminar).toEqual([{ tarea_id: 'tarea-c', cargo_id: null, orden: 3 }]);
  });

  it('no genera cambios cuando los datos y el orden ya coinciden', () => {
    expect(calcularDiffRecetaActividad(
      [{ tarea_id: 'tarea-a', cargo_id: null, orden: 1 }],
      [{ tarea_id: 'tarea-a', cargo_id: '', orden: 99 }],
    )).toEqual({ insertar: [], actualizar: [], eliminar: [] });
  });
});
