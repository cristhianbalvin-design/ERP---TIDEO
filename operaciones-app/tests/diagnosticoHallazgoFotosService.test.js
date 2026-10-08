import { beforeEach, describe, expect, it, vi } from 'vitest';

const { supabase, table, storageBucket, randomUUID } = vi.hoisted(() => {
  const table = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), insert: vi.fn(), delete: vi.fn(), update: vi.fn(), single: vi.fn(), then: vi.fn() };
  const storageBucket = { upload: vi.fn(), remove: vi.fn(), createSignedUrls: vi.fn() };
  const supabase = { from: vi.fn(() => table), storage: { from: vi.fn(() => storageBucket) } };
  return { supabase, table, storageBucket, randomUUID: vi.fn(() => 'uuid-1') };
});
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => supabase }));
import { actualizarFotoHallazgo, borrarFotoHallazgo, firmarRutasFotosHallazgos, listarFotosHallazgos, subirFotoHallazgo } from '../src/services/diagnosticoHallazgoFotosService.js';

const img = () => ({ name: 'origen.png', type: 'image/png' });
let createObjectURL, revokeObjectURL, oldImage, oldCreateElement, oldRandomUUID;

function mockBrowser(blobSizes = [500]) {
  globalThis.Image = class { naturalWidth = 1200; naturalHeight = 800; set src(_value) { queueMicrotask(() => this.onload()); } };
  globalThis.document = { createElement: vi.fn(() => ({ getContext: () => ({ drawImage: vi.fn() }), toBlob: vi.fn((cb, _type, quality) => cb(new Blob([new Uint8Array(blobSizes.shift() || 500)], { type: 'image/jpeg' }))) })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  oldImage = globalThis.Image; oldCreateElement = globalThis.document?.createElement; oldRandomUUID = globalThis.crypto?.randomUUID;
  createObjectURL = vi.fn(() => 'blob:foto'); revokeObjectURL = vi.fn();
  globalThis.URL.createObjectURL = createObjectURL; globalThis.URL.revokeObjectURL = revokeObjectURL;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID } });
  table.select.mockReturnValue(table); table.eq.mockReturnValue(table); table.in.mockReturnValue(table); table.order.mockReturnValue(table);
  table.insert.mockReturnValue(table); table.delete.mockReturnValue(table); table.update.mockReturnValue(table);
  table.then.mockImplementation(resolve => resolve({ count: 0, data: [], error: null }));
  table.single.mockResolvedValue({ data: { id: 'f1' }, error: null });
  storageBucket.upload.mockResolvedValue({ error: null }); storageBucket.remove.mockResolvedValue({ error: null });
});

describe('diagnosticoHallazgoFotosService', () => {
  it('firma rutas únicas del bucket privado por una hora', async () => {
    storageBucket.createSignedUrls.mockResolvedValueOnce({ data: [
      { path: 'e/d/h/a.jpg', signedUrl: 'https://signed/a' },
      { path: 'e/d/h/b.jpg', signedUrl: 'https://signed/b' },
    ], error: null });
    await expect(firmarRutasFotosHallazgos(['e/d/h/a.jpg', 'e/d/h/a.jpg', 'e/d/h/b.jpg'])).resolves.toEqual(new Map([
      ['e/d/h/a.jpg', 'https://signed/a'],
      ['e/d/h/b.jpg', 'https://signed/b'],
    ]));
    expect(supabase.storage.from).toHaveBeenCalledWith('diagnostico-fotos');
    expect(storageBucket.createSignedUrls).toHaveBeenCalledWith(['e/d/h/a.jpg', 'e/d/h/b.jpg'], 60 * 60);
    await expect(firmarRutasFotosHallazgos([])).resolves.toEqual(new Map());
  });

  it('rechaza sin hallazgo y al alcanzar tres fotos', async () => {
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', archivo: img() })).rejects.toThrow('Guarda el hallazgo antes de agregar fotos.');
    table.then.mockImplementationOnce(resolve => resolve({ count: 3, data: null, error: null }));
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img() })).rejects.toThrow('Un hallazgo admite como máximo tres fotos.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('comprime hasta quedar debajo de 1.5 MB y usa ruta con empresa, diagnóstico, hallazgo y uuid', async () => {
    mockBrowser([1600000, 1400000]);
    table.then.mockImplementationOnce(resolve => resolve({ count: 0, error: null }));
    const result = await subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img(), leyenda: '  Vista  ' });
    expect(storageBucket.upload).toHaveBeenCalledWith('e/d/h/uuid-1.jpg', expect.any(Blob), expect.objectContaining({ contentType: 'image/jpeg' }));
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({ ruta_storage: 'e/d/h/uuid-1.jpg', leyenda: 'Vista', tamano_bytes: 1400000 }));
    expect(result.id).toBe('f1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:foto');
  });

  it('falla si no logra comprimir a 1.5 MB o menos', async () => {
    mockBrowser(Array(8).fill(1600000));
    table.then.mockImplementationOnce(resolve => resolve({ count: 0, error: null }));
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img() })).rejects.toThrow('No se pudo comprimir la foto por debajo de 1.5 MB.');
    expect(storageBucket.upload).not.toHaveBeenCalled();
  });

  it('compensa quitando el objeto si falla insertar la fila', async () => {
    mockBrowser(); table.then.mockImplementationOnce(resolve => resolve({ count: 0, error: null }));
    table.single.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } });
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img() })).rejects.toThrow('insert failed');
    expect(storageBucket.remove).toHaveBeenCalledWith(['e/d/h/uuid-1.jpg']);
  });

  it('borra primero la fila y reporta huérfana si falla quitar el objeto', async () => {
    const order = [];
    table.delete.mockImplementation(() => { order.push('fila'); return table; });
    table.single.mockResolvedValueOnce({ data: { ruta_storage: 'e/d/h/f.jpg' }, error: null });
    storageBucket.remove.mockImplementation(async () => { order.push('objeto'); return { error: { message: 'storage' } }; });
    await expect(borrarFotoHallazgo({ empresaId: 'e', id: 'f1' })).resolves.toEqual({ huerfana: true });
    expect(order).toEqual(['fila', 'objeto']);
  });

  it('lista con URL firmada, evita consulta sin ids y actualiza leyenda/exclusión', async () => {
    table.then.mockImplementationOnce(resolve => resolve({ data: [{ id: 'f1', ruta_storage: 'e/d/h/a.jpg' }], error: null }));
    storageBucket.createSignedUrls.mockResolvedValueOnce({ data: [{ path: 'e/d/h/a.jpg', signedUrl: 'https://signed' }], error: null });
    await expect(listarFotosHallazgos('e', ['h'])).resolves.toEqual([expect.objectContaining({ signedUrl: 'https://signed' })]);
    const calls = supabase.from.mock.calls.length;
    await expect(listarFotosHallazgos('e', [])).resolves.toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(calls);
    table.single.mockResolvedValueOnce({ data: { leyenda: null, excluir_del_informe: true }, error: null });
    await actualizarFotoHallazgo({ empresaId: 'e', id: 'f1', leyenda: '   ', excluir_del_informe: true });
    expect(table.update).toHaveBeenCalledWith({ leyenda: null, excluir_del_informe: true });
  });

  it('traduce 0 filas y mensajes de trigger a mensajes legibles', async () => {
    table.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    await expect(actualizarFotoHallazgo({ empresaId: 'e', id: 'f1', leyenda: '', excluir_del_informe: false })).rejects.toThrow('No se puede modificar esta foto en el estado actual del informe.');
    table.then.mockImplementationOnce(resolve => resolve({ count: 3, error: { message: 'máximo tres fotos' } }));
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img() })).rejects.toThrow('Un hallazgo admite como máximo tres fotos.');
    table.then.mockImplementationOnce(resolve => resolve({ count: 0, error: null })); storageBucket.upload.mockResolvedValueOnce({ error: { message: 'informe emitido' } });
    mockBrowser();
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img() })).rejects.toThrow('No se pueden modificar fotos: ya existe un informe emitido para esta recepción.');
    table.then.mockImplementationOnce(resolve => resolve({ count: 0, error: null })); storageBucket.upload.mockResolvedValueOnce({ error: { message: 'solo se pueden modificar fotos de un diagnóstico en borrador' } });
    await expect(subirFotoHallazgo({ empresaId: 'e', diagnosticoId: 'd', hallazgoId: 'h', archivo: img() })).rejects.toThrow('Solo se pueden modificar fotos de un diagnóstico en borrador.');
  });
});
