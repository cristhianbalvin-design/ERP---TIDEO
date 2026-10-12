import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ obtenerInformeVigente: vi.fn(), generarPdfInforme: vi.fn(), getSupabaseClient: vi.fn() }));

vi.mock('../src/services/diagnosticoInformeService.js', () => ({ obtenerInformeVigente: mocks.obtenerInformeVigente }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('../src/zahory-mock/pages/InformePdf.jsx', () => ({ generarPdfInforme: mocks.generarPdfInforme }));

import { abrirInformePdfDeRecepcion, listarInformesEmitidosRecepcion } from '../src/services/informePdfAcciones.js';

describe('abrirInformePdfDeRecepcion', () => {
  const snapshot = { cabecera: { numero_recepcion: 'RAC-2026-00003' }, emisor: {} };
  const ventana = { closed: false, location: {}, close: vi.fn() };
  let createElement;
  let anchor;
  let appendChild;
  let setTimeoutSpy;

  beforeEach(() => {
    vi.stubGlobal('window', { open: vi.fn(), setTimeout });
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:informe'), revokeObjectURL: vi.fn() });
    anchor = { click: vi.fn(), remove: vi.fn(), href: '', download: '' };
    createElement = vi.fn(() => anchor);
    appendChild = vi.fn();
    vi.stubGlobal('document', { createElement, body: { appendChild } });
    setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    mocks.obtenerInformeVigente.mockReset();
    mocks.generarPdfInforme.mockReset().mockResolvedValue({ blob: new Blob(['pdf']), warnings: [] });
    mocks.getSupabaseClient.mockReset();
    ventana.closed = false;
    ventana.location = {};
    ventana.close.mockReset();
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('fails when there are no issued reports and closes the blank window', async () => {
    mocks.obtenerInformeVigente.mockResolvedValue({ emitidos: [] });
    await expect(abrirInformePdfDeRecepcion('r-1', ventana)).rejects.toThrow('Esta recepci\u00f3n a\u00fan no tiene un informe emitido.');
    expect(ventana.close).toHaveBeenCalled();
  });

  it('generates the issued PDF and assigns the open window location', async () => {
    mocks.obtenerInformeVigente.mockResolvedValue({ emitidos: [{ version: 4, snapshot }] });
    await expect(abrirInformePdfDeRecepcion('r-1', ventana)).resolves.toEqual({ version: 4, warnings: [] });
    expect(mocks.generarPdfInforme).toHaveBeenCalledWith({ ...snapshot, emisor: { firma_url: null } });
    expect(ventana.location.href).toBe('blob:informe');
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    setTimeoutSpy.mock.calls[0][0]();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:informe');
  });

  it('renews the signed URL before generating the PDF', async () => {
    const firmado = { cabecera: snapshot.cabecera, emisor: { firma_url: 'https://old', firma_bucket: 'firmas', firma_storage_path: 'empresa/firma.png' } };
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null });
    mocks.getSupabaseClient.mockReturnValue({ storage: { from: vi.fn(() => ({ createSignedUrl })) } });
    mocks.obtenerInformeVigente.mockResolvedValue({ emitidos: [{ version: 2, snapshot: firmado }] });

    await abrirInformePdfDeRecepcion('r-1', ventana);

    expect(createSignedUrl).toHaveBeenCalledWith('empresa/firma.png', 600);
    expect(mocks.generarPdfInforme).toHaveBeenCalledWith({ ...firmado, emisor: { ...firmado.emisor, firma_url: 'https://signed' } });
  });

  it.each([null, undefined, 'closed'])('downloads with an anchor when there is no usable window (%s)', async (target) => {
    const destination = target === 'closed' ? { ...ventana, closed: true } : target;
    const unsafeSnapshot = { ...snapshot, cabecera: { numero_recepcion: 'RAC:<2026>/00003' } };
    mocks.obtenerInformeVigente.mockResolvedValue({ emitidos: [{ version: 4, snapshot: unsafeSnapshot }] });

    await abrirInformePdfDeRecepcion('r-1', destination);

    expect(createElement).toHaveBeenCalledWith('a');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.href).toBe('blob:informe');
    expect(anchor.download).toBe('Informe-diagnostico-RAC--2026--00003-v4.pdf');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it('closes the blank window and rethrows generation failures', async () => {
    const failure = new Error('failed');
    mocks.obtenerInformeVigente.mockResolvedValue({ emitidos: [{ version: 4, snapshot }] });
    mocks.generarPdfInforme.mockRejectedValue(failure);

    await expect(abrirInformePdfDeRecepcion('r-1', ventana)).rejects.toBe(failure);
    expect(ventana.close).toHaveBeenCalledOnce();
  });
});


describe('listarInformesEmitidosRecepcion', () => {
  it('returns the highest issued version per reception and skips empty id queries', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockResolvedValue({ data: [
      { recepcion_id: 'r-1', version: 1, estado: 'emitido' },
      { recepcion_id: 'r-2', version: 4, estado: 'emitido' },
      { recepcion_id: 'r-1', version: 3, estado: 'emitido' },
      { recepcion_id: 'r-1', version: 2, estado: 'emitido' },
    ], error: null });
    const from = vi.fn(() => query);
    mocks.getSupabaseClient.mockReset().mockReturnValue({ from });

    await expect(listarInformesEmitidosRecepcion('empresa-1', ['r-1', 'r-2'])).resolves.toEqual({
      'r-1': { version: 3 },
      'r-2': { version: 4 },
    });
    expect(from).toHaveBeenCalledWith('diagnostico_informes');
    expect(query.select).toHaveBeenCalledWith('recepcion_id,version,estado');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'empresa_id', 'empresa-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'estado', 'emitido');
    expect(query.in).toHaveBeenCalledWith('recepcion_id', ['r-1', 'r-2']);

    mocks.getSupabaseClient.mockClear();
    await expect(listarInformesEmitidosRecepcion('empresa-1', [])).resolves.toEqual({});
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
  });
});
