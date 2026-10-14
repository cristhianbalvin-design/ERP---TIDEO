import { describe, expect, it } from 'vitest';
import {
  analizarCuellos,
  calcularPronostico,
  detectarCuelloDeBotella,
  detectarCuelloPorEspera,
  distribuirHorasPorCapacidad,
  esOtPlanificable,
  planificarTareas,
  simularUrgencia,
  validarCapacidadPuesto,
  validarOtPlanificable,
} from '../src/zahory-mock/pages/planner/plannerEngine.js';

describe('motor de planificación', () => {
  it('calcula fechas según horas, capacidad diaria y días laborables', () => {
    const resultado = distribuirHorasPorCapacidad(17, 8, new Date('2026-10-12T12:00:00'));
    expect(resultado.fechas.map(d => d.horas)).toEqual([8, 8, 1]);
    expect(resultado.fechaFin).toBe('2026-10-14');
  });

  it('mantiene la fecha local y omite fines de semana al partir de ISO', () => {
    const resultado = distribuirHorasPorCapacidad(16, 8, '2026-10-16');
    expect(resultado.fechas.map(d => d.fecha)).toEqual(['2026-10-16', '2026-10-19']);
  });

  it('estima P50 y conservadora con un 25 % adicional', () => {
    const ot = { ot_tareas: [{ horas_estimadas: 16 }] };
    const pronostico = calcularPronostico(
      ot,
      { personas: 1, maquinas: 1, horasMaquinaDia: 8 },
      new Date('2026-10-12T12:00:00'),
    );
    expect(pronostico.totalHoras).toBe(16);
    expect(pronostico.p50.fechaFin).toBe('2026-10-13');
    expect(pronostico.conservadora.fechaFin).toBe('2026-10-14');
  });

  it('identifica el cuello de botella por recurso con menor capacidad', () => {
    expect(detectarCuelloDeBotella({
      horasPersonaDisponibles: 8,
      horasMaquinaDisponibles: 4,
    }, 7)).toEqual({ tipo: 'm\u00e1quinas', horasFaltantes: 3 });
  });

  it('detecta esperas causadas por ocupaciones activas del puesto', () => {
    expect(detectarCuelloPorEspera([
      { puesto_id: 'P-1', fecha_hasta: '2026-10-15', estado: 'programado' },
    ], new Date('2026-10-12T12:00:00'), 'P-1')).toMatchObject({
      puestoId: 'P-1',
      diasEspera: 4,
    });
  });

  it('simula urgencia sin mutar OTs y calcula desplazamiento', () => {
    const ots = [{ id: 'OT-A', estado: 'ejecucion', ot_tareas: [{ horas_estimadas: 8 }] }];
    const resultado = simularUrgencia(
      ots,
      { ot_tareas: [{ horas_estimadas: 8 }] },
      { horasPersonaDisponibles: 8, horasMaquinaDisponibles: 8 },
      new Date('2026-10-12T12:00:00'),
    );
    expect(resultado.horasUrgentes).toBe(8);
    expect(resultado.esperaDias).toBe(1);
    expect(resultado.desplazadas[0].fechaConUrgencia).toBe('2026-10-13');
    expect(ots[0].ot_tareas).toHaveLength(1);
  });

  it('rechaza OTs cerradas para nuevas asignaciones', () => {
    const cerrada = { id: 'OT-C', estado: 'cerrado_conforme' };
    expect(esOtPlanificable(cerrada)).toBe(false);
    expect(() => validarOtPlanificable(cerrada)).toThrow('no admite nuevas asignaciones');
  });

  it('bloquea también OT valorizadas', () => {
    expect(esOtPlanificable({ id: 'OT-E', estado: 'valorizada' })).toBe(false);
    expect(() => validarOtPlanificable({ id: 'OT-E', estado: 'valorizada' })).toThrow('no admite nuevas asignaciones');
  });

  it('planifica por tarea y conserva asignación propia enlazable a tarea', () => {
    const ot = { ot_tareas: [{ id: 'T-1', horas_estimadas: 12 }, { id: 'T-2', horas_estimadas: 8 }] };
    const assignments = {
      'T-1': { personaIds: ['P-1'], maquinaIds: ['M-1'], horasPersona: 6, horasMaquina: 6 },
      'T-2': { personaIds: ['P-2'], maquinaIds: ['M-2'], horasPersona: 4, horasMaquina: 4 },
    };
    const plans = planificarTareas(ot, assignments, {
      personas: [{ id: 'P-1' }, { id: 'P-2' }],
      maquinas: [{ id: 'M-1' }, { id: 'M-2' }],
    }, '2026-10-12');
    expect(plans.map(plan => plan.tarea.id)).toEqual(['T-1', 'T-2']);
    expect(plans[0].p50.fechaFin).toBe('2026-10-13');
    expect(plans[1].fechaDesde).toBe('2026-10-14');
  });

  it('pospone la tarea cuando los recursos elegidos ya agotaron su capacidad del día', () => {
    const plans = planificarTareas({
      id: 'OT-B',
      ot_tareas: [{ id: 'T-3', horas_estimadas: 4 }],
    }, {
      'T-3': { personaIds: ['P-3'], maquinaIds: ['M-3'], horasPersona: 4, horasMaquina: 4 },
    }, {
      personas: [{ id: 'P-3' }],
      maquinas: [{ id: 'M-3' }],
      asignaciones: [{ tecnico_id: 'P-3', fecha: '2026-10-12', horas_estimadas: 4 }],
      equipos: [],
    }, '2026-10-12');
    expect(plans[0].p50.fechas[0].fecha).toBe('2026-10-13');
  });

  it('respeta la fecha mínima de inicio y el puesto elegido para toda la OT', () => {
    const plans = planificarTareas({
      id: 'OT-F',
      ot_tareas: [{ id: 'T-4', horas_estimadas: 8 }],
    }, {
      __puestoOt: { value: 'P-2' },
      'T-4': { fechaNoAntes: '2026-10-15' },
    }, {
      personas: [],
      maquinas: [],
      puestos: [{ id: 'P-2', capacidad: 1 }],
    }, '2026-10-12');
    expect(plans[0].fechaDesde).toBe('2026-10-15');
    expect(plans[0].p50.fechas[0].fecha).toBe('2026-10-15');
    expect(plans[0].assignment.puestoId).toBe('P-2');
  });

  it('rechaza ocupación diaria del puesto cuando alcanza su capacidad', () => {
    expect(validarCapacidadPuesto([
      { ot_id: 'OT-A', puesto_id: 'P-1', fecha_desde: '2026-10-12', fecha_hasta: '2026-10-13' },
    ], 'P-1', '2026-10-13', '2026-10-14', 1, 'OT-B')).toMatchObject({ valido: false, fecha: '2026-10-13' });
  });

  it('atribuye la espera a un recurso y ordena por impacto', () => {
    const data = {
      personas: [{ id: 'P-1', nombre: 'Técnico A' }],
      maquinas: [],
      puestos: [],
      asignaciones: [{ ot_id: 'OT-A', tecnico_id: 'P-1' }],
      equipos: [],
      ocupaciones: [],
    };
    const report = analizarCuellos([
      { id: 'OT-A', numero: '100', estado: 'ejecucion', ot_tareas: [{ id: 'T-1', horas_estimadas: 8 }] },
    ], data, '2026-10-12');
    expect(report.critico.nombre).toBe('Técnico A');
    expect(report.esperas[0].causa).toContain('Técnico A');
  });

  it('incluye causa del cuello de botella en la simulación urgente', () => {
    const ot = { id: 'OT-A', estado: 'ejecucion', ot_tareas: [{ id: 'T-1', horas_estimadas: 8 }] };
    const result = simularUrgencia([ot], ot, {
      horasPersonaDisponibles: 8,
      horasMaquinaDisponibles: 8,
    }, '2026-10-12', { personas: [], maquinas: [], puestos: [] });
    expect(result.impacto).toHaveProperty('critico');
    expect(result.desplazadas[0]).toHaveProperty('causa');
  });
});
