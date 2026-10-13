import { describe, expect, it } from 'vitest';
import { filtrarProyectosPorCliente } from '../src/zahory-mock/pages/proyectosOtLogic.js';

describe('filtrarProyectosPorCliente', () => {
  it('solo ofrece proyectos activos entregados por RPC que pertenecen al cliente elegido', () => {
    const proyectos = [{ id: 'p1', cuenta_id: 'c1' }, { id: 'p2', cuenta_id: 'c2' }, { id: 'p3', cuenta_id: 'c1' }];
    expect(filtrarProyectosPorCliente(proyectos, 'c1')).toEqual([proyectos[0], proyectos[2]]);
    expect(filtrarProyectosPorCliente(proyectos, '')).toEqual([]);
  });
});
