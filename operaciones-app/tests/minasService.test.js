import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc: mocks.rpc }) }));
import { asignarAlmacenMina, crearAlmacenPeriferico, guardarMina, guardarProyectoMina, listarMinas, listarProyectosOT } from '../src/services/minasService.js';

describe('minasService', () => {
  beforeEach(() => mocks.rpc.mockReset().mockResolvedValue({ data: {}, error: null }));
  it('envía exactamente los parámetros declarados por cada RPC, sin undefined', async () => {
    await listarMinas({ empresa_id: 'e1' });
    await guardarMina({ empresa_id: 'e1', cuenta_id: 'c1', codigo: 'M1', nombre: 'Mina' });
    await guardarProyectoMina({ empresa_id: 'e1', mina_id: 'm1' });
    await asignarAlmacenMina({ empresa_id: 'e1', almacen_id: 'a1' });
    await crearAlmacenPeriferico({ empresa_id: 'e1', mina_id: 'm1', codigo: 'A1', nombre: 'Periférico' });
    await listarProyectosOT({ empresa_id: 'e1' });
    expect(mocks.rpc.mock.calls).toEqual([
      ['wms_listar_minas', { p_empresa_id: 'e1' }],
      ['wms_guardar_mina', { p_empresa_id: 'e1', p_id: null, p_cuenta_id: 'c1', p_codigo: 'M1', p_nombre: 'Mina', p_estado: 'activo' }],
      ['wms_guardar_proyecto_mina', { p_empresa_id: 'e1', p_mina_id: 'm1', p_proyecto_id: null, p_codigo: null, p_nombre: null, p_estado: null }],
      ['wms_asignar_almacen_mina', { p_empresa_id: 'e1', p_almacen_id: 'a1', p_mina_id: null }],
      ['wms_crear_almacen_periferico', { p_empresa_id: 'e1', p_mina_id: 'm1', p_codigo: 'A1', p_nombre: 'Periférico' }],
      ['wms_listar_proyectos_ot', { p_empresa_id: 'e1' }],
    ]);
    expect(mocks.rpc.mock.calls.flatMap(([, params]) => Object.values(params)).some(value => value === undefined)).toBe(false);
  });
  it('propaga el mensaje y código entregados por Supabase', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Hay stock fuera de General', code: 'P0001' } });
    await expect(asignarAlmacenMina({ empresa_id: 'e1', almacen_id: 'a1', mina_id: null })).rejects.toMatchObject({ message: 'Hay stock fuera de General', code: 'P0001' });
  });
});
