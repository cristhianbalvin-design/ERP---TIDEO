import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc }) }));
import { anularMovimiento, registrarMovimientoManual } from '../src/services/inventarioMovimientosService.js';

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

  it('propaga el mensaje de servidor sin envolverlo en detalles técnicos', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'No hay unidades disponibles en esa ubicación.' } });
    await expect(anularMovimiento({ empresa_id: 'e1', kardex_id: 'k1', motivo: 'Corrección' })).rejects.toThrow('No hay unidades disponibles en esa ubicación.');
  });
});
