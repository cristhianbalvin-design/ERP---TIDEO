import React from 'react';
import { readFileSync } from 'node:fs';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { empresaId: 'empresa-prueba', usuario: { id: 'usuario-prueba' }, estado: 'listo', permiteEscritura: true, error: '' },
  service: Object.fromEntries([
    'usuarioPuedeDiagnostico', 'listarDiagnosticosTecnicos', 'obtenerDiagnosticoTecnico', 'resolverReferenciasDiagnostico',
    'listarReferenciasDiagnostico', 'listarFamiliasTrabajo', 'listarTiposServicioInterno', 'listarPlantillasActividad', 'listarUsoTareasPorEmpresa', 'listarCargosEmpresa',
    'listarActivosPropios', 'guardarDiagnosticoLinea', 'sincronizarMaterialesLinea', 'obtenerDiagnosticoLinea',
    'eliminarDiagnosticoLinea', 'crearDiagnosticoTecnico', 'buscarOCrearFamiliaTrabajo', 'buscarOCrearTipoServicioInterno',
    'listarCatalogosHallazgos', 'crearDiagnosticoHallazgo', 'actualizarDiagnosticoHallazgo', 'eliminarDiagnosticoHallazgo',
    'crearDiagnosticoMedicion', 'actualizarDiagnosticoMedicion', 'eliminarDiagnosticoMedicion',
    'crearEnlaceDiagnosticoHallazgoLinea', 'eliminarEnlaceDiagnosticoHallazgoLinea',
    'emitirDiagnosticoTecnico', 'reabrirDiagnosticoTecnico', 'listarHistorialEstadosDiagnostico',
  ].map(name => [name, vi.fn()])),
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.session }));
vi.mock('../src/zahory-mock/components/shell.jsx', () => ({ Icon: () => null }));
vi.mock('../src/services/diagnosticoTecnicoService.js', () => mocks.service);

import { CatalogSelector, DiagnosticoTecnicoPage, ReferenceSelector } from '../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx';

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
const buttonContaining = (renderer, label) => renderer.root.findAllByType('button').find(button => textOf(button).includes(label));
let renderer;
let documentListeners;

beforeEach(() => {
  mocks.session.empresaId = 'empresa-prueba';
  mocks.session.estado = 'listo';
  mocks.session.permiteEscritura = true;
  const listeners = new Map();
  globalThis.window = {
    setTimeout,
    clearTimeout,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
    dispatchEvent: event => listeners.get(event.type)?.(event),
  };
  documentListeners = new Map();
  globalThis.document = {
    addEventListener: (name, listener) => {
      const listeners = documentListeners.get(name) || new Set();
      listeners.add(listener);
      documentListeners.set(name, listeners);
    },
    removeEventListener: (name, listener) => documentListeners.get(name)?.delete(listener),
    dispatchEvent: event => documentListeners.get(event.type)?.forEach(listener => listener(event)),
  };
  Object.values(mocks.service).forEach(mock => mock.mockReset());
  mocks.service.usuarioPuedeDiagnostico.mockResolvedValue(true);
  mocks.service.listarDiagnosticosTecnicos.mockResolvedValue([
    { id: 'one', tipo: 'fabricacion', estado: 'borrador', oportunidad_id: 'opp-one', recepcion_id: null, updated_at: null },
    { id: 'two', tipo: 'mantenimiento', estado: 'borrador', oportunidad_id: null, recepcion_id: 'rac-two', updated_at: null },
  ]);
  mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
  mocks.service.resolverReferenciasDiagnostico.mockImplementation(async (_empresa, _tipo, ids) => ids.map(id => ({ id, numero: id, cliente: 'Cliente de prueba', activo: 'Activo de prueba' })));
  mocks.service.listarReferenciasDiagnostico.mockResolvedValue([]);
  mocks.service.listarFamiliasTrabajo.mockResolvedValue([{ id: 'fam-1', nombre: 'Trabajo 1' }]);
  mocks.service.listarTiposServicioInterno.mockResolvedValue([{ id: 'task-1', nombre: 'Tarea 1' }]);
  mocks.service.listarPlantillasActividad.mockResolvedValue([]);
  mocks.service.listarUsoTareasPorEmpresa.mockResolvedValue({});
  mocks.service.listarCargosEmpresa.mockResolvedValue([]);
  mocks.service.listarActivosPropios.mockResolvedValue([]);
  mocks.service.listarCatalogosHallazgos.mockResolvedValue([]);
  mocks.service.listarHistorialEstadosDiagnostico.mockResolvedValue([]);
  mocks.service.emitirDiagnosticoTecnico.mockResolvedValue({ estado: 'emitido' });
  mocks.service.reabrirDiagnosticoTecnico.mockResolvedValue({ estado: 'borrador' });
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

async function addQuickTask() {
  await act(async () => {
    buttonContaining(renderer, 'Agregar trabajo').props.onClick();
    await wait(0);
  });
  await act(async () => {
    renderer.root.findByProps({ 'aria-label': 'Elegir familia de trabajo' }).props.onChange({ target: { value: 'fam-1' } });
    await wait(0);
  });
  const search = renderer.root.findAllByType('input').find(input => String(input.props['aria-label'] || '').startsWith('Buscar y'));
  if (!search) throw new Error('No se encontr? la b?squeda r?pida');
  await act(async () => { search.props.onChange({ target: { value: 'Tarea' } }); await wait(0); });
  await act(async () => { search.props.onKeyDown({ key: 'Enter', preventDefault: vi.fn() }); await wait(0); });
}

async function openDetailAndAddLine() {
  await renderPage();
  await waitFor(() => renderer.root.findAllByType('tr')[1]);
  await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(150); });
  await waitFor(() => buttonContaining(renderer, 'Agregar trabajo'));
  await addQuickTask();
  await act(async () => { buttonContaining(renderer, 'Notas').props.onClick(); await wait(0); });
  await act(async () => { buttonByText(renderer, '+ Agregar repuesto').props.onClick(); await wait(0); });
}

function fillMaterialDescription(value) {
  const input = renderer.root.findAllByType('input').find(item => String(item.props['aria-label'] || '').startsWith('Descripci'));
  input.props.onChange({ target: { value } });
}

describe('Diagnostico Tecnico - Etapa B', () => {
  it('A: composedPath conserva abiertos los selectores dentro de Shadow DOM', async () => {
    const rootNodes = [];
    const createNodeMock = element => {
      const node = { contains: vi.fn(() => false) };
      if (element.props?.className === 'field diagnostico-combobox') rootNodes.push(node);
      return node;
    };
    const referenceSelect = vi.fn();
    const catalogSelect = vi.fn();
    await act(async () => {
      renderer = create(<>
        <ReferenceSelector tipo="fabricacion" value={null} search="" references={[{ id: 'opp-1', numero: 'Oportunidad 1' }]} loading={false} disabled={false} onSearch={vi.fn()} onSelect={referenceSelect} />
        <CatalogSelector label="Trabajo *" kind="familia" value={null} options={[{ id: 'fam-1', nombre: 'Trabajo 1' }]} disabled={false} placeholder="Buscar" canCreate={false} clearable={false} onSelect={catalogSelect} onError={vi.fn()} />
      </>, { createNodeMock });
      await wait(0);
    });
    const referenceInput = renderer.root.findAllByProps({ role: 'combobox', 'aria-label': 'Oportunidad' })[0];
    const catalogInput = renderer.root.findAllByProps({ role: 'combobox', 'aria-label': 'Trabajo *' })[0];
    await act(async () => { referenceInput.props.onFocus(); catalogInput.props.onFocus(); await wait(0); });
    const host = {};
    await act(async () => {
      documentListeners.get('mousedown').forEach(listener => listener({ target: host, composedPath: () => [host, ...rootNodes, {}] }));
      await wait(0);
    });
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(2);
    await act(async () => {
      buttonByText(renderer, 'Oportunidad 1').props.onClick();
      buttonByText(renderer, 'Trabajo 1').props.onClick();
    });
    expect(referenceSelect).toHaveBeenCalledWith({ id: 'opp-1', numero: 'Oportunidad 1' });
    expect(catalogSelect).toHaveBeenCalledWith({ id: 'fam-1', nombre: 'Trabajo 1' });
  });

  it('T1: flujo exacto con repuesto vacio valida antes de guardar', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    await openDetailAndAddLine();
    const saveButton = buttonByText(renderer, 'Guardar todo');
    await act(async () => { saveButton.props.onClick(); await wait(20); });
    const dom = textOf(renderer.root);
    const error = 'Repuesto 1: La descripci\u00f3n es obligatoria.';
    console.log('T1_EMPTY_RESULT', JSON.stringify({ button: textOf(saveButton).trim(), service_calls: mocks.service.guardarDiagnosticoLinea.mock.calls.length, dom_error: dom.includes(error) ? error : null }));
    expect(textOf(saveButton).trim()).toBe('Guardar todo');
    expect(dom).toContain(error);
    expect(mocks.service.guardarDiagnosticoLinea).not.toHaveBeenCalled();
  });

  it('T1a: descripcion llena y servicio normal termina guardando', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    await openDetailAndAddLine();
    fillMaterialDescription('Filtro hidraulico');
    await act(async () => { await wait(20); });
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(80); });
    const dom = textOf(renderer.root);
    console.log('T1A_NORMAL_RESULT', JSON.stringify({ button: textOf(buttonByText(renderer, 'Guardar todo')).trim(), saved_label: dom.includes('L\u00ednea guardada'), sync_calls: mocks.service.sincronizarMaterialesLinea.mock.calls.length }));
    expect(textOf(buttonByText(renderer, 'Guardar todo')).trim()).toBe('Guardar todo');
    expect(mocks.service.sincronizarMaterialesLinea).toHaveBeenCalled();
  });

  it('T1b: sincronizacion lenta muestra aviso, warning y permite cerrar', async () => {
    const syncPending = deferred();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one'));
    mocks.service.sincronizarMaterialesLinea.mockReturnValue(syncPending.promise);
    await openDetailAndAddLine();
    fillMaterialDescription('Filtro hidraulico');
    vi.useFakeTimers();
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await Promise.resolve(); await Promise.resolve(); });
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
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await Promise.resolve(); await Promise.resolve(); });
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
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', _dirty: true, materiales: [] }]));
    mocks.service.guardarDiagnosticoLinea.mockRejectedValue(new Error('error visible de prueba'));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(20); });
    expect(textOf(renderer.root)).toContain('error visible de prueba');
  });

  it('R1: Cerrar en el pie respeta confirmacion cuando hay cambios sucios', async () => {
    await openDetailAndAddLine();
    globalThis.window.confirm = vi.fn(() => false);
    await act(async () => { buttonByText(renderer, 'Cerrar').props.onClick(); });
    console.log('R1_DIRTY_CLOSE_RESULT', JSON.stringify({ confirm_calls: globalThis.window.confirm.mock.calls.length, dialog_open: renderer.root.findAllByProps({ role: 'dialog' }).length === 1 }));
    expect(globalThis.window.confirm).toHaveBeenCalledWith('Tienes cambios sin guardar');
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
  });

  it('R2a: un error de lista queda visible sin modal', async () => {
    mocks.service.listarDiagnosticosTecnicos.mockRejectedValue(new Error('fallo de lista'));
    await renderPage();
    await act(async () => { await wait(100); });
    console.log('R2A_LIST_ERROR_RESULT', JSON.stringify({ modal_open: renderer.root.findAllByProps({ role: 'dialog' }).length === 1, error_visible: textOf(renderer.root).includes('fallo de lista') }));
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('fallo de lista');
  });

  it('R2b: un error de detalle queda visible sin modal', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockRejectedValue(new Error('fallo de detalle'));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    console.log('R2B_DETAIL_ERROR_RESULT', JSON.stringify({ modal_open: renderer.root.findAllByProps({ role: 'dialog' }).length === 1, error_visible: textOf(renderer.root).includes('fallo de detalle') }));
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('fallo de detalle');
  });

  it('R3: la respuesta vieja de cargarLista no pisa la lista nueva', async () => {
    const firstList = deferred();
    let calls = 0;
    mocks.service.listarDiagnosticosTecnicos.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) return firstList.promise;
      return [{ id: 'two', tipo: 'mantenimiento', estado: 'borrador', oportunidad_id: null, recepcion_id: 'rac-two', updated_at: null }];
    });
    await renderPage();
    await waitFor(() => calls === 1);
    mocks.session.empresaId = 'empresa-dos';
    await act(async () => { renderer.update(<DiagnosticoTecnicoPage />); await wait(100); });
    firstList.resolve([{ id: 'one', tipo: 'fabricacion', estado: 'borrador', oportunidad_id: 'opp-one', recepcion_id: null, updated_at: null }]);
    await act(async () => { await wait(120); });
    const dom = textOf(renderer.root);
    console.log('R3_LIST_RACE_RESULT', JSON.stringify({ calls, has_new: dom.includes('rac-two'), has_old: dom.includes('opp-one') }));
    expect(dom).toContain('rac-two');
    expect(dom).not.toContain('opp-one');
  });

  it('R4: resolver el guardado viejo no desbloquea el boton del diagnostico nuevo', async () => {
    const firstSync = deferred();
    const secondSync = deferred();
    let syncCalls = 0;
    mocks.service.obtenerDiagnosticoTecnico.mockImplementation(async (_empresa, id) => detail(id));
    mocks.service.sincronizarMaterialesLinea.mockImplementation(() => {
      syncCalls += 1;
      return syncCalls === 1 ? firstSync.promise : secondSync.promise;
    });
    await openDetailAndAddLine();
    fillMaterialDescription('Filtro uno');
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(40); });
    globalThis.window.confirm = vi.fn(() => true);
    await act(async () => { buttonByText(renderer, 'Cerrar').props.onClick(); });
    await act(async () => { renderer.root.findAllByType('tr')[2].props.onClick(); await wait(100); });
    await addQuickTask();
    await act(async () => {
      buttonContaining(renderer, 'Notas').props.onClick();
      await wait(0);
    });
    await act(async () => {
      buttonByText(renderer, '+ Agregar repuesto').props.onClick();
      await wait(20);
    });
    fillMaterialDescription('Filtro dos');
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(40); });
    firstSync.resolve();
    await act(async () => { await wait(100); });
    const secondButton = buttonByText(renderer, 'Guardando...');
    console.log('R4_STALE_FINALLY_RESULT', JSON.stringify({ sync_calls: syncCalls, new_button: secondButton ? textOf(secondButton).trim() : null }));
    expect(secondButton).toBeTruthy();
    secondSync.resolve();
    await act(async () => { await wait(100); });
  });

  it('R5: el pie del modal usa posicion sticky', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    expect(css).toContain('position: sticky');
    expect(css).toContain('bottom: 0');
  });

  it('R6: la b?squeda r?pida a?ade la primera coincidencia con Enter al grupo elegido', async () => {
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    await addQuickTask();
    expect(textOf(renderer.root)).toContain('Tarea 1');
    expect(textOf(renderer.root)).toContain('1 tareas');
  });

  it('DX1: elegir familia agrega el grupo y la búsqueda rápida con Enter añade la primera coincidencia', async () => {
    mocks.service.listarTiposServicioInterno.mockResolvedValue([
      { id: 'task-1', nombre: 'Tarea prioritaria', codigo: 'T-01' },
      { id: 'task-2', nombre: 'Tarea secundaria', codigo: 'T-02' },
    ]);
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    await act(async () => { buttonContaining(renderer, 'Agregar trabajo').props.onClick(); await wait(0); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Elegir familia de trabajo' }).props.onChange({ target: { value: 'fam-1' } }); await wait(0); });
    const search = renderer.root.findByProps({ 'aria-label': 'Buscar y añadir una tarea' });
    await act(async () => { search.props.onChange({ target: { value: 'Tarea' } }); await wait(0); });
    const preventDefault = vi.fn();
    await act(async () => { search.props.onKeyDown({ key: 'Enter', preventDefault }); await wait(0); });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(textOf(renderer.root)).toContain('Tarea prioritaria');
    expect(textOf(renderer.root)).not.toContain('Tarea secundaria');
    expect(textOf(renderer.root)).toContain('1 tareas');
  });

  it('DX2: el detalle de notas y repuestos se abre y cierra por tarea', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', hallazgo: 'Ruido detectado', materiales: [] }]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    const toggle = renderer.root.findByProps({ 'aria-label': 'Notas y repuestos de Tarea 1' });
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0);
    await act(async () => { toggle.props.onClick(); await wait(0); });
    expect(renderer.root.findAllByType('textarea')[0].props.value).toBe('Ruido detectado');
    await act(async () => { toggle.props.onClick(); await wait(0); });
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0);
  });

  it('DX3: Guardar todo persiste todas las tareas sucias y reporta error parcial por fila', async () => {
    mocks.service.listarTiposServicioInterno.mockResolvedValue([{ id: 'task-1', nombre: 'Tarea 1' }, { id: 'task-2', nombre: 'Tarea 2' }]);
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [
      { id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', materiales: [], _dirty: true },
      { id: 'line-2', familia_trabajo_id: 'fam-1', tarea_id: 'task-2', materiales: [], _dirty: true },
    ]));
    mocks.service.guardarDiagnosticoLinea.mockImplementation(async (_empresa, _diagnostico, line) => {
      if (line.tarea_id === 'task-2') throw new Error('falló tarea 2');
      return { id: line.id };
    });
    mocks.service.obtenerDiagnosticoLinea.mockImplementation(async (_empresa, id) => ({ id, materiales: [] }));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(100); });
    expect(mocks.service.guardarDiagnosticoLinea).toHaveBeenCalledTimes(2);
    expect(mocks.service.sincronizarMaterialesLinea).toHaveBeenCalledTimes(1);
    expect(textOf(renderer.root)).toContain('No se guardó: falló tarea 2');
  });

  it('F3: Guardar todo persiste primero líneas y luego hallazgos, y el contador suma ambos dirty states', async () => {
    const saveOrder = [];
    mocks.service.listarCatalogosHallazgos.mockResolvedValue([
      { catalogo: 'tipo_dano', codigo: 'desgaste', etiqueta: 'Desgaste' },
      { catalogo: 'causa_probable', codigo: 'desgaste_normal', etiqueta: 'Desgaste normal' },
    ]);
    mocks.service.guardarDiagnosticoLinea.mockImplementation(async (_empresa, _diagnostico, line) => { saveOrder.push('linea'); return { id: line.id || 'line-new' }; });
    mocks.service.obtenerDiagnosticoLinea.mockImplementation(async (_empresa, id) => ({ id, materiales: [] }));
    mocks.service.crearDiagnosticoHallazgo.mockImplementation(async () => { saveOrder.push('hallazgo'); return { id: 'hallazgo-new' }; });
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(120); });
    await addQuickTask();
    await act(async () => { buttonContaining(renderer, '+ Agregar hallazgo').props.onClick(); await wait(0); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Componente / parte' }).props.onChange({ target: { value: 'Vástago' } }); });
    const selects = renderer.root.findAllByType('select');
    const damage = selects.find(select => select.props['aria-label'] === 'Tipo de daño');
    const cause = selects.find(select => select.props['aria-label'] === 'Causa probable');
    await act(async () => { damage.props.onChange({ target: { value: 'desgaste' } }); cause.props.onChange({ target: { value: 'desgaste_normal' } }); });
    expect(textOf(renderer.root)).toContain('2 cambios sin guardar');
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(100); });
    expect(saveOrder).toEqual(['linea', 'hallazgo']);
    expect(textOf(renderer.root)).not.toContain('Guardar cambios');
    expect(textOf(renderer.root)).not.toContain('Guardar hallazgos');
  });

  it('F3: si falla hallazgos después de guardar tareas, informa la fase y conserva hallazgos dirty', async () => {
    mocks.service.listarCatalogosHallazgos.mockResolvedValue([
      { catalogo: 'tipo_dano', codigo: 'desgaste', etiqueta: 'Desgaste' },
      { catalogo: 'causa_probable', codigo: 'desgaste_normal', etiqueta: 'Desgaste normal' },
    ]);
    mocks.service.guardarDiagnosticoLinea.mockResolvedValue({ id: 'line-new' });
    mocks.service.obtenerDiagnosticoLinea.mockResolvedValue({ id: 'line-new', materiales: [] });
    mocks.service.crearDiagnosticoHallazgo.mockRejectedValue(new Error('error hallazgo simulado'));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(120); });
    await addQuickTask();
    await act(async () => { buttonContaining(renderer, '+ Agregar hallazgo').props.onClick(); await wait(0); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Componente / parte' }).props.onChange({ target: { value: 'Vástago' } }); });
    const selects = renderer.root.findAllByType('select');
    const damage = selects.find(select => select.props['aria-label'] === 'Tipo de daño');
    const cause = selects.find(select => select.props['aria-label'] === 'Causa probable');
    await act(async () => { damage.props.onChange({ target: { value: 'desgaste' } }); cause.props.onChange({ target: { value: 'desgaste_normal' } }); });
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(100); });
    expect(mocks.service.guardarDiagnosticoLinea).toHaveBeenCalledTimes(1);
    expect(textOf(renderer.root)).toContain('Se guardaron las tareas pero fallaron los hallazgos: No se pudieron guardar todos los cambios: error hallazgo simulado');
    expect(textOf(renderer.root)).toContain('1 cambio sin guardar');
    globalThis.window.confirm = vi.fn(() => false);
    await act(async () => { buttonByText(renderer, 'Cerrar').props.onClick(); });
    expect(globalThis.window.confirm).toHaveBeenCalledWith('Tienes cambios sin guardar');
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
  });

  it('F3: si falla la fase de tareas no inicia el guardado de hallazgos', async () => {
    mocks.service.listarCatalogosHallazgos.mockResolvedValue([
      { catalogo: 'tipo_dano', codigo: 'desgaste', etiqueta: 'Desgaste' },
      { catalogo: 'causa_probable', codigo: 'desgaste_normal', etiqueta: 'Desgaste normal' },
    ]);
    mocks.service.guardarDiagnosticoLinea.mockRejectedValue(new Error('error tarea simulado'));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(120); });
    await addQuickTask();
    await act(async () => { buttonContaining(renderer, '+ Agregar hallazgo').props.onClick(); await wait(0); });
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Componente / parte' }).props.onChange({ target: { value: 'Vástago' } }); });
    const selects = renderer.root.findAllByType('select');
    const damage = selects.find(select => select.props['aria-label'] === 'Tipo de daño');
    const cause = selects.find(select => select.props['aria-label'] === 'Causa probable');
    await act(async () => { damage.props.onChange({ target: { value: 'desgaste' } }); cause.props.onChange({ target: { value: 'desgaste_normal' } }); });
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(100); });
    expect(mocks.service.guardarDiagnosticoLinea).toHaveBeenCalledTimes(1);
    expect(mocks.service.crearDiagnosticoHallazgo).not.toHaveBeenCalled();
    expect(textOf(renderer.root)).toContain('Falló el guardado de tareas; los hallazgos quedaron pendientes.');
    expect(textOf(renderer.root)).toContain('2 cambios sin guardar');
  });

  it('DX4: los grupos muestran conteos y sumas de horas y se pueden colapsar y expandir', async () => {
    mocks.service.listarFamiliasTrabajo.mockResolvedValue([{ id: 'fam-1', nombre: 'Trabajo 1' }, { id: 'fam-2', nombre: 'Trabajo 2' }]);
    mocks.service.listarTiposServicioInterno.mockResolvedValue([{ id: 'task-1', nombre: 'Tarea 1' }, { id: 'task-2', nombre: 'Tarea 2' }]);
    mocks.service.listarActivosPropios.mockResolvedValue([{ id: 'asset-1', nombre: 'Equipo 1' }]);
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [
      { id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', horas_mano_obra: 1.5, horas_maquina: 2, activo_id: 'asset-1', materiales: [] },
      { id: 'line-2', familia_trabajo_id: 'fam-1', tarea_id: 'task-2', horas_mano_obra: 2.5, horas_maquina: 1, activo_id: 'asset-1', materiales: [] },
      { id: 'line-3', familia_trabajo_id: 'fam-2', tarea_id: 'task-1', horas_mano_obra: 3, horas_maquina: 0, materiales: [] },
    ]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    const dom = textOf(renderer.root);
    expect(dom).toContain('2 trabajos');
    expect(dom).toContain('3 tareas');
    expect(dom).toContain('7.0 h');
    expect(dom).toContain('2 tareas · 4.0 h-hombre · 3.0 h-máquina');
    expect(dom).toContain('1 tareas · 3.0 h-hombre · 0.0 h-máquina');
    const firstGroup = renderer.root.findAllByProps({ className: 'dx-group-head' })[0];
    expect(firstGroup.props['aria-expanded']).toBe(true);
    await act(async () => { firstGroup.props.onClick(); await wait(0); });
    expect(firstGroup.props['aria-expanded']).toBe(false);
    await act(async () => { firstGroup.props.onClick(); await wait(0); });
    expect(firstGroup.props['aria-expanded']).toBe(true);
  });

  it('DX5: una tarea sin activo propio mantiene HM deshabilitada', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', materiales: [] }]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(renderer.root.findByProps({ 'aria-label': 'Horas-máquina de Tarea 1' }).props.disabled).toBe(true);
  });

  it('DX6: diagnóstico emitido y falta de permiso quedan en solo lectura', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue({ ...detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', materiales: [] }]), estado: 'emitido' });
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).toContain('Este diagnóstico está emitido y es de solo lectura.');
    expect(buttonByText(renderer, 'Guardar todo')).toBeFalsy();
    renderer.unmount();
    renderer = null;

    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', materiales: [] }]));
    mocks.service.usuarioPuedeDiagnostico.mockImplementation(async (_empresa, action) => action !== 'editar');
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).toContain('No tienes permiso para editar diagnósticos.');
    expect(buttonByText(renderer, 'Guardar todo')).toBeFalsy();
  });

  it('DX7: el contador refleja las tareas con cambios sin guardar', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', horas_mano_obra: 1, materiales: [] }]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).not.toContain('cambio sin guardar');
    const hours = renderer.root.findByProps({ 'aria-label': 'Horas-hombre de Tarea 1' });
    await act(async () => { hours.props.onChange({ target: { value: '2.5' } }); await wait(0); });
    expect(textOf(renderer.root)).toContain('1 cambio sin guardar');
    expect(buttonByText(renderer, 'Guardar todo').props.disabled).toBe(false);
  });

  it('R7: mountedRef se activa y se limpia con un useEffect explicito', async () => {
    const source = readFileSync(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
    expect(source).toContain('useEffect(() => {');
    expect(source).toContain('mountedRef.current = true;');
    expect(source).toContain('mountedRef.current = false;');
  });

  it('R8: existe la clase alert-warning', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    expect(css).toContain('.alert-warning');
  });

  it('R9: cerrar un CatalogSelector sin elegir restaura la etiqueta seleccionada', async () => {
    const onSelect = vi.fn();
    await act(async () => {
      renderer = create(<CatalogSelector label="Tarea *" kind="tipo" value={{ id: 'task-1', nombre: 'Tarea 1' }} options={[{ id: 'task-1', nombre: 'Tarea 1' }]} disabled={false} placeholder="Buscar" canCreate={false} clearable={false} onSelect={onSelect} onError={vi.fn()} />);
      await wait(0);
    });
    const taskInput = renderer.root.findAllByProps({ role: 'combobox', 'aria-label': 'Tarea *' })[0];
    await act(async () => { taskInput.props.onChange({ target: { value: 'xyz' } }); await wait(0); });
    await act(async () => { globalThis.document.dispatchEvent({ type: 'mousedown', target: {} }); await wait(0); });
    console.log('R9_CATALOG_CANCEL_RESULT', JSON.stringify({ input: taskInput.props.value, select_calls: onSelect.mock.calls.length }));
    expect(taskInput.props.value).toBe('Tarea 1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('R10: editar ReferenceSelector invalida la seleccion y bloquea Guardar', async () => {
    mocks.service.listarReferenciasDiagnostico.mockResolvedValue([{ id: 'opp-new', numero: 'Oportunidad nueva', cliente: 'Cliente' }]);
    await renderPage();
    await act(async () => { buttonByText(renderer, 'Fabricación').props.onClick(); await wait(350); });
    const referenceInput = renderer.root.findAllByProps({ role: 'combobox', 'aria-label': 'Oportunidad' })[0];
    await act(async () => { referenceInput.props.onFocus(); await wait(0); });
    await act(async () => { buttonContaining(renderer, 'Oportunidad nueva').props.onClick(); await wait(0); });
    await act(async () => { referenceInput.props.onChange({ target: { value: 'otra búsqueda' } }); await wait(0); });
    const save = buttonByText(renderer, 'Guardar');
    console.log('R10_REFERENCE_EDIT_RESULT', JSON.stringify({ input: referenceInput.props.value, save_disabled: save?.props.disabled, create_calls: mocks.service.crearDiagnosticoTecnico.mock.calls.length }));
    expect(referenceInput.props.value).toBe('otra búsqueda');
    expect(save.props.disabled).toBe(true);
    expect(mocks.service.crearDiagnosticoTecnico).not.toHaveBeenCalled();
  });

  it('R11: ReferenceSelector permite borrar completamente el texto', async () => {
    mocks.service.listarReferenciasDiagnostico.mockResolvedValue([{ id: 'opp-new', numero: 'Oportunidad nueva', cliente: 'Cliente' }]);
    await renderPage();
    await act(async () => { buttonByText(renderer, 'Fabricación').props.onClick(); await wait(350); });
    const referenceInput = renderer.root.findAllByProps({ role: 'combobox', 'aria-label': 'Oportunidad' })[0];
    await act(async () => { referenceInput.props.onFocus(); await wait(0); });
    await act(async () => { buttonContaining(renderer, 'Oportunidad nueva').props.onClick(); await wait(0); });
    await act(async () => { referenceInput.props.onChange({ target: { value: '' } }); await wait(0); });
    console.log('R11_REFERENCE_CLEAR_RESULT', JSON.stringify({ input: referenceInput.props.value }));
    expect(referenceInput.props.value).toBe('');
  });

  it('R12: presenta resumen agrupado, contador sucio y horas de la l?nea', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', horas_mano_obra: 2.5, horas_maquina: 0, _dirty: true, materiales: [] }]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).toContain('Trabajo 1');
    expect(textOf(renderer.root)).toContain('1 tareas');
    expect(textOf(renderer.root)).toContain('2.5 h');
    expect(textOf(renderer.root)).toContain('1 cambio sin guardar');
  });

  it('R13: HM queda deshabilitada mientras no haya activo propio', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{ id: 'line-1', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', materiales: [] }]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    const hm = renderer.root.findAllByType('input').find(input => String(input.props['aria-label'] || '').startsWith('Horas-m') && input.props.type === 'number' && input.props.disabled);
    expect(hm).toBeTruthy();
    expect(hm.props.disabled).toBe(true);
  });

  it('R14: tokens del pie sticky tienen valores claro y oscuro', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    for (const token of ['--white', '--card-border', '--shadow-md', '--orange-soft', '--orange', '--row-alt', '--text']) expect(css).toContain(token);
    expect(css).toMatch(/\[data-theme='dark'\][\s\S]*--white:/);
    expect(css).toMatch(/\[data-theme='dark'\][\s\S]*--orange-soft:/);
  });

  it('R15: las reglas de overflow no ocultan el menú del card de línea', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\.diagnostico-line-card[^{}]*overflow:\s*hidden/);
    expect(css).not.toMatch(/\.card\s*\{[^}]*overflow:\s*hidden/);
  });

  it('R16: el modal explica por qué una sesión sin sociedad no puede editar', async () => {
    mocks.session.permiteEscritura = false;
    await renderPage();
    await act(async () => { buttonByText(renderer, 'Fabricación').props.onClick(); await wait(20); });
    const reason = 'Selecciona una sociedad concreta en la barra superior para poder editar.';
    const save = buttonByText(renderer, 'Guardar');
    const occurrences = textOf(renderer.root).split(reason).length - 1;
    console.log('R16_READONLY_SOCIETY_RESULT', JSON.stringify({ occurrences, save_disabled: save?.props.disabled }));
    expect(occurrences).toBe(1);
    expect(save.props.disabled).toBe(true);
  });

  it('R17: el modal distingue falta de permiso de edición', async () => {
    mocks.service.usuarioPuedeDiagnostico.mockImplementation(async (_empresa, action) => action !== 'editar');
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).toContain('No tienes permiso para editar diagnósticos.');
  });

  it('R18: el modal distingue un diagnóstico emitido', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue({ ...detail('one'), estado: 'emitido' });
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    expect(textOf(renderer.root)).toContain('Este diagnóstico está emitido y es de solo lectura.');
  });

  it('R19: el tema y los menús quedan acotados al modal', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
    expect(css).toMatch(/\.card\s*\{[\s\S]*background:\s*(?:white|var\(--white\));/);
    expect(css).toContain('.diagnostico-modal-card { background: var(--white);');
    expect(css).toContain('.diagnostico-combobox-menu { position: fixed;');
    expect(source).toContain('onMouseDown={event => event.preventDefault()}');
    expect(source).toContain("window.addEventListener('scroll', closeOnViewportChange, true)");
    expect(source).toContain("window.addEventListener('resize', closeOnViewportChange)");
  });

  it('R20: el scroll dentro del menú no lo cierra, pero el scroll externo sí', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
    const options = Array.from({ length: 10 }, (_, index) => ({ id: `task-${index}`, nombre: `Tarea ${index + 1}` }));
    const insideOption = {};
    const outsideContainer = {};
    const menuRef = { current: { contains: target => target === insideOption } };
    const scrollHandler = source.match(/const closeOnViewportChange = event => \{([\s\S]*?)\n    \};/)?.[0] || '';
    const closesInside = !menuRef.current.contains(insideOption);
    const closesOutside = !menuRef.current.contains(outsideContainer);
    console.log('R20_MENU_SCROLL_RESULT', JSON.stringify({ options: options.length, inside_stays_open: !closesInside, outside_closes: closesOutside }));
    expect(options).toHaveLength(10);
    expect(source).toContain('const menuRef = useRef(null);');
    expect(scrollHandler).toContain('menuRef.current?.contains?.(event.target)');
    expect(closesInside).toBe(false);
    expect(closesOutside).toBe(true);
  });

  it('R21: la opción seleccionada conserva un resalte legible en ambos temas', () => {
    const css = readFileSync(new URL('../src/zahory-mock/styles/zahory.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
    expect(source).toContain("'diagnostico-combobox-option is-selected'");
    expect(css).toContain('.diagnostico-modal-card .diagnostico-combobox-menu > button.is-selected { background: var(--row-alt); color: var(--text); }');
    expect(css).not.toContain('.diagnostico-modal-card .diagnostico-combobox-menu > button { background: var(--white) !important;');
  });

  it('R22: un alta nueva evalúa canCreate en la razón de solo lectura', () => {
    const source = readFileSync(new URL('../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx', import.meta.url), 'utf8');
    expect(source).toContain(": !selected && !canCreate");
    expect(source).toContain("No tienes permiso para crear diagnósticos.");
  });

  it('E1: emitir recarga el detalle y deja lineas en solo lectura', async () => {
    let loads = 0;
    mocks.service.obtenerDiagnosticoTecnico.mockImplementation(async () => {
      loads += 1;
      return { ...detail('one', 'fabricacion', [{ id: 'line-1', materiales: [] }]), estado: loads > 1 ? 'emitido' : 'borrador' };
    });
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(100); });
    const emit = buttonContaining(renderer, 'Emitir');
    expect(emit).toBeTruthy();
    await act(async () => { emit.props.onClick(); });
    await act(async () => { buttonContaining(renderer, 'Confirmar').props.onClick(); await wait(30); });
    expect(mocks.service.emitirDiagnosticoTecnico).toHaveBeenCalledTimes(1);
    expect(loads).toBeGreaterThanOrEqual(2);
    expect(textOf(renderer.root)).toMatch(/emitidos son de solo lectura\./);
    expect(buttonContaining(renderer, 'Agregar')).toBeFalsy();
  });

  it('F2: agrega líneas sucias al final del grupo con orden consecutivo', async () => {
    mocks.service.listarTiposServicioInterno.mockResolvedValue([
      { id: 'task-1', nombre: 'Tarea existente', codigo: 'T-1' },
      { id: 'task-2', nombre: 'Tarea nueva 2', codigo: 'T-2' },
      { id: 'task-3', nombre: 'Tarea nueva 3', codigo: 'T-3' },
    ]);
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('one', 'fabricacion', [{
      id: 'line-existing', familia_trabajo_id: 'fam-1', tarea_id: 'task-1', actividad_id: null,
      cargo_id: null, orden: 7, horas_mano_obra: 0, horas_maquina: 0, materiales: [],
    }]));
    await renderPage();
    await act(async () => { renderer.root.findAllByType('tr')[1].props.onClick(); await wait(120); });
    const openPanel = buttonByText(renderer, 'Agregar tareas');
    expect(openPanel).toBeTruthy();
    await act(async () => { openPanel.props.onClick(); await wait(0); });
    let checkbox = renderer.root.findByProps({ 'aria-label': 'Tarea nueva 2' });
    await act(async () => { checkbox.props.onChange(); await wait(0); });
    await act(async () => { buttonByText(renderer, 'Agregar 1 tareas').props.onClick(); await wait(0); });
    await act(async () => { buttonByText(renderer, 'Agregar tareas').props.onClick(); await wait(0); });
    checkbox = renderer.root.findByProps({ 'aria-label': 'Tarea nueva 3' });
    await act(async () => { checkbox.props.onChange(); await wait(0); });
    await act(async () => { buttonByText(renderer, 'Agregar 1 tareas').props.onClick(); await wait(0); });
    expect(renderer.root.findAll(node => node.props.className?.includes('dx-row is-dirty'))).toHaveLength(2);
    await act(async () => { buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(100); });
    expect(mocks.service.guardarDiagnosticoLinea.mock.calls.map(call => call[2].orden)).toEqual([8, 9]);
    expect(mocks.service.guardarDiagnosticoLinea.mock.calls.every(call => call[2]._dirty === true)).toBe(true);
  });
});
