import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ rpc }) }));

import {
  buscarMaterialesMina, contextoReporteMina, guardarReporteMina, listarReportesMina, revisarReporteMina,
} from '../src/services/reportesMinaService.js';

describe('reportesMinaService', () => {
  beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null }); });

  it('llama a cada RPC con sus parámetros', async () => {
    await listarReportesMina({ empresa_id: 'e1', sociedad_id: 's1' });
    expect(rpc).toHaveBeenLastCalledWith('ops_reportes_mina_listar', { p_empresa_id: 'e1', p_sociedad_id: 's1' });
    await contextoReporteMina({ empresa_id: 'e1' });
    expect(rpc).toHaveBeenLastCalledWith('ops_reportes_mina_contexto', { p_empresa_id: 'e1', p_sociedad_id: null });
    await guardarReporteMina({ empresa_id: 'e1', reporte: { ot_id: 'ot' }, enviar: true });
    expect(rpc).toHaveBeenLastCalledWith('ops_guardar_reporte_mina', { p_empresa_id: 'e1', p_reporte: { ot_id: 'ot' }, p_enviar: true });
    await revisarReporteMina({ empresa_id: 'e1', parte_id: 'pd', accion: 'observar', observacion: 'corrige' });
    expect(rpc).toHaveBeenLastCalledWith('ops_revisar_reporte_mina', { p_empresa_id: 'e1', p_parte_id: 'pd', p_accion: 'observar', p_observacion: 'corrige' });
    await buscarMaterialesMina({ empresa_id: 'e1', busqueda: 'gra' });
    expect(rpc).toHaveBeenLastCalledWith('buscar_materiales_ot', { p_empresa_id: 'e1', p_sociedad_id: null, p_busqueda: 'gra', p_limite: 20 });
  });

  it('propaga el mensaje del error de la RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Las horas del turno deben sumar 12 h (hoy suman 2).', code: 'P0001' } });
    await expect(guardarReporteMina({ empresa_id: 'e1', reporte: {}, enviar: true })).rejects.toThrow('deben sumar 12 h');
  });
});
