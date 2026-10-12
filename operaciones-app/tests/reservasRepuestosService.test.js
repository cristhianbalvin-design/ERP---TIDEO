import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc }) }));
import { conciliarCierreOT, despacharReservaOT, liberarReservaOT, listarReservasOT } from '../src/services/reservasRepuestosService.js';

describe('reservasRepuestosService', () => {
  beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null }); });

  it('llama listarReservasOT con nombre RPC y parámetros exactos', async () => {
    await listarReservasOT({ empresa_id: 'empresa-1', ot_id: 'ot-1' });
    expect(rpc).toHaveBeenCalledWith('wms_reservas_ot', { p_empresa_id: 'empresa-1', p_ot_id: 'ot-1' });
  });

  it('llama despacharReservaOT con nombre RPC y parámetros exactos', async () => {
    const lineas = [{ ot_segmento_repuesto_id: 'segmento-1', cantidad: 2 }];
    await despacharReservaOT({ empresa_id: 'empresa-1', ot_id: 'ot-1', lineas, recibe_en_taller: 'Taller A', observacion: 'Entrega' });
    expect(rpc).toHaveBeenCalledWith('wms_despachar_reserva_ot', {
      p_empresa_id: 'empresa-1', p_ot_id: 'ot-1', p_lineas: lineas,
      p_recibe_en_taller: 'Taller A', p_observacion: 'Entrega',
    });
  });

  it('llama liberarReservaOT con nombre RPC y parámetros exactos', async () => {
    await liberarReservaOT({ empresa_id: 'empresa-1', ot_segmento_repuesto_id: 'segmento-9', cantidad: 1.5, motivo: 'Corrección', observacion: 'Nota' });
    expect(rpc).toHaveBeenCalledWith('wms_liberar_reserva_ot', {
      p_empresa_id: 'empresa-1', p_ot_segmento_repuesto_id: 'segmento-9', p_cantidad: 1.5,
      p_motivo: 'Corrección', p_observacion: 'Nota',
    });
  });

  it('llama conciliarCierreOT con nombre RPC y parámetros exactos', async () => {
    await conciliarCierreOT({ empresa_id: 'empresa-1', ot_id: 'ot-1' });
    expect(rpc).toHaveBeenCalledWith('wms_conciliar_cierre_ot', { p_empresa_id: 'empresa-1', p_ot_id: 'ot-1' });
  });

  it('lanza Error conservando message y code cuando falla el RPC', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Reserva no liberable', code: 'WMS409' } });
    await expect(liberarReservaOT({ empresa_id: 'empresa-1', ot_segmento_repuesto_id: 'segmento-9', cantidad: 1, motivo: 'Ajuste' }))
      .rejects.toMatchObject({ name: 'Error', message: 'Reserva no liberable', code: 'WMS409' });
  });
});
