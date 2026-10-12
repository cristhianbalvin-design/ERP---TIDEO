import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), query: [] }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));

import { listarEstadosDiagnosticoRecepcion } from '../src/services/recepcionesActivosClienteService.js';

function queryFor(rows) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query),
    then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
  };
  return query;
}

describe('listarEstadosDiagnosticoRecepcion', () => {
  beforeEach(() => { mocks.from.mockReset(); });

  it('consulta solo diagnósticos de mantenimiento de la empresa y prioriza borrador', async () => {
    const query = queryFor([
      { id: 'issued-1', recepcion_id: 'r1', estado: 'emitido', tipo: 'mantenimiento' },
      { id: 'draft-1', recepcion_id: 'r1', estado: 'borrador', tipo: 'mantenimiento' },
      { id: 'issued-2', recepcion_id: 'r2', estado: 'emitido', tipo: 'mantenimiento' },
    ]);
    mocks.from.mockReturnValue(query);
    await expect(listarEstadosDiagnosticoRecepcion('empresa-test', ['r1', 'r2', 'r1'])).resolves.toEqual({
      r1: { estado: 'borrador', id: 'draft-1', diagnostico_id: 'draft-1' },
      r2: { estado: 'emitido', id: 'issued-2', diagnostico_id: 'issued-2' },
    });
    expect(mocks.from).toHaveBeenCalledWith('diagnosticos_tecnicos');
    expect(query.select).toHaveBeenCalledWith('id,recepcion_id,estado,tipo');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'empresa_id', 'empresa-test');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'tipo', 'mantenimiento');
    expect(query.in).toHaveBeenCalledWith('recepcion_id', ['r1', 'r2']);
  });

  it('omite la consulta cuando no recibe recepciones y exige empresa', async () => {
    await expect(listarEstadosDiagnosticoRecepcion('empresa-test', [])).resolves.toEqual({});
    expect(mocks.from).not.toHaveBeenCalled();
    await expect(listarEstadosDiagnosticoRecepcion('', ['r1'])).rejects.toThrow('No se pudo identificar la empresa');
  });
});
