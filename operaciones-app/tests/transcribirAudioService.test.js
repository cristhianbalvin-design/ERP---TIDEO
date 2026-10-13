import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ functions: { invoke } }) }));
import { transcribirAudio } from '../src/services/transcribirAudio.js';

describe('servicio transcribirAudio', () => {
  beforeEach(() => invoke.mockReset());
  it('envía multipart al endpoint y devuelve el texto', async () => {
    invoke.mockResolvedValue({ data: { ok: true, texto: 'Vástago reparado' }, error: null });
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await expect(transcribirAudio({ diagnosticoId: 'dt_a', blob })).resolves.toBe('Vástago reparado');
    expect(invoke).toHaveBeenCalledWith('transcribir-audio', expect.objectContaining({ body: expect.any(FormData) }));
    expect(invoke.mock.calls[0][1].body.get('diagnostico_id')).toBe('dt_a');
  });
  it('traduce permisos, timeout y falta de conexión a mensajes claros', async () => {
    invoke.mockResolvedValueOnce({ error: { context: { status: 403, json: async () => ({ error: 'No tienes permiso.' }) } } });
    await expect(transcribirAudio({ diagnosticoId: 'dt_a', blob: new Blob(['x']) })).rejects.toThrow('No tienes permiso.');
    invoke.mockResolvedValueOnce({ error: { context: { status: 504 } } });
    await expect(transcribirAudio({ diagnosticoId: 'dt_a', blob: new Blob(['x']) })).rejects.toThrow('La transcripción superó el tiempo límite');
    invoke.mockResolvedValueOnce({ error: { name: 'FunctionsFetchError' } });
    await expect(transcribirAudio({ diagnosticoId: 'dt_a', blob: new Blob(['x']) })).rejects.toThrow('Sin conexión');
  });
});
