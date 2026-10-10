import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, llamadas, respuestas, estado, errores } = vi.hoisted(() => ({ from: vi.fn(), llamadas: [], respuestas: {}, estado: { sinFilas: false }, errores: {} }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ from }) }));
import { actualizarUbicacion, cambiarEstadoUbicacion, cargarMapaUbicaciones, cargarMaterialesPorIds, crearUbicacion } from '../src/services/ubicacionesService.js';

describe('cargarMapaUbicaciones', () => {
  beforeEach(() => {
    llamadas.length = 0;
    Object.keys(respuestas).forEach(tabla => delete respuestas[tabla]); Object.keys(errores).forEach(tabla => delete errores[tabla]); estado.sinFilas = false;
    from.mockImplementation(tabla => {
      const consulta = { tabla, filtros: [], ordenes: [], rangos: [] };
      llamadas.push(consulta);
      const builder = {
        select: columnas => { consulta.columnas = columnas; return builder; },
        insert: valores => { consulta.insert = valores; return builder; },
        update: valores => { consulta.update = valores; return builder; },
        eq: (columna, valor) => { consulta.filtros.push(['eq', columna, valor]); return builder; },
        gt: (columna, valor) => { consulta.filtros.push(['gt', columna, valor]); return builder; },
        in: (columna, valor) => { consulta.filtros.push(['in', columna, valor]); return builder; },
        order: (columna, opciones) => { consulta.ordenes.push([columna, opciones]); return builder; },
        range: (desde, hasta) => { consulta.rangos.push([desde, hasta]); consulta.rango = [desde, hasta]; return builder; },
        single: () => Promise.resolve({ data: respuestas[tabla]?.[0] || consulta.insert, error: errores[tabla] || null }),
        maybeSingle: () => Promise.resolve({ data: estado.sinFilas ? null : { id: 'u1' }, error: errores[tabla] || null }),
        then: (resolve, reject) => {
          const valores = respuestas[tabla] || [];
          const pagina = consulta.rango ? valores.slice(consulta.rango[0], consulta.rango[1] + 1) : valores;
          return Promise.resolve({ data: pagina, error: errores[tabla] || null }).then(resolve, reject);
        },
      };
      return builder;
    });
  });

  it('lee almacenes activos, todas las ubicaciones con uso y stock de empresa con sociedad y paginación de 1000', async () => {
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
    expect(ubicaciones.filtros).toEqual([['eq', 'empresa_id', 'e1']]);
    expect(ubicaciones.columnas).toContain('uso');
    const consultasStock = llamadas.filter(item => item.tabla === 'stock');
    expect(consultasStock[0].columnas).toBe('empresa_id,material_id,almacen_id,ubicacion_id,lote,serie,sociedad_id,fisico');
    expect(consultasStock[0].filtros).toEqual([['eq', 'empresa_id', 'e1'], ['gt', 'fisico', 0], ['eq', 'sociedad_id', 's1']]);
    expect(consultasStock[0].ordenes.map(([columna]) => columna)).toEqual(['material_id', 'almacen_id', 'ubicacion_id', 'lote', 'serie', 'sociedad_id']);
  });

  it('inserta ubicación con sus columnas de alta y propaga el error original', async () => {
    const creada = await crearUbicacion({ empresaId: 'e1', almacenId: 'a1', codigo: 'P-1', nombre: 'Piso', tipo: 'piso', padreId: 'z1', uso: 'merma' });
    expect(creada).toMatchObject({ almacen_id: 'a1', codigo: 'P-1' });
    expect(llamadas.find(item => item.tabla === 'ubicaciones').insert).toMatchObject({ empresa_id: 'e1', almacen_id: 'a1', codigo: 'P-1', tipo: 'piso', padre_id: 'z1', uso: 'merma', activo: true });
    const error = Object.assign(new Error('trigger detail'), { code: 'P0001' }); errores.ubicaciones = error;
    await expect(crearUbicacion({ empresaId: 'e1', almacenId: 'a1', codigo: 'X', nombre: 'X', tipo: 'zona' })).rejects.toBe(error);
  });

  it('actualiza solamente código, nombre, uso y updated_at; exige fila de retorno', async () => {
    await actualizarUbicacion({ empresaId: 'e1', id: 'u1', codigo: 'P-2', nombre: 'Posición', uso: 'recepcion' });
    const llamada = llamadas.find(item => item.update);
    expect(llamada.update).toMatchObject({ codigo: 'P-2', nombre: 'Posición', uso: 'recepcion' });
    expect(Object.keys(llamada.update).sort()).toEqual(['codigo', 'nombre', 'updated_at', 'uso']);
    expect(llamada.filtros).toEqual([['eq', 'empresa_id', 'e1'], ['eq', 'id', 'u1']]);
    estado.sinFilas = true;
    await expect(actualizarUbicacion({ empresaId: 'e1', id: 'gone', codigo: 'X', nombre: 'X', uso: 'almacenaje' })).rejects.toThrow('No se pudo guardar: sin permiso o la ubicación ya no existe');
  });

  it('cambia estado con filtros de empresa e id y carga materiales por lotes de 100', async () => {
    await cambiarEstadoUbicacion({ empresaId: 'e1', id: 'u1', activo: false });
    const llamada = llamadas.find(item => item.update);
    expect(llamada.update).toMatchObject({ activo: false });
    expect(llamada.filtros).toEqual([['eq', 'empresa_id', 'e1'], ['eq', 'id', 'u1']]);
    await cargarMaterialesPorIds('e1', Array.from({ length: 101 }, (_, idx) => `m${idx}`));
    expect(llamadas.filter(item => item.tabla === 'materiales').map(item => item.filtros.find(([tipo]) => tipo === 'in')[2])).toHaveLength(2);
    expect(llamadas.filter(item => item.tabla === 'materiales').map(item => item.filtros.find(([tipo]) => tipo === 'in')[2].length)).toEqual([100, 1]);
  });

  it('filtra por sociedades en vista consolidada cuando el alcance es explícito', async () => {
    await cargarMapaUbicaciones({ empresaId: 'e1', vistaConsolidada: true, sociedadesIdsAlcance: ['s1', 's2'] });
    expect(llamadas.find(item => item.tabla === 'stock').filtros).toContainEqual(['in', 'sociedad_id', ['s1', 's2']]);
  });
});
