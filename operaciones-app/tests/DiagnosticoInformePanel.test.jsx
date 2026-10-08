import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ obtenerOCrearBorrador: vi.fn(), obtenerInformeVigente: vi.fn(), actualizarOpciones: vi.fn(), generarConclusionIA: vi.fn(), obtenerIdentidadEmpresa: vi.fn(), usuarioPuedeInforme: vi.fn(), emitirInformeDiagnostico: vi.fn(), generarPdfInforme: vi.fn(), firmarRutasFotosHallazgos: vi.fn(), listarFotosHallazgos: vi.fn() }));
vi.mock('../src/services/diagnosticoInformeService.js', () => ({ ...api, OPCIONES_INFORME_POR_DEFECTO: { conclusion: '', conclusion_origen: 'manual', conclusion_confirmada: false, incluir_mediciones: false, mostrar_horas: false, ocultar_conformes: false } }));
vi.mock('../src/services/diagnosticoHallazgoFotosService.js', () => ({ firmarRutasFotosHallazgos: (...args) => api.firmarRutasFotosHallazgos(...args), listarFotosHallazgos: (...args) => api.listarFotosHallazgos(...args) }));
vi.mock('../src/zahory-mock/pages/InformeHoja.jsx', () => ({ InformeHoja: ({ snapshot }) => <div data-testid="informe-hoja">{JSON.stringify(snapshot)}</div> }));
vi.mock('../src/zahory-mock/pages/InformePdf.jsx', () => ({ generarPdfInforme: (...args) => api.generarPdfInforme(...args) }));
import { DiagnosticoInformePanel } from '../src/zahory-mock/pages/DiagnosticoInformePanel.jsx';

const draft = options => ({ id: 'inf-1', empresa_id: 'e1', estado: 'borrador', opciones: { conclusion: '', conclusion_origen: 'manual', conclusion_confirmada: false, incluir_mediciones: false, mostrar_horas: false, ocultar_conformes: false, ...options } });
const diagnosis = { id: 'd1', recepcion_id: 'r1', tipo: 'mantenimiento', estado: 'emitido', hallazgos: [], lineas: [] };
let renderer;
const text = node => node?.children?.map(child => typeof child === 'string' ? child : text(child)).join('') || '';
const byLabel = label => renderer.root.findAll(node => node.type === 'label' && text(node).includes(label))[0];
const button = label => renderer.root.findAllByType('button').find(node => text(node).trim() === label);
async function render(overrides = {}) {
  await act(async () => { renderer = create(<DiagnosticoInformePanel diagnostico={diagnosis} catalogos={{}} cabecera={{}} puedeEditar onClose={vi.fn()} {...overrides} />); await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.obtenerOCrearBorrador.mockResolvedValue(draft());
  api.obtenerInformeVigente.mockResolvedValue({ borrador: draft(), emitidos: [] });
  api.actualizarOpciones.mockImplementation(async (_id, opciones) => ({ id: 'inf-1', estado: 'borrador', opciones: { ...opciones } }));
  api.generarConclusionIA.mockResolvedValue({ ok: true, conclusion: 'La bomba requiere revisión.', modelo: 'gpt-4o-mini' });
  api.obtenerIdentidadEmpresa.mockResolvedValue(null);
  api.usuarioPuedeInforme.mockResolvedValue(true);
  api.emitirInformeDiagnostico.mockResolvedValue({ id: 'v2', estado: 'emitido', version: 2, opciones: draft().opciones, snapshot: { version: 2, cabecera: {} } });
  api.generarPdfInforme.mockResolvedValue({ blob: new Blob(['pdf']), warnings: [] });
  api.firmarRutasFotosHallazgos.mockImplementation(async rutas => new Map(rutas.map(ruta => [ruta, `https://signed/${ruta}`])));
  api.listarFotosHallazgos.mockResolvedValue([]);
});

describe('DiagnosticoInformePanel', () => {
  it('solo crea borrador con edición, y usuario con ver consulta existente sin poder editar', async () => {
    await render();
    expect(api.obtenerOCrearBorrador).toHaveBeenCalledWith('r1');
    renderer.unmount(); renderer = null;
    await render({ puedeEditar: false });
    expect(api.obtenerInformeVigente).toHaveBeenCalledWith('r1');
    expect(api.obtenerOCrearBorrador).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ id: 'dx-inf-conclusion' }).props.disabled).toBe(true);
    expect(button('Guardar borrador')).toBeUndefined();
  });

  it('deshabilita confirmación con texto sin guardar y confirma con un UPDATE independiente', async () => {
    await render();
    const textarea = renderer.root.findByProps({ id: 'dx-inf-conclusion' });
    await act(async () => { textarea.props.onChange({ target: { value: 'Conclusión manual' } }); });
    const confirmation = byLabel('Revisé y confirmo la conclusión').findByType('input');
    expect(confirmation.props.disabled).toBe(true);
    await act(async () => { button('Guardar borrador').props.onClick(); await Promise.resolve(); });
    expect(api.actualizarOpciones).toHaveBeenCalledTimes(1);
    const confirmed = byLabel('Revisé y confirmo la conclusión').findByType('input');
    expect(confirmed.props.disabled).toBe(false);
    await act(async () => { confirmed.props.onChange({ target: { checked: true } }); await Promise.resolve(); });
    expect(api.actualizarOpciones).toHaveBeenCalledTimes(2);
    expect(api.actualizarOpciones.mock.calls[1][1]).toEqual(expect.objectContaining({ conclusion: 'Conclusión manual', conclusion_confirmada: true }));
  });

  it('persiste opciones al guardar y cambia origen IA a ia_editada al editar conclusión', async () => {
    api.obtenerOCrearBorrador.mockResolvedValue(draft({ conclusion: 'Texto inicial', conclusion_origen: 'ia' }));
    await render();
    const textarea = renderer.root.findByProps({ id: 'dx-inf-conclusion' });
    await act(async () => { textarea.props.onChange({ target: { value: 'Texto editado' } }); });
    const checks = renderer.root.findAllByType('input').filter(input => input.props.type === 'checkbox');
    await act(async () => { checks[0].props.onChange({ target: { checked: true } }); checks[2].props.onChange({ target: { checked: true } }); });
    await act(async () => { button('Guardar borrador').props.onClick(); await Promise.resolve(); });
    expect(api.actualizarOpciones.mock.calls[0][1]).toEqual(expect.objectContaining({ conclusion: 'Texto editado', conclusion_origen: 'ia_editada', incluir_mediciones: true, ocultar_conformes: true }));
  });

  it('genera en el textarea sin guardar y pide confirmación inline al reemplazar texto existente', async () => {
    await render();
    await act(async () => { button('Generar conclusión con IA').props.onClick(); await Promise.resolve(); });
    expect(api.generarConclusionIA).toHaveBeenCalledWith('d1');
    expect(renderer.root.findByProps({ id: 'dx-inf-conclusion' }).props.value).toBe('La bomba requiere revisión.');
    expect(renderer.root.findAllByType('small').some(node => text(node).includes('Generado por IA, requiere revisión'))).toBe(true);
    expect(api.actualizarOpciones).not.toHaveBeenCalled();
    await act(async () => { button('Generar conclusión con IA').props.onClick(); });
    expect(renderer.root.findAll(node => node.props?.['aria-label'] === 'Confirmar reemplazo de conclusión')).toHaveLength(1);
    expect(api.generarConclusionIA).toHaveBeenCalledTimes(1);
  });

  it('muestra emitir solo en borrador con permiso y bloquea conclusión sin confirmar', async () => {
    api.obtenerOCrearBorrador.mockResolvedValue(draft({ conclusion: 'Pendiente', conclusion_confirmada: false }));
    await render();
    expect(button('Emitir informe').props.disabled).toBe(true);
    renderer.unmount(); renderer = null;
    api.usuarioPuedeInforme.mockResolvedValue(false);
    await render();
    expect(button('Emitir informe')).toBeUndefined();
    renderer.unmount(); renderer = null;
    api.usuarioPuedeInforme.mockResolvedValue(true);
    const emitted = { id: 'v1', estado: 'emitido', version: 1, opciones: draft().opciones, snapshot: { version: 1, cabecera: {} } };
    api.obtenerOCrearBorrador.mockResolvedValue(draft());
    api.obtenerInformeVigente.mockResolvedValue({ borrador: null, emitidos: [emitted] });
    await render({ puedeEditar: false });
    expect(button('Emitir informe')).toBeUndefined();
    renderer.unmount(); renderer = null;
  });

  it('confirma inline precargada, guarda opciones pendientes y emite una vez antes de refrescar', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { confirm: vi.fn() };
    api.obtenerIdentidadEmpresa.mockResolvedValue({ firmante: 'Ana Pérez', cargo_firmante: 'Jefa técnica' });
    const emitted = { id: 'v2', estado: 'emitido', version: 2, opciones: { ...draft().opciones, mostrar_horas: true }, snapshot: { version: 2, cabecera: {} } };
    api.emitirInformeDiagnostico.mockResolvedValue(emitted);
    api.obtenerInformeVigente.mockResolvedValueOnce({ borrador: draft(), emitidos: [] }).mockResolvedValueOnce({ borrador: null, emitidos: [emitted] });
    await render();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { button('Emitir informe').props.onClick(); await Promise.resolve(); });
    expect(renderer.root.findAll(node => node.props?.['aria-label'] === 'Confirmar emisión')).toHaveLength(1);
    expect(renderer.root.findAllByType('input').map(node => node.props.value).filter(Boolean)).toEqual(['Ana Pérez', 'Jefa técnica']);
    const check = renderer.root.findAllByType('input').find(node => node.props.type === 'checkbox' && node.props.checked === false);
    await act(async () => { check.props.onChange({ target: { checked: true } }); });
    let release;
    api.emitirInformeDiagnostico.mockImplementation(() => new Promise(resolve => { release = () => resolve(emitted); }));
    await act(async () => { button('Confirmar emisión').props.onClick(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const pendingConfirm = button('Emitiendo…');
    expect(pendingConfirm.props.disabled).toBe(true);
    await act(async () => { pendingConfirm.props.onClick(); await Promise.resolve(); });
    expect(api.actualizarOpciones).toHaveBeenCalledTimes(1);
    expect(api.emitirInformeDiagnostico).toHaveBeenCalledTimes(1);
    expect(api.actualizarOpciones.mock.invocationCallOrder[0]).toBeLessThan(api.emitirInformeDiagnostico.mock.invocationCallOrder[0]);
    await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); });
    expect(api.emitirInformeDiagnostico).toHaveBeenCalledTimes(1);
    expect(api.obtenerInformeVigente).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAll(node => node.props?.role === 'status').map(text).join(' ')).toContain('Informe emitido (versión 2).');
    expect(window.confirm).not.toHaveBeenCalled();
    renderer.unmount(); renderer = null;
    globalThis.window = previousWindow;
  });

  it('muestra el error del servidor al emitir', async () => {
    api.obtenerIdentidadEmpresa.mockResolvedValue({ firmante: 'Ana Pérez', cargo_firmante: 'Jefa técnica' });
    api.emitirInformeDiagnostico.mockRejectedValue(new Error('Error del servidor al emitir.'));
    await render();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => { button('Emitir informe').props.onClick(); await Promise.resolve(); });
    await act(async () => { button('Confirmar emisión').props.onClick(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(renderer.root.findAll(node => node.props?.role === 'alert').map(text).join(' ')).toContain('Error del servidor al emitir.');
    renderer.unmount(); renderer = null;
  });

  it('muestra PDF solo para la versión emitida, progreso deshabilitado y aviso de fotos omitidas', async () => {
    const emitted = { id: 'v3', estado: 'emitido', version: 3, opciones: draft().opciones, snapshot: { version: 3, cabecera: {} } };
    api.obtenerOCrearBorrador.mockResolvedValue(draft());
    api.obtenerInformeVigente.mockResolvedValue({ borrador: draft(), emitidos: [emitted] });
    await render();
    expect(button('Descargar PDF')).toBeUndefined();
    const versionButton = renderer.root.findAllByType('button').find(node => text(node).includes('Versión 3'));
    await act(async () => { versionButton.props.onClick(); await Promise.resolve(); });
    expect(button('Emitir informe')).toBeUndefined();
    expect(button('Descargar PDF')).toBeDefined();
    const previousDocument = globalThis.document;
    const previousUrl = globalThis.URL;
    const previousWindow = globalThis.window;
    const clicked = vi.fn();
    const anchor = { click: clicked, remove: vi.fn(), href: '', download: '' };
    globalThis.document = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } };
    globalThis.URL = { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() };
    globalThis.window = { setTimeout: vi.fn(callback => callback()) };
    let release;
    api.generarPdfInforme.mockImplementation(() => new Promise(resolve => { release = () => resolve({ blob: {}, warnings: ['No se pudo cargar una foto.'] }); }));
    await act(async () => { button('Descargar PDF').props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    expect(button('Generando PDF…').props.disabled).toBe(true);
    await act(async () => { release(); await Promise.resolve(); await Promise.resolve(); });
    expect(clicked).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(renderer.root.findAll(node => node.props?.role === 'status').map(text).join(' ')).toContain('El PDF se generó sin algunas fotos');
    globalThis.document = previousDocument;
    globalThis.URL = previousUrl;
    globalThis.window = previousWindow;
    renderer.unmount(); renderer = null;
  });

  it('firma fotos emitidas solo para la vista y conserva intacto el snapshot original', async () => {
    const snapshot = { version: 4, cabecera: {}, hallazgos: [{ id: 'h1', fotos: [{ ruta_storage: 'e/d/h/a.jpg', leyenda: 'Foto', orden: 1, ancho: 100, alto: 80 }] }] };
    const emitted = { id: 'v4', estado: 'emitido', version: 4, opciones: draft().opciones, snapshot };
    api.obtenerInformeVigente.mockResolvedValue({ borrador: null, emitidos: [emitted] });
    await render({ puedeEditar: false });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const viewSnapshot = JSON.parse(text(renderer.root.findByProps({ 'data-testid': 'informe-hoja' })));
    expect(api.firmarRutasFotosHallazgos).toHaveBeenCalledWith(['e/d/h/a.jpg']);
    expect(viewSnapshot.hallazgos[0].fotos[0].url).toBe('https://signed/e/d/h/a.jpg');
    expect(snapshot.hallazgos[0].fotos[0]).not.toHaveProperty('url');
    expect(button('Descargar PDF')).toBeDefined();
    renderer.unmount(); renderer = null;
  });

  it('muestra el aviso y continúa sin imágenes si falla la firma de una versión emitida', async () => {
    const emitted = { id: 'v5', estado: 'emitido', version: 5, opciones: draft().opciones, snapshot: { version: 5, cabecera: {}, hallazgos: [{ id: 'h1', fotos: [{ ruta_storage: 'e/d/h/a.jpg' }] }] } };
    api.obtenerInformeVigente.mockResolvedValue({ borrador: null, emitidos: [emitted] });
    api.firmarRutasFotosHallazgos.mockRejectedValue(new Error('Storage unavailable'));
    await render({ puedeEditar: false });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(renderer.root.findAll(node => node.props?.role === 'status').map(text).join(' ')).toContain('No se pudieron cargar las fotos.');
    const failedSnapshot = JSON.parse(text(renderer.root.findByProps({ 'data-testid': 'informe-hoja' })));
    expect(failedSnapshot.hallazgos[0].fotos).toEqual([]);
    renderer.unmount(); renderer = null;
  });

  it('no solicita firmas para una versión emitida sin fotos', async () => {
    const emitted = { id: 'v6', estado: 'emitido', version: 6, opciones: draft().opciones, snapshot: { version: 6, cabecera: {}, hallazgos: [{ id: 'h1', fotos: [] }] } };
    api.obtenerInformeVigente.mockResolvedValue({ borrador: null, emitidos: [emitted] });
    await render({ puedeEditar: false });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(api.firmarRutasFotosHallazgos).not.toHaveBeenCalled();
    renderer.unmount(); renderer = null;
  });
});
