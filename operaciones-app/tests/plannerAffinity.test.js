import { describe, expect, it } from 'vitest';
import {
  AFINIDAD_PLANNER,
  maquinaAfin,
  puntuarPuestoAfin,
  resolverFamiliaTrabajo,
} from '../src/zahory-mock/pages/planner/plannerAffinity.js';

describe('afinidad de puestos y catálogo del Planner', () => {
  const familiasTrabajo = [
    { id: 'uuid-sold', nombre: 'Soldadura y recargue' },
    { id: 'uuid-hid', nombre: 'Reparación hidráulica' },
  ];

  it('resuelve familia_trabajo_id UUID antes de sugerir una bahía', () => {
    const tarea = { familia_trabajo_id: 'uuid-sold' };
    const bahia = { categoria: 'sold' };
    expect(resolverFamiliaTrabajo(tarea.familia_trabajo_id, familiasTrabajo).nombre)
      .toBe('Soldadura y recargue');
    expect(puntuarPuestoAfin({ bahia }, tarea, familiasTrabajo)).toBe(true);
    expect(puntuarPuestoAfin({ bahia: { categoria: 'mec' } }, tarea, familiasTrabajo))
      .toBe(false);
  });

  it('usa claves reales de familia del catálogo de máquinas', () => {
    const tarea = { familia_trabajo_id: 'uuid-hid' };
    const puesto = { bahia: { categoria: 'hidr' } };
    expect(maquinaAfin({ familia: 'prue' }, puesto, tarea, familiasTrabajo)).toBe(true);
    expect(maquinaAfin({ familia: 'sold' }, puesto, tarea, familiasTrabajo)).toBe(false);
    expect(AFINIDAD_PLANNER).toHaveProperty('crom.maquinas');
    expect(AFINIDAD_PLANNER.general.maquinas).toEqual([
      'mec', 'rect', 'corte', 'conf', 'sold', 'trat', 'izaje', 'prue', 'serv',
    ]);
  });
});
