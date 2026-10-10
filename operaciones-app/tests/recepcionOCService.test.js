import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, queryCalls, tableData } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), queryCalls: [], tableData: {} }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc, from }) }));
import { cargarRecepcionesOC, cargarUbicacionesAlmacen, registrarRecepcionOC } from '../src/services/recepcionOCService.js';

describe('registrarRecepcionOC', () => {
  beforeEach(() => {
    rpc.mockReset(); from.mockReset(); queryCalls.length = 0;
    Object.keys(tableData).forEach(key => delete tableData[key]);
    from.mockImplementation(table => {
      const query = { table, filters: [] };
      queryCalls.push(query);
      const builder = {
        select: columns => { query.columns = columns; return builder; },
        eq: (column, value) => { query.filters.push(['eq', column, value]); return builder; },
        in: (column, values) => { query.filters.push(['in', column, [...values]]); return builder; },
        order: (column, options) => { query.order = [column, options]; return builder; },
        then: (resolve, reject) => Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve, reject),
      };
      return builder;
    });
  });
  it('envía los argumentos exactos al RPC y convierte ubicaciones vacías en opcionales', async () => {
    rpc.mockResolvedValue({ data: { recepcion_id: 'r1' }, error: null });
    await registrarRecepcionOC({ empresaId: 'e1', ordenCompraId: 'oc1', almacenId: 'a1', lineas: [{ idx: 2, recibido: 3, ubicacion_id: 'u1' }, { idx: 4, recibido: 1, ubicacion_id: null }], observaciones: 'Líneas observadas: Filtro' });
    expect(rpc).toHaveBeenCalledWith('registrar_recepcion_oc_fisica', {
      p_empresa_id: 'e1', p_orden_compra_id: 'oc1', p_almacen_id: 'a1',
      p_items: [{ idx: 2, recibido: 3, ubicacion_id: 'u1' }, { idx: 4, recibido: 1 }],
      p_observaciones: 'Líneas observadas: Filtro',
    });
  });
  it('propaga sin alterar el mensaje del servidor', async () => {
    const error = new Error('La orden de compra no tiene ingresos pendientes de factura.');
    rpc.mockResolvedValue({ data: null, error });
    await expect(registrarRecepcionOC({ empresaId: 'e1', ordenCompraId: 'oc1', almacenId: 'a1', lineas: [] })).rejects.toBe(error);
  });

  it('consulta recepciones solo para ids de OC y en lotes de 100', async () => {
    tableData.ordenes_compra = Array.from({ length: 205 }, (_, idx) => ({ id: `oc-${idx}`, proveedor_id: null }));
    const resultado = await cargarRecepcionesOC({ empresaId: 'e1', sociedadId: 's1' });
    const consultas = queryCalls.filter(query => query.table === 'recepciones');
    expect(consultas.map(query => query.filters.find(([tipo]) => tipo === 'in')?.[2].length)).toEqual([100, 100, 5]);
    expect(consultas.every(query => query.filters.some(([tipo, columna, valor]) => tipo === 'eq' && columna === 'empresa_id' && valor === 'e1'))).toBe(true);
    expect(consultas.flatMap(query => query.filters.find(([tipo]) => tipo === 'in')?.[2] || [])).toEqual(tableData.ordenes_compra.map(oc => oc.id));
    expect(resultado.recepciones).toEqual([]);
  });

  it('no consulta recepciones cuando no hay OC', async () => {
    tableData.ordenes_compra = [];
    await cargarRecepcionesOC({ empresaId: 'e1', sociedadId: 's1' });
    expect(queryCalls.some(query => query.table === 'recepciones')).toBe(false);
  });

  it('carga destinos activos con el uso y almacén filtrados', async () => {
    tableData.ubicaciones = [{ id: 'u1', uso: 'cuarentena' }];
    const resultado = await cargarUbicacionesAlmacen('e1', 'a1');
    const llamada = queryCalls.find(query => query.table === 'ubicaciones');
    expect(llamada.filters).toEqual([['eq', 'empresa_id', 'e1'], ['eq', 'almacen_id', 'a1'], ['eq', 'activo', true]]);
    expect(llamada.columns).toContain('uso');
    expect(resultado).toEqual(tableData.ubicaciones);
    expect(llamada).toBeTruthy();
  });
});
