import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ from: vi.fn(), createSignedUrls: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => ({ storage }) }));
import { prepararImagenesInforme } from '../src/services/informePdfImagenes.js';

class Reader {
  readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,AA==`;
    queueMicrotask(() => this.onload());
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.from.mockReturnValue({ createSignedUrls: storage.createSignedUrls });
  storage.createSignedUrls.mockResolvedValue({ data: [], error: null });
  vi.stubGlobal('FileReader', Reader);
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, blob: async () => new Blob(['image'], { type: url.includes('logo') ? 'image/png' : 'image/jpeg' }) })));
});

describe('prepararImagenesInforme', () => {
  it('firma todas las rutas en lote, convierte fotos y logo a data URI', async () => {
    storage.createSignedUrls.mockResolvedValue({ data: [
      { path: 'e/d/h/a.jpg', signedUrl: 'https://signed/a' },
      { path: 'e/d/h/b.jpg', signedUrl: 'https://signed/b' },
    ], error: null });
    const result = await prepararImagenesInforme({
      empresa: { logo_url: 'https://logo/image' },
      hallazgos: [{ fotos: [{ ruta_storage: 'e/d/h/a.jpg' }, { ruta_storage: 'e/d/h/b.jpg' }, { ruta_storage: 'e/d/h/a.jpg' }] }],
    });
    expect(storage.from).toHaveBeenCalledWith('diagnostico-fotos');
    expect(storage.createSignedUrls).toHaveBeenCalledOnce();
    expect(storage.createSignedUrls).toHaveBeenCalledWith(['e/d/h/a.jpg', 'e/d/h/b.jpg'], 600);
    expect(result.fotos).toEqual({ 'e/d/h/a.jpg': 'data:image/jpeg;base64,AA==', 'e/d/h/b.jpg': 'data:image/jpeg;base64,AA==' });
    expect(result.logo).toBe('data:image/png;base64,AA==');
    expect(result.warnings).toEqual([]);
  });

  it('omite fotos fallidas con advertencias en español y no falla la preparación', async () => {
    storage.createSignedUrls.mockResolvedValue({ data: [
      { path: 'ok.jpg', signedUrl: 'https://signed/ok' },
      { path: 'bad.jpg', signedUrl: 'https://signed/bad' },
    ], error: null });
    fetch.mockImplementation(async url => url.endsWith('/bad')
      ? ({ ok: false, blob: async () => new Blob() })
      : ({ ok: true, blob: async () => new Blob(['ok'], { type: 'image/jpeg' }) }));
    const result = await prepararImagenesInforme({ hallazgos: [{ fotos: [{ ruta_storage: 'ok.jpg' }, { ruta_storage: 'bad.jpg' }] }] });
    expect(result.fotos).toEqual({ 'ok.jpg': 'data:image/jpeg;base64,AA==' });
    expect(result.warnings).toEqual(['No se pudo cargar una foto.']);
  });

  it('devuelve logo null cuando falta la ruta o falla su descarga', async () => {
    await expect(prepararImagenesInforme({ empresa: {}, hallazgos: [] })).resolves.toEqual({ logo: null, firma: null, fotos: {}, dimensionesFotos: {}, warnings: [] });
    fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(prepararImagenesInforme({ empresa: { logo_url: 'https://logo/image' }, hallazgos: [] })).resolves.toEqual({ logo: null, firma: null, fotos: {}, dimensionesFotos: {}, warnings: [] });
  });

  it('no accede a Storage cuando no hay rutas de fotos', async () => {
    await prepararImagenesInforme({ hallazgos: [{ fotos: [{ ruta_storage: null }, {}] }] });
    expect(storage.from).not.toHaveBeenCalled();
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
});
