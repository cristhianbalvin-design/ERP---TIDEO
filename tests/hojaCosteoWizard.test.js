import { describe, expect, it } from 'vitest';
import { agruparMaterialesPorTrabajo, calcularCostosPorTarea, calcularPrecio, rutaMaterial } from '../src/hojaCosteoCalculos.js';

describe('cálculos de Hoja de Costeo', () => {
  it('calcula costo por tarea sumando mano de obra, máquina y materiales', () => {
    const [trabajo] = calcularCostosPorTarea({
      lineas: [{ id: 'mo-1', tarea_id: 't-1', familia_trabajo_id: 'f-1', actividad_id: null, horas: 2, costo_hora_snapshot: 20 }],
      activos: [{ linea_mano_obra_id: 'mo-1', activo_id: 'a-1', horas_uso_estimadas: 1.5, costo_hora_equipo: 10 }],
      materiales: [{ linea_mano_obra_id: 'mo-1', subtotal: 15 }],
    });
    expect(trabajo.tareas[0].subtotal).toBe(70);
  });

  it('calcula el total por trabajo', () => {
    const [trabajo] = calcularCostosPorTarea({ lineas: [
      { id: '1', familia_trabajo_id: 'f', actividad_id: 'a', tarea_id: 't1', horas: 2, costo_hora_snapshot: 10 },
      { id: '2', familia_trabajo_id: 'f', actividad_id: 'a', tarea_id: 't2', horas: 3, costo_hora_snapshot: 10 },
    ] });
    expect(trabajo.subtotal).toBe(50);
  });

  it('conserva la depreciación directa de una máquina existente', () => {
    const [trabajo] = calcularCostosPorTarea({
      lineas: [{ id: 'mo-1', tarea_id: 't-1', familia_trabajo_id: 'f-1', actividad_id: 'a-1', horas: 1, costo_hora_snapshot: 10 }],
      activos: [{ linea_mano_obra_id: 'mo-1', depreciacion_asignada: 42, horas_uso_estimadas: null }],
    });
    expect(trabajo.tareas[0].subtotal_maquina).toBe(42);
    expect(trabajo.subtotal).toBe(52);
  });

  it('calcula precio con gasto, margen e IGV usando el divisor comercial', () => {
    expect(calcularPrecio({ costoTotal: 100, gastoPct: 0.1, margenPct: 0.4 })).toEqual({ divisor: 0.5, sinIgv: 200, conIgv: 236 });
    expect(calcularPrecio({ costoTotal: 100, gastoPct: 0.6, margenPct: 0.4 }).sinIgv).toBeNull();
  });

  it('resuelve la referencia Trabajo > Actividad > Tarea de un material', () => {
    expect(rutaMaterial({ tarea_id: 't1' }, { familia_trabajo_id: 'f1', actividad_id: 'a1', tarea_id: 't1' }, [{ id: 'f1', nombre: 'Tapa' }], [{ id: 'a1', nombre: 'Fabricación' }], [{ id: 't1', nombre: 'Corte' }])).toEqual(['Tapa', 'Fabricación', 'Corte']);
  });

  it('agrupa materiales por trabajo, actividad y tarea con subtotal de bloque', () => {
    const grupos = agruparMaterialesPorTrabajo({
      lineas: [{ id: 'mo-1', familia_trabajo_id: 'f1', actividad_receta_id: 'a1', tarea_id: 't1' }],
      materiales: [{ id: 'mat-1', linea_mano_obra_id: 'mo-1', cantidad: 2, costo_unitario_snapshot: 12, subtotal: 24 }],
      familias: [{ id: 'f1', nombre: 'Tapa' }],
      actividades: [{ id: 'a1', nombre: 'Fabricación' }],
      tareas: [{ id: 't1', nombre: 'Corte' }],
    });
    expect(grupos).toHaveLength(1);
    expect(grupos[0].ruta).toEqual(['Tapa', 'Fabricación', 'Corte']);
    expect(grupos[0].subtotal).toBe(24);
  });

  it('recalcula el snapshot y subtotal de una tarea editada', () => {
    const antes = calcularCostosPorTarea({ lineas: [{ id: 'mo-1', familia_trabajo_id: 'f1', tarea_id: 't1', horas: 2, costo_hora_snapshot: 20 }] });
    const despues = calcularCostosPorTarea({ lineas: [{ id: 'mo-1', familia_trabajo_id: 'f1', tarea_id: 't1', horas: 3.5, costo_hora_snapshot: 32 }] });
    expect(antes[0].tareas[0].subtotal_mano_obra).toBe(40);
    expect(despues[0].tareas[0].subtotal_mano_obra).toBe(112);
    expect(despues[0].tareas[0].subtotal).toBe(112);
  });
});
