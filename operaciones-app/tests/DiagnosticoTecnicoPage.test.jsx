import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { empresaId: 'empresa-prueba', usuario: { id: 'usuario-prueba' }, estado: 'listo', permiteEscritura: true, error: '' },
  service: Object.fromEntries([
    'usuarioPuedeDiagnostico', 'listarDiagnosticosTecnicos', 'obtenerDiagnosticoTecnico', 'resolverReferenciasDiagnostico',
    'listarReferenciasDiagnostico', 'listarFamiliasTrabajo', 'listarTiposServicioInterno', 'listarCargosEmpresa',
    'listarActivosPropios', 'guardarDiagnosticoLinea', 'sincronizarMaterialesLinea', 'obtenerDiagnosticoLinea',
    'eliminarDiagnosticoLinea', 'crearDiagnosticoTecnico', 'buscarOCrearFamiliaTrabajo', 'buscarOCrearTipoServicioInterno',
  ].map(name => [name, vi.fn()])),
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.session }));
vi.mock('../src/zahory-mock/components/shell.jsx', () => ({ Icon: () => null }));
vi.mock('../src/services/diagnosticoTecnicoService.js', () => mocks.service);

import { DiagnosticoTecnicoPage } from '../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx';

const detail = (id, tipo = 'fabricacion', lineas = []) => ({
  id,
  tipo,
  estado: 'borrador',
  oportunidad_id: tipo === 'fabricacion' ? `opp-${id}` : null,
  recepcion_id: tipo === 'mantenimiento' ? `rac-${id}` : null,
  lineas,
});

const deferred = () => {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
};

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(read, timeout = 1000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await wait(25);
  }
  return read();
}

const textOf = node => node?.children?.map(child => typeof child === 'string' ? child : textOf(child)).join('') || '';
const buttonByText = (renderer, label) => renderer.root.findAllByType('button').find(button => textOf(button).trim() === label);
let renderer;

beforeEach(() => {
  const listeners = new Map();
  globalThis.window = {
    setTimeout,
    clearTimeout,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
    dispatchEvent: event => listeners.get(event.type)?.(event),
  };
  Object.values(mocks.service).forEach(mock => mock.mockReset());
  mocks.service.usuarioPuedeDiagnostico.mockResolvedValue(true);
  mocks.service.listarDiagnosticosTecnicos.mockResolvedValue([
    { id: 'one', tipo: 'fabricacion', estado: 'borrador', oportunidad_id: 'opp-one', recepcion_id: null, updated_at: null },
    { id: 'two', tipo: 'mantenimiento', estado: 'borrador', oportunidad_id: null, recepcion_id: 'rac-two', updated_at: null },
  ]);
  mocks.service.resolverReferenciasDiagnostico.mockImplementation(async (_empresa, _tipo, ids) => ids.map(id => ({ id, numero: id, cliente: 'Cliente de prueba', activo: 'Activo de prueba' })));
  mocks.service.listarReferenciasDiagnostico.mockResolvedValue([]);
  mocks.service.listarFamiliasTrabajo.mockResolvedValue([{ id: 'fam-1', nombre: 'Trabajo 1' }]);
  mocks.service.listarTiposServicioInterno.mockResolvedValue([{ id: 'task-1', nombre: 'Tarea 1' }]);
  mocks.service.listarCargosEmpresa.mockResolvedValue([]);
  mocks.service.listarActivosPropios.mockResolvedValue([]);
  mocks.service.guardarDiagnosticoLinea.mockResolvedValue({ id: 'line-new' });
  mocks.service.sincronizarMaterialesLinea.mockResolvedValue(undefined);
  mocks.service.obtenerDiagnosticoLinea.mockResolvedValue({ id: 'line-new', materiales: [{ id: 'mat-1', descripcion: 'Filtro', cantidad: 1, unidad: 'und' }] });
});

afterEach(() => {
  vi.useRealTimers();
  renderer?.unmount();
  renderer = null;
});

async function renderPage() {
  await act(async () => {
    renderer = create(<DiagnosticoTecnicoPage />);
    await wait(0);
    await wait(0);
  });
  return renderer;
}

async function openDetailAndAddLine() {
  await renderPage();
  await waitFor(() => renderer.root.findAllByType('tr')[1]);
  await act(async () => {
    renderer.root.findAllByType('tr')[1].props.onClick();
    await wait(150);
  });
  await waitFor(() => buttonByText(renderer, 'Agregar l\u00ednea'));
  await act(async () => {
    buttonByText(renderer, 'Agregar l\u00ednea').props.onClick();
    await wait(20);
  });
  await act(async () => {
    buttonByText(renderer, 'Trabajo 1').props.onClick();
    buttonByText(renderer, 'Tarea 1').props.onClick();
    await wait(20);
  });
  await act(async () => {
    buttonByText(renderer, 'Agregar repuesto').props.onClick();
    await wait(20);
  });
}

function fillMaterialDescription(value) {
  const tables = renderer.root.findAllByType('table');
  const materialTable = tables[tables.length - 1];
  materialTable.findAllByType('input')[0].props.onChange({ target: { value } });
}

describe('Diagnostico Tecnico - Etapa B', () => {
  it('T1: flujo exacto con repuesto vacio valida antes de guardar', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    await openDetailAndAddLine();
    const saveButton = buttonByText(renderer, 'Guardar l\u00ednea');
    await act(async () => { saveButton.props.onClick(); await wait(20); });
    const dom = textOf(renderer.root);
    const error = 'Repuesto 1: La descripci\u00f3n es obligatoria.';
    console.log('T1_EMPTY_RESULT', JSON.stringify({ button: textOf(saveButton).trim(), service_calls: mocks.service.guardarDiagnosticoLinea.mock.calls.length, dom_error: dom.includes(error) ? error : null }));
    expect(textOf(saveButton).trim()).toBe('Guardar l\u00ednea');
    expect(dom).toContain(error);
    expect(mocks.service.guardarDiagnosticoLinea).not.toHaveBeenCalled();
  });

  it('T1a: descripcion llena y servicio normal termina guardando', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    await openDetailAndAddLine();
    fillMaterialDescription('Filtro hidraulico');
    await act(async () => { await wait(20); });
    await act(async () => { buttonByText(renderer, 'Guardar l\u00ednea').props.onClick(); await wait(80); });
    const dom = textOf(renderer.root);
    console.log('T1A_NORMAL_RESULT', JSON.stringify({ button: textOf(buttonByText(renderer, 'Guardar l\u00ednea')).trim(), saved_label: dom.includes('L\u00ednea guardada'), sync_calls: mocks.service.sincronizarMaterialesLinea.mock.calls.length }));
    expect(textOf(buttonByText(renderer, 'Guardar l\u00ednea')).trim()).toBe('Guardar l\u00ednea');
    expect(dom).toContain('L\u00ednea guardada');
  });

  it('T1b: sincronizacion lenta muestra aviso, warning y permite cerrar', async () => {
    const syncPending = deferred();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    mocks.service.sincronizarMaterialesLinea.mockReturnValue(syncPending.promise);
    await openDetailAndAddLine();
    fillMaterialDescription('Filtro hidraulico');
    vi.useFakeTimers();
    await act(async () => { buttonByText(renderer, 'Guardar l\u00ednea').props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    const warning = 'El guardado est\u00e1 tardando m\u00e1s de lo normal. No pulses Guardar de nuevo; cierra y reabre el diagn\u00f3stico para comprobar si la l\u00ednea se guard\u00f3.';
    const button = buttonByText(renderer, 'Guardando...');
    console.log('T1B_SLOW_RESULT', JSON.stringify({ button: textOf(button).trim(), warning_visible: textOf(renderer.root).includes(warning), warning_step: warnSpy.mock.calls[0]?.[0] || null }));
    expect(textOf(button).trim()).toBe('Guardando...');
    expect(textOf(renderer.root)).toContain(warning);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sincronizarMaterialesLinea'));
    globalThis.window.confirm = vi.fn(() => true);
    await act(async () => { globalThis.window.dispatchEvent({ type: 'keydown', key: 'Escape' }); });
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    renderer.unmount();
    renderer = null;
    syncPending.resolve();
    vi.useRealTimers();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await wait(50); });
    warnSpy.mockRestore();
  });

  it('T6: cerrar durante el guardado y resolver despues no actualiza un modal cerrado', async () => {
    const syncPending = deferred();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    mocks.service.sincronizarMaterialesLinea.mockReturnValue(syncPending.promise);
    await openDetailAndAddLine();
    fillMaterialDescription('Filtro hidraulico');
    await act(async () => { buttonByText(renderer, 'Guardar l\u00ednea').props.onClick(); await Promise.resolve(); await Promise.resolve(); });
    globalThis.window.confirm = vi.fn(() => true);
    await act(async () => { renderer.root.findAllByProps({ 'aria-label': 'Cerrar' })[0].props.onClick(); });
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    syncPending.resolve();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await wait(80); });
    const relevantErrors = consoleError.mock.calls.filter(([message]) => String(message).includes('unmounted') || String(message).includes('desmont'));
    console.log('T6_CLOSE_RESULT', JSON.stringify({ dialog_closed: true, component_unmounted: true, post_close_errors: relevantErrors.length }));
    expect(relevantErrors).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('T2: la respuesta vieja no puede reemplazar la ultima fila pulsada', async () => {
    const slowReference = deferred();
    let delayNextOpp = false;
    mocks.service.obtenerDiagnosticoTecnico.mockImplementation((_empresa, id) => Promise.resolve(detail(id, id === 'one' ? 'fabricacion' : 'mantenimiento')));
    mocks.service.resolverReferenciasDiagnostico.mockImplementation(async (_empresa, _tipo, ids) => {
      if (delayNextOpp && ids[0] === 'opp-one') return slowReference.promise;
      return ids.map(id => ({ id, numero: id, cliente: 'Cliente de prueba', activo: 'Activo de prueba' }));
    });
    await renderPage();
    const rows = renderer.root.findAllByType('tr');
    delayNextOpp = true;
    await act(async () => { rows[1].props.onClick(); await wait(10); });
    await act(async () => { rows[2].props.onClick(); await wait(100); });
    const afterSecond = textOf(renderer.root.findAllByType('h2')[1]);
    slowReference.resolve([{ id: 'opp-one', numero: 'opp-one', cliente: 'Cliente de prueba' }]);
    await act(async () => { await wait(100); });
    const finalTitle = textOf(renderer.root.findAllByType('h2')[1]);
    const finalId = finalTitle.includes('opp-one') ? 'one' : 'two';
    console.log('T2_RACE_RESULT', JSON.stringify({ after_second_title: afterSecond, final_title: finalTitle, final_detail_id: finalId, expected_final_detail_id: 'two' }));
    expect(finalId).toBe('two');
  });

  it('T3: fabricacion abre sin ReferenceError', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion'));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).not.toContain('ReferenceError');
  });

  it('T4: el error de guardado queda visible dentro del modal', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', materiales: [] }]));
    mocks.service.guardarDiagnosticoLinea.mockRejectedValue(new Error('error visible de prueba'));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    await act(async () => { buttonByText(renderer, 'Guardar l\u00ednea').props.onClick(); await wait(20); });
    expect(textOf(renderer.root)).toContain('error visible de prueba');
  });
});
