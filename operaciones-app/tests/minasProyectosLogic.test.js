import { describe, expect, it } from 'vitest';
import { contarResumenMinas, nombreAlmacen, separarProyectos } from '../src/zahory-mock/pages/minasProyectosLogic.js';

describe('minasProyectosLogic', () => {
  it('calcula resumen incluso con listas vacías', () => {
    expect(contarResumenMinas([])).toEqual({ minas: 0, proyectos: 0, sinAlmacen: 0 });
    expect(contarResumenMinas([{ proyectos: [{ id: 'p1' }], almacenes: [] }, { proyectos: [], almacenes: [{ id: 'a1' }] }])).toEqual({ minas: 2, proyectos: 1, sinAlmacen: 1 });
  });
  it('separa proyectos con y sin mina', () => {
    expect(separarProyectos([{ id: 'p1', mina_id: 'm1' }, { id: 'p2', mina_id: null }])).toEqual({ conMina: [{ id: 'p1', mina_id: 'm1' }], sinMina: [{ id: 'p2', mina_id: null }] });
  });
  it('forma el nombre visible del almacén', () => expect(nombreAlmacen({ codigo: 'A1', nombre: 'Central' })).toBe('A1 · Central'));
});
