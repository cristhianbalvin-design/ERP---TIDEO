import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, llamadas } = vi.hoisted(() => ({ from: vi.fn(), llamadas: [] }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ from }) }));
import { listarCargosEmpresa } from '../src/services/diagnosticoTecnicoService.js';

describe('listarCargosEmpresa', () => {
  beforeEach(() => {
    llamadas.length = 0;
    from.mockImplementation(tabla => {
      const consulta = { tabla, filtros: [], ordenes: [] };
      llamadas.push(consulta);
      const builder = {
        select: columnas => { consulta.columnas = columnas; return builder; },
        eq: (columna, valor) => { consulta.filtros.push([columna, valor]); return builder; },
        order: columna => { consulta.ordenes.push(columna); return builder; },
        then: resolve => Promise.resolve({ data: [{ id: 'c1', tipo: 'Operativo' }], error: null }).then(resolve),
      };
      return builder;
    });
  });

  it('filtra cargos activos de la empresa por tipo Operativo', async () => {
    await expect(listarCargosEmpresa('e1')).resolves.toEqual([{ id: 'c1', tipo: 'Operativo' }]);
    expect(llamadas).toEqual([{
      tabla: 'cargos_empresa',
      columnas: 'id,codigo,nombre,tipo,estado',
      filtros: [['empresa_id', 'e1'], ['estado', 'activo'], ['tipo', 'Operativo']],
      ordenes: ['nombre'],
    }]);
  });
});
