import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: { empresaId: 'empresa-prueba', usuario: { id: 'usuario-prueba' }, estado: 'listo', permiteEscritura: true, error: '' },
  informePermission: vi.fn(),
  generateConclusion: vi.fn(),
  getDraft: vi.fn(),
  service: Object.fromEntries([
    'usuarioPuedeDiagnostico', 'listarDiagnosticosTecnicos', 'obtenerDiagnosticoTecnico', 'resolverReferenciasDiagnostico',
    'listarTecnicosDiagnostico', 'actualizarDatosInicialesDiagnostico', 'obtenerEquipoParaDiagnostico', 'listarCatalogoComponentesParaRecepcion',
    'listarReferenciasDiagnostico', 'listarFamiliasTrabajo', 'listarTiposServicioInterno', 'listarPlantillasActividad', 'listarUsoTareasPorEmpresa', 'listarCargosEmpresa',
    'listarActivosPropios', 'guardarDiagnosticoLinea', 'sincronizarMaterialesLinea', 'obtenerDiagnosticoLinea',
    'eliminarDiagnosticoLinea', 'crearDiagnosticoTecnico', 'buscarOCrearFamiliaTrabajo', 'buscarOCrearTipoServicioInterno',
    'listarCatalogosHallazgos', 'crearDiagnosticoHallazgo', 'actualizarDiagnosticoHallazgo', 'eliminarDiagnosticoHallazgo',
    'crearDiagnosticoMedicion', 'actualizarDiagnosticoMedicion', 'eliminarDiagnosticoMedicion',
    'crearEnlaceDiagnosticoHallazgoLinea', 'eliminarEnlaceDiagnosticoHallazgoLinea',
    'emitirDiagnosticoTecnico', 'reabrirDiagnosticoTecnico', 'listarHistorialEstadosDiagnostico',
    'listarComponentesDiagnostico', 'asignarComponenteCatalogoActivo', 'obtenerActivoRecepcionDiagnostico', 'guardarComponenteCatalogoHallazgo',
    'reemplazarZonasHallazgo', 'crearTipoDanoDiagnostico', 'usuarioPuedeEditarMaestros',
  ].map(name => [name, vi.fn()])),
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({ useSesionOperativa: () => mocks.session }));
vi.mock('../src/zahory-mock/components/shell.jsx', () => ({ Icon: () => null }));
vi.mock('../src/services/diagnosticoTecnicoService.js', () => mocks.service);
vi.mock('../src/services/diagnosticoInformeService.js', () => ({
  usuarioPuedeInforme: mocks.informePermission,
  generarConclusionIA: mocks.generateConclusion,
  obtenerOCrearBorrador: mocks.getDraft,
}));
vi.mock('../src/zahory-mock/pages/DiagnosticoInformePanel.jsx', () => ({
  DiagnosticoInformePanel: () => <div className="mock-report-panel" />,
}));

import { DiagnosticoTecnicoPage } from '../src/zahory-mock/pages/DiagnosticoTecnicoPage.jsx';

const detail = (id, tipo = 'mantenimiento', lineas = [], extra = {}) => ({
  id, tipo, estado: 'borrador', oportunidad_id: null, recepcion_id: `rac-${id}`, lineas, ...extra,
});
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
const listRows = () => renderer.root.findAll(node => node.props.className?.includes('dx-list-row'));
let renderer;
let documentListeners;

beforeEach(() => {
  mocks.session.empresaId = 'empresa-prueba';
  mocks.session.estado = 'listo';
  mocks.session.permiteEscritura = true;
  mocks.informePermission.mockResolvedValue(true);
  const listeners = new Map();
  globalThis.window = {
    setTimeout, clearTimeout, requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame: vi.fn(),
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name), dispatchEvent: event => listeners.get(event.type)?.(event),
  };
  documentListeners = new Map();
  globalThis.document = {
    documentElement: { dataset: {} },
    addEventListener: (name, listener) => { const set = documentListeners.get(name) || new Set(); set.add(listener); documentListeners.set(name, set); },
    removeEventListener: (name, listener) => documentListeners.get(name)?.delete(listener),
    dispatchEvent: event => documentListeners.get(event.type)?.forEach(listener => listener(event)),
  };
  Object.values(mocks.service).forEach(mock => mock.mockReset());
  mocks.service.usuarioPuedeDiagnostico.mockResolvedValue(true);
  mocks.service.listarDiagnosticosTecnicos.mockResolvedValue([
    { id: 'mant', tipo: 'mantenimiento', estado: 'borrador', oportunidad_id: null, recepcion_id: 'rac-mant', updated_at: null },
  ]);
  mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('mant'));
  mocks.service.resolverReferenciasDiagnostico.mockImplementation(async (_empresa, _tipo, ids) => ids.map(id => ({ id, numero: id, cliente: 'Cliente', activo: 'Equipo' })));
  mocks.service.listarReferenciasDiagnostico.mockResolvedValue([]);
  mocks.service.listarFamiliasTrabajo.mockResolvedValue([{ id: 'fam-1', nombre: 'Trabajo vacío' }, { id: 'fam-2', nombre: 'Trabajo con tarea' }]);
  mocks.service.listarTiposServicioInterno.mockResolvedValue([
    { id: 'activity-1', nombre: 'Actividad 1', rol: 'actividad', familia_trabajo_id: 'fam-1' },
    { id: 'task-1', nombre: 'Tarea 1', rol: 'tarea' },
  ]);
  mocks.service.listarPlantillasActividad.mockResolvedValue([]);
  mocks.service.listarUsoTareasPorEmpresa.mockResolvedValue({});
  mocks.service.listarCargosEmpresa.mockResolvedValue([]);
  mocks.service.listarActivosPropios.mockResolvedValue([]);
  mocks.service.listarCatalogosHallazgos.mockResolvedValue([]);
  mocks.service.listarComponentesDiagnostico.mockResolvedValue([]);
  mocks.service.listarTecnicosDiagnostico.mockResolvedValue([{ id: 'tec-1', nombre: 'Técnico' }]);
  mocks.service.actualizarDatosInicialesDiagnostico.mockImplementation(async (_empresa, _id, datos) => datos);
  mocks.service.obtenerEquipoParaDiagnostico.mockResolvedValue({ activo: { id: 'asset-1', tipo_activo: 'maquinaria_completa' }, componente: null, observaciones: '' });
  mocks.service.listarCatalogoComponentesParaRecepcion.mockResolvedValue([]);
  mocks.service.usuarioPuedeEditarMaestros.mockResolvedValue(false);
  mocks.service.listarHistorialEstadosDiagnostico.mockResolvedValue([]);
  mocks.service.emitirDiagnosticoTecnico.mockResolvedValue({ estado: 'emitido' });
  mocks.service.reabrirDiagnosticoTecnico.mockResolvedValue({ estado: 'borrador' });
  mocks.service.guardarDiagnosticoLinea.mockImplementation(async (_empresa, _diagnostico, line) => ({ id: line.id || line._key || 'line-new' }));
  mocks.service.sincronizarMaterialesLinea.mockResolvedValue(undefined);
  mocks.service.obtenerDiagnosticoLinea.mockResolvedValue({ id: 'line-new', materiales: [] });
});

afterEach(() => {
  renderer?.unmount();
  renderer = null;
});

async function renderPage() {
  await act(async () => { renderer = create(<DiagnosticoTecnicoPage />); await wait(0); await wait(0); });
  await waitFor(() => listRows()[0]);
  await act(async () => { listRows()[0].props.onClick(); await wait(120); });
  await waitFor(() => renderer.root.findAllByProps({ className: 'dx-work-steps' })[0]);
  await goToWorkStep(5);
}
async function goToWorkStep(step) {
  const steps = renderer.root.findAllByProps({ className: 'dx-work-steps' });
  if (!steps.length) return;
  await act(async () => { await steps[0].findAllByType('button')[step - 1].props.onClick(); await wait(0); });
}
async function addEmptyFamily(familyId = 'fam-1') {
  const hallazgosPanel = renderer.root.findAll(node => typeof node.props.onExtraFamilyIdsChange === 'function')[0];
  if (!hallazgosPanel) throw new Error('No se encontró el callback del panel de hallazgos para agregar un trabajo vacío al fixture');
  await act(async () => { hallazgosPanel.props.onExtraFamilyIdsChange([familyId]); await wait(0); });
}

describe('Diagnóstico técnico — paso 5, Trabajos a realizar', () => {
  it('bloquea el avance con un trabajo vacío, muestra el error y marca el grupo incompleto', async () => {
    await renderPage();
    await addEmptyFamily();
    await act(async () => { await buttonByText(renderer, 'Siguiente: Diagnóstico e informe').props.onClick(); await wait(0); });
    expect(renderer.root.findAllByProps({ className: 'mock-report-panel' })).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Hay trabajos sin actividades ni tareas: Trabajo vacío. Agrega una actividad o quita el trabajo para continuar.');
    expect(renderer.root.findAll(node => node.props.className?.includes('dx-work-family-group is-incomplete'))).toHaveLength(1);
  });

  it('avanza al informe cuando todos los trabajos tienen tareas', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('mant', 'mantenimiento', [
      { id: 'line-1', familia_trabajo_id: 'fam-2', actividad_id: 'activity-1', tarea_id: 'task-1', materiales: [] },
    ]));
    await renderPage();
    await act(async () => { await buttonByText(renderer, 'Siguiente: Diagnóstico e informe').props.onClick(); await wait(30); });
    expect(renderer.root.findAllByProps({ className: 'mock-report-panel' })).toHaveLength(1);
  });

  it('quita directamente un trabajo vacío', async () => {
    await renderPage();
    await addEmptyFamily();
    const remove = renderer.root.findByProps({ 'aria-label': 'Quitar trabajo Trabajo vacío' });
    await act(async () => { remove.props.onClick(); await wait(0); });
    expect(renderer.root.findAll(node => node.props.className?.includes('dx-work-family-group'))).toHaveLength(0);
    expect(textOf(renderer.root)).toContain('Trabajo "Trabajo vacío" quitado. Guarda para aplicar los cambios.');
    expect(mocks.service.eliminarDiagnosticoLinea).not.toHaveBeenCalled();
  });

  it('pide confirmar para quitar un trabajo con tareas y encola el borrado hasta Guardar todo', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('mant', 'mantenimiento', [
      { id: 'line-1', familia_trabajo_id: 'fam-2', actividad_id: 'activity-1', tarea_id: 'task-1', materiales: [] },
    ]));
    await renderPage();
    await act(async () => { renderer.root.findByProps({ 'aria-label': 'Quitar trabajo Trabajo con tarea' }).props.onClick(); await wait(0); });
    expect(renderer.root.findAllByProps({ className: 'dx-work-delete-confirm' })).toHaveLength(1);
    expect(buttonByText(renderer, 'Confirmar')).toBeTruthy();
    expect(mocks.service.eliminarDiagnosticoLinea).not.toHaveBeenCalled();
    await act(async () => { buttonByText(renderer, 'Confirmar').props.onClick(); await wait(0); });
    expect(renderer.root.findAll(node => node.props.className?.includes('dx-work-family-group'))).toHaveLength(0);
    expect(mocks.service.eliminarDiagnosticoLinea).not.toHaveBeenCalled();
    expect(textOf(buttonByText(renderer, 'Guardar todo'))).toContain('Guardar todo');
    await act(async () => { await buttonByText(renderer, 'Guardar todo').props.onClick(); await wait(30); });
    expect(mocks.service.eliminarDiagnosticoLinea).toHaveBeenCalledWith('empresa-prueba', 'mant', 'line-1');
  });

  it('deshabilita la papelera y muestra la nota si un hallazgo usa el trabajo', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue(detail('mant', 'mantenimiento', [], {
      hallazgos: [{ id: 'hallazgo-1', familia_trabajo_id: 'fam-1', mediciones: [], lineas: [] }],
    }));
    await renderPage();
    const remove = renderer.root.findByProps({ 'aria-label': 'Quitar trabajo Trabajo vacío' });
    expect(remove.props.disabled).toBe(true);
    expect(renderer.root.findAllByProps({ className: 'dx-work-delete-locked-note' })).toHaveLength(1);
  });

  it('en solo lectura no muestra papelera ni bloquea el avance por trabajo vacío', async () => {
    mocks.service.obtenerDiagnosticoTecnico.mockResolvedValue({ ...detail('mant', 'mantenimiento', [], { estado: 'emitido' }) });
    await renderPage();
    expect(renderer.root.findAll(node => node.props.className === 'dx-work-delete-button')).toHaveLength(0);
    await goToWorkStep(6);
    expect(renderer.root.findAllByProps({ className: 'mock-report-panel' })).toHaveLength(1);
    expect(textOf(renderer.root)).not.toContain('Hay trabajos sin actividades ni tareas:');
  });
});
