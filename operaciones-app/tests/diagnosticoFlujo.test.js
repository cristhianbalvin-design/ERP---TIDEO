import { describe, expect, it } from 'vitest';
import { getIncompleteHallazgos } from '../src/zahory-mock/pages/hallazgosValidation.js';
import { agruparLineasPorTrabajo, datosInicialesValidos, ordenarHallazgosPorPrioridad, PASOS_MANTENIMIENTO } from '../src/zahory-mock/pages/diagnosticoFlujo.js';

const matriz = { conforme: { monitorear: 'P4' }, falla_funcional: { inmediato: 'P1' } };

describe('flujo de diagnóstico técnico de mantenimiento', () => {
  it('conserva los seis pasos aprobados en orden', () => {
    expect(PASOS_MANTENIMIENTO).toEqual([
      'Recepción', 'Equipo', 'Datos', 'Hallazgos', 'Trabajos a realizar', 'Diagnóstico e informe',
    ]);
  });

  it('valida Datos con motivo, técnico y fecha sin pedir trabajos a evaluar', () => {
    expect(datosInicialesValidos({ id: 'recepcion-1' }, {
      motivo: 'Pérdida de presión', tecnico_id: 'tecnico-1', fecha_inspeccion: '2026-10-12',
    })).toBe(true);
    expect(datosInicialesValidos({ id: 'recepcion-1' }, {
      motivo: 'Pérdida de presión', tecnico_id: 'tecnico-1', fecha_inspeccion: '2026-10-12', trabajos_evaluar: [],
    })).toBe(true);
  });

  it('requiere un trabajo propuesto para guardar el hallazgo', () => {
    const incomplete = getIncompleteHallazgos([{ componente_parte: 'Vástago' }]);
    expect(incomplete[0].missingFields).toContain('family');
    expect(getIncompleteHallazgos([{ familia_trabajo_id: 'familia-1', componente_parte: 'Vástago' }])[0].missingFields).not.toContain('family');
  });

  it('agrupa las líneas de paso 5 por familia de trabajo', () => {
    const groups = agruparLineasPorTrabajo([
      { id: 'l1', familia_trabajo_id: 'f1', actividad_id: 'a1', tarea_id: 't1' },
      { id: 'l2', familia_trabajo_id: 'f1', actividad_id: 'a1', tarea_id: 't2' },
      { id: 'l3', familia_trabajo_id: 'f2', actividad_id: 'a2', tarea_id: 't3' },
    ], [{ id: 'f1', nombre: 'Rectificado' }, { id: 'f2', nombre: 'Sellos' }]);
    expect(groups.map(group => [group.familia.nombre, group.lines.map(line => line.id)])).toEqual([
      ['Rectificado', ['l1', 'l2']], ['Sellos', ['l3']],
    ]);
  });

  it('ordena la lista plana de hallazgos de prioridad mayor a menor', () => {
    const ordered = ordenarHallazgosPorPrioridad([
      { id: 'bajo', condicion: 'conforme', riesgo: 'monitorear' },
      { id: 'alto', condicion: 'falla_funcional', riesgo: 'inmediato' },
    ], matriz);
    expect(ordered.map(row => row.id)).toEqual(['alto', 'bajo']);
  });
});
