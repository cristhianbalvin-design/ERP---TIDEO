import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc }) }));
import { anularMovimiento, liberarCuarentena, registrarMovimientoManual, transferirStock } from '../src/services/inventarioMovimientosService.js';

describe('inventarioMovimientosService', () => {
  beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: { kardex_id: 'k1', saldo: 2 }, error: null }); });

  it('normaliza opcionales vacíos o con espacios a null y aplica moneda por defecto', async () => {
    await registrarMovimientoManual({ empresa_id: 'e1', accion: 'entrada', motivo: 'saldo_inicial', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u1', sociedad_id: 'soc1', cantidad: 1, lote: '  ', serie: '', vencimiento: ' ', nro_documento: '   ', observacion: '', moneda: '  ' });
    expect(rpc).toHaveBeenCalledWith('wms_registrar_movimiento_manual', expect.objectContaining({
      p_moneda: 'PEN', p_vencimiento: null, p_lote: null, p_serie: null, p_nro_documento: null, p_observacion: null,
    }));
  });

  it('llama la RPC de registro con parámetros completos y exactos', async () => {
    const form = { empresa_id: 'e1', accion: 'entrada', motivo: 'saldo_inicial', material_id: 'm1', almacen_id: 'a1', ubicacion_id: 'u1', sociedad_id: 'soc1', cantidad: 3, costo_unitario: 4, moneda: 'USD', lote: 'L-1', serie: null, vencimiento: '2027-01-01', nro_documento: null, observacion: 'Inicio' };
    await registrarMovimientoManual(form);
    expect(rpc).toHaveBeenCalledWith('wms_registrar_movimiento_manual', {
      p_empresa_id: 'e1', p_accion: 'entrada', p_motivo: 'saldo_inicial', p_material_id: 'm1', p_almacen_id: 'a1', p_ubicacion_id: 'u1', p_sociedad_id: 'soc1', p_cantidad: 3, p_costo_unitario: 4, p_moneda: 'USD', p_lote: 'L-1', p_serie: null, p_vencimiento: '2027-01-01', p_nro_documento: null, p_observacion: 'Inicio',
    });
  });

  it('llama la RPC de anulación con parámetros exactos', async () => {
    await anularMovimiento({ empresa_id: 'e1', kardex_id: 'k2', motivo: 'Error de ingreso' });
    expect(rpc).toHaveBeenCalledWith('wms_anular_movimiento', { p_empresa_id: 'e1', p_kardex_id: 'k2', p_motivo: 'Error de ingreso' });
  });

  it('llama la RPC de transferencia con los parámetros exactos y limpia la observación vacía', async () => {
    await transferirStock({ empresa_id: 'e1', stock_origen_id: 'st-1', almacen_destino_id: 'a2', ubicacion_destino_id: 'u2', cantidad: 2.5, observacion: '  ' });
    expect(rpc).toHaveBeenCalledWith('wms_transferir_stock', {
      p_empresa_id: 'e1', p_stock_origen_id: 'st-1', p_almacen_destino_id: 'a2',
      p_ubicacion_destino_id: 'u2', p_cantidad: 2.5, p_observacion: null,
    });
  });

  it('llama liberarCuarentena con nombres exactos y ninguno undefined', async () => {
    await liberarCuarentena({ empresa_id: 'e1', stock_origen_id: 'st-1', almacen_destino_id: 'a2', ubicacion_destino_id: 'u2', cantidad: 2, motivo: 'Inspección aprobada', observacion: 'Nota' });
    expect(rpc).toHaveBeenCalledWith('wms_liberar_cuarentena', {
      p_empresa_id: 'e1', p_stock_origen_id: 'st-1', p_almacen_destino_id: 'a2',
      p_ubicacion_destino_id: 'u2', p_cantidad: 2, p_motivo: 'Inspección aprobada', p_observacion: 'Nota',
    });
    expect(Object.values(rpc.mock.calls[0][1]).some(valor => valor === undefined)).toBe(false);
  });

  it('propaga el mensaje de servidor sin envolverlo en detalles técnicos', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'No hay unidades disponibles en esa ubicación.' } });
    await expect(anularMovimiento({ empresa_id: 'e1', kardex_id: 'k1', motivo: 'Corrección' })).rejects.toThrow('No hay unidades disponibles en esa ubicación.');
  });
});
