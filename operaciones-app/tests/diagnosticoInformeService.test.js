import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../src/lib/supabaseClient.js', () => ({ getSupabaseClient: () => supabase }));
import { actualizarOpciones, generarConclusionIA, mensajeErrorDiagnosticoInforme, obtenerIdentidadEmpresa, obtenerInformeVigente, obtenerOCrearBorrador } from '../src/services/diagnosticoInformeService.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('diagnosticoInformeService', () => {
  it('crea el borrador mediante el RPC y traduce errores de permisos y diagnóstico', async () => {
    const row = { id: 'inf-1', estado: 'borrador' };
    supabase.rpc.mockResolvedValueOnce({ data: row, error: null });
    await expect(obtenerOCrearBorrador('rac-1')).resolves.toEqual(row);
    expect(supabase.rpc).toHaveBeenCalledWith('obtener_o_crear_borrador_informe', { p_recepcion_id: 'rac-1' });
    expect(mensajeErrorDiagnosticoInforme({ code: '42501' })).toMatch(/permiso/i);
    expect(mensajeErrorDiagnosticoInforme({ code: 'P0002' })).toMatch(/diagnóstico/i);
  });

  it('mapea inmutabilidad y conclusión sin confirmar', () => {
    expect(mensajeErrorDiagnosticoInforme({ message: 'Un informe emitido es inmutable.' })).toContain('inmutable');
    expect(mensajeErrorDiagnosticoInforme({ message: 'La conclusión debe confirmarse antes de emitir.' })).toContain('confirmarse');
  });

  it('lee borrador y emitidos, ordenando versiones descendentes', async () => {
    const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockResolvedValue({ data: [{ id: 'd', estado: 'borrador' }, { id: 'v2', estado: 'emitido', version: 2 }, { id: 'v1', estado: 'emitido', version: 1 }], error: null });
    supabase.from.mockReturnValue(chain);
    await expect(obtenerInformeVigente('rac-1')).resolves.toEqual({ borrador: { id: 'd', estado: 'borrador' }, emitidos: [{ id: 'v2', estado: 'emitido', version: 2 }, { id: 'v1', estado: 'emitido', version: 1 }] });
    expect(chain.order).toHaveBeenCalledWith('version', { ascending: false, nullsFirst: false });
  });

  it('actualiza únicamente la columna opciones', async () => {
    const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() };
    chain.update.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.select.mockReturnValue(chain); chain.single.mockResolvedValue({ data: { id: 'd', opciones: { mostrar_horas: true } }, error: null });
    supabase.from.mockReturnValue(chain);
    const opciones = { mostrar_horas: true };
    await actualizarOpciones('d', opciones);
    expect(supabase.from).toHaveBeenCalledWith('diagnostico_informes');
    expect(chain.update).toHaveBeenCalledOnce();
    expect(chain.update).toHaveBeenCalledWith({ opciones });
  });

  it('invoca la función con solo el id y traduce errores HTTP', async () => {
    supabase.functions = { invoke: vi.fn().mockResolvedValue({ data: { ok: true, conclusion: 'Revisar bomba', modelo: 'gpt-4o-mini' }, error: null }) };
    await expect(generarConclusionIA('diag-1')).resolves.toEqual({ ok: true, conclusion: 'Revisar bomba', modelo: 'gpt-4o-mini' });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('generar-conclusion-informe', { body: { diagnostico_id: 'diag-1' } });
    supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 429 } } });
    await expect(generarConclusionIA('diag-1')).rejects.toThrow(/cuota diaria/i);
    supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ ok: false, error: 'El identificador del diagn\u00f3stico no es v\u00e1lido.' }), { status: 400 }) } });
    await expect(generarConclusionIA('diag-1')).rejects.toThrow('El identificador del diagn\u00f3stico no es v\u00e1lido.');
  });

  it('lee identidad con columnas explícitas y devuelve null ante errores', async () => {
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.maybeSingle.mockResolvedValue({ data: { logo_url: '/logo.png', razon_social: 'Tideo', ruc: '201' }, error: null });
    supabase.from.mockReturnValue(chain);
    await expect(obtenerIdentidadEmpresa('e1')).resolves.toEqual({ logo_url: '/logo.png', razon_social: 'Tideo', ruc: '201' });
    expect(chain.select).toHaveBeenCalledWith('logo_url,razon_social,ruc');
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('RLS') });
    await expect(obtenerIdentidadEmpresa('e1')).resolves.toBeNull();
  });
});
