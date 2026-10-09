import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, llamadas, respuestas } = vi.hoisted(() => ({ from: vi.fn(), llamadas: [], respuestas: {} }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ from }) }));
import { cargarMapaUbicaciones } from '../src/services/ubicacionesService.js';

describe('cargarMapaUbicaciones', () => {
  beforeEach(() => {
    llamadas.length = 0;
    Object.keys(respuestas).forEach(tabla => delete respuestas[tabla]);
    from.mockImplementation(tabla => {
      const consulta = { tabla, filtros: [], ordenes: [], rangos: [] };
      llamadas.push(consulta);
      const builder = {
        select: columnas => { consulta.columnas = columnas; return builder; },
        eq: (columna, valor) => { consulta.filtros.push(['eq', columna, valor]); return builder; },
        gt: (columna, valor) => { consulta.filtros.push(['gt', columna, valor]); return builder; },
        in: (columna, valor) => { consulta.filtros.push(['in', columna, valor]); return builder; },
        order: (columna, opciones) => { consulta.ordenes.push([columna, opciones]); return builder; },
        range: (desde, hasta) => { consulta.rangos.push([desde, hasta]); consulta.rango = [desde, hasta]; return builder; },
        then: (resolve, reject) => {
          const valores = respuestas[tabla] || [];
          const pagina = consulta.rango ? valores.slice(consulta.rango[0], consulta.rango[1] + 1) : valores;
          return Promise.resolve({ data: pagina, error: null }).then(resolve, reject);
        },
      };
      return builder;
    });
  });

  it('lee almacenes activos, ubicaciones activas y stock de empresa con sociedad y paginación de 1000', async () => {
    respuestas.almacenes = [{ id: 'a1' }];
    respuestas.ubicaciones = [{ id: 'u1' }];
    respuestas.stock = Array.from({ length: 1001 }, (_, index) => ({ material_id: `m${index}`, fisico: 1 }));
    const resultado = await cargarMapaUbicaciones({ empresaId: 'e1', sociedadId: 's1', vistaConsolidada: false });
    expect(resultado.stock).toHaveLength(1001);
    expect(llamadas.filter(item => item.tabla === 'stock').map(item => item.rango)).toEqual([[0, 999], [1000, 1999]]);
    const almacenes = llamadas.find(item => item.tabla === 'almacenes');
    expect(almacenes.columnas).toBe('id,empresa_id,codigo,nombre,estado');
    expect(almacenes.filtros).toEqual([['eq', 'empresa_id', 'e1'], ['eq', 'estado', 'activo']]);
    const ubicaciones = llamadas.find(item => item.tabla === 'ubicaciones');
    expect(ubicaciones.filtros).toEqual([['eq', 'empresa_id', 'e1'], ['eq', 'activo', true]]);
    const consultasStock = llamadas.filter(item => item.tabla === 'stock');
    expect(consultasStock[0].columnas).toBe('empresa_id,material_id,almacen_id,ubicacion_id,lote,serie,sociedad_id,fisico');
    expect(consultasStock[0].filtros).toEqual([['eq', 'empresa_id', 'e1'], ['gt', 'fisico', 0], ['eq', 'sociedad_id', 's1']]);
    expect(consultasStock[0].ordenes.map(([columna]) => columna)).toEqual(['material_id', 'almacen_id', 'ubicacion_id', 'lote', 'serie', 'sociedad_id']);
  });

  it('filtra por sociedades en vista consolidada cuando el alcance es explícito', async () => {
    await cargarMapaUbicaciones({ empresaId: 'e1', vistaConsolidada: true, sociedadesIdsAlcance: ['s1', 's2'] });
    expect(llamadas.find(item => item.tabla === 'stock').filtros).toContainEqual(['in', 'sociedad_id', ['s1', 's2']]);
  });
});
