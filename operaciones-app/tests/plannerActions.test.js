import { act, create } from 'react-test-renderer';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlannerPage } from '../src/zahory-mock/pages/planner/PlannerPage.jsx';
import { PlannerHeader } from '../src/zahory-mock/pages/planner/PlannerShell.jsx';
import { Configurator } from '../src/zahory-mock/pages/planner/Configurator.jsx';
import { usePlannerActions } from '../src/zahory-mock/pages/planner/usePlannerActions.js';
import { sincronizarOcupacionesOT } from '../src/services/plannerService.js';

const sesionMock = vi.hoisted(() => ({
  empresaId: 'E-1',
  sociedadId: null,
  permiteEscritura: false,
  vistaConsolidada: true,
  cargando: true,
}));

vi.mock('../src/services/plannerService.js', async importOriginal => ({
  ...await importOriginal(),
  sincronizarOcupacionesOT: vi.fn().mockResolvedValue(undefined),
  guardarPuesto: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/sesionOperativa.js', () => ({
  useSesionOperativa: () => sesionMock,
}));

describe('Planner en vista consolidada', () => {
  it('muestra el aviso y deshabilita las acciones para escribir', () => {
    Object.assign(sesionMock, { cargando: false, empresaId: 'E-1' });
    const pagina = renderToStaticMarkup(createElement(PlannerPage));
    expect(pagina).toContain(
      'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
    );
    expect(pagina).toContain('role="status"');
    expect(pagina).toContain('dx-planner-notice is-warning');
    const cabecera = renderToStaticMarkup(createElement(PlannerHeader, {
      vista: 'panel',
      permiteEscritura: false,
      onChangeVista: vi.fn(),
      onSimulate: vi.fn(),
      onPlanificar: vi.fn(),
    }));
    expect(cabecera.match(/disabled=""/g).length).toBeGreaterThanOrEqual(3);
    const configurador = renderToStaticMarkup(createElement(Configurator, {
      datos: { bahias: [{ id: 'b1', codigo: 'B1', nombre: 'Bahía 1', categoria: 'general' }], puestos: [], maquinas: [], tipos: [] },
      permiteEscritura: false,
      busy: false,
      onGuardar: vi.fn(),
      onCancel: vi.fn(),
    }));
    expect(configurador).toContain('<input disabled=""');
    expect(configurador).toContain('<select disabled=""');
    expect(configurador).toMatch(/<button type="button" class="dx-pl-btn is-pri" disabled="">Guardar<\/button>/);
  });

  it('oculta el aviso consolidado mientras carga o no hay empresa activa', async () => {
    Object.assign(sesionMock, { cargando: true, empresaId: 'E-1' });
    expect(renderToStaticMarkup(createElement(PlannerPage))).not.toContain(
      'Elige una sociedad concreta (no la vista consolidada)',
    );
    Object.assign(sesionMock, { cargando: false, empresaId: null });
    expect(renderToStaticMarkup(createElement(PlannerPage))).not.toContain(
      'Elige una sociedad concreta (no la vista consolidada)',
    );
    let pagina;
    await act(async () => { pagina = create(createElement(PlannerPage)); });
    const alertas = pagina.root.findAll(node => node.props.className === 'dx-planner-error');
    expect(alertas.length).toBe(1);
    expect(alertas[0].children.join('')).toContain('No hay una empresa activa');
    expect(pagina.root.findAll(node => node.props.className === 'dx-planner-notice is-warning'))
      .toHaveLength(0);
    pagina.unmount();
    Object.assign(sesionMock, { cargando: true, empresaId: 'E-1' });
  });

  it('bloquea GRUPO y deja visible el aviso al guardar desde el asistente', async () => {
    const setters = Object.fromEntries([
      'setGuardando', 'setError', 'setAviso', 'setUndo', 'setWizard', 'setVista',
      'setSeleccion', 'setSimulacion',
    ].map(nombre => [nombre, vi.fn()]));
    const captura = {};
    function PruebaHook() {
      captura.acciones = usePlannerActions({
        sesion: { empresaId: 'E-1', sociedadId: null, permiteEscritura: false },
        datos: { ots: [] },
        ots: [],
        recursos: {},
        undo: null,
        seleccion: {},
        simulacion: null,
        cargar: vi.fn().mockResolvedValue(undefined),
        ...setters,
      });
      return null;
    }
    let renderer;
    await act(async () => {
      renderer = create(createElement(PruebaHook));
    });
    await act(async () => {
      await expect(captura.acciones.guardarConfig('puesto', {})).resolves.toBe(false);
    });
    expect(setters.setError).toHaveBeenLastCalledWith(
      'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
    );
    await act(async () => {
      await expect(captura.acciones.guardarWizard({ ot: { id: 'OT-1' }, taskPlans: [] }))
        .resolves.toBe(false);
    });
    expect(setters.setError).toHaveBeenLastCalledWith(
      'Elige una sociedad concreta (no la vista consolidada) para configurar o planificar el taller.',
    );
    renderer.unmount();
  });
});

describe('resultado de acciones del Planner', () => {
  function montarHook({ ots = [], simulacion = null } = {}) {
    const captura = {};
    function PruebaHook() {
      const [wizard, setWizard] = useState({ ot: { id: 'OT-1' } });
      const [vista, setVista] = useState('tablero');
      const [seleccion, setSeleccion] = useState({});
      const [simActual, setSimulacion] = useState(simulacion);
      const setError = vi.fn();
      captura.acciones = usePlannerActions({
        sesion: { empresaId: 'E-1', sociedadId: 'S-1', permiteEscritura: true },
        datos: { ots, asignaciones: [], equipos: [] },
        ots,
        recursos: { personas: 1, maquinas: 1 },
        undo: null,
        seleccion: {},
        simulacion: simActual,
        cargar: vi.fn().mockResolvedValue(undefined),
        setGuardando: vi.fn(),
        setError,
        setAviso: vi.fn(),
        setUndo: vi.fn(),
        setWizard,
        setVista,
        setSeleccion,
        setSimulacion,
      });
      captura.estado = { wizard, vista, seleccion, simulacion: simActual };
      captura.setError = setError;
      return createElement('span', null, wizard ? 'Wizard abierto' : 'Wizard cerrado');
    }
    let renderer;
    act(() => { renderer = create(createElement(PruebaHook)); });
    return { captura, renderer };
  }

  const taskPlans = [{
    horasPendientes: 1,
    tarea: { id: 'T-1', titulo: 'Trabajo' },
    assignment: { personaIds: ['P-1'], maquinaIds: [] },
    p50: { fechas: [] },
  }];

  it('mantiene abierto el asistente si guardarWizard falla y lo cierra si tiene éxito', async () => {
    const { captura, renderer } = montarHook();
    sincronizarOcupacionesOT.mockRejectedValueOnce(new Error('falló el guardado'));
    await act(async () => {
      await expect(captura.acciones.guardarWizard({
        ot: { id: 'OT-1' }, taskPlans,
      })).resolves.toBe(false);
    });
    expect(renderer.root.findByType('span').children).toEqual(['Wizard abierto']);
    expect(captura.setError).toHaveBeenLastCalledWith('falló el guardado');

    sincronizarOcupacionesOT.mockResolvedValue(undefined);
    await act(async () => {
      await expect(captura.acciones.guardarWizard({
        ot: { id: 'OT-1' }, taskPlans,
      })).resolves.toBe(true);
    });
    expect(renderer.root.findByType('span').children).toEqual(['Wizard cerrado']);
    expect(captura.estado.vista).toBe('panel');
    renderer.unmount();
  });

  it('conserva la vista y simulación si falla aplicarSimulacion; avanza si tiene éxito', async () => {
    const simulacion = {
      urgente: { id: 'OT-1' },
      resultado: { esperaDias: 2 },
    };
    const { captura } = montarHook({ ots: [{ id: 'OT-1' }], simulacion });
    sincronizarOcupacionesOT.mockRejectedValueOnce(new Error('falló la aplicación'));
    await act(async () => {
      await expect(captura.acciones.aplicarSimulacion()).resolves.toBe(false);
    });
    expect(captura.estado.vista).toBe('tablero');
    expect(captura.estado.simulacion).toEqual(simulacion);
    expect(captura.setError).toHaveBeenLastCalledWith('falló la aplicación');

    sincronizarOcupacionesOT.mockResolvedValue(undefined);
    await act(async () => {
      await expect(captura.acciones.aplicarSimulacion()).resolves.toBe(true);
    });
    expect(captura.estado.vista).toBe('panel');
    expect(captura.estado.simulacion).toBe(null);
  });
});

describe('aviso del Planner', () => {
  it('se limpia al cambiar de vista y se oculta tras cinco segundos', async () => {
    vi.useFakeTimers();
    const captura = {};
    function PruebaHook() {
      const [aviso, setAviso] = useState('');
      captura.acciones = usePlannerActions({
        sesion: { empresaId: 'E-1', sociedadId: 'S-1', permiteEscritura: true },
        aviso,
        datos: { ots: [] }, ots: [], recursos: {}, undo: null, seleccion: {}, simulacion: null,
        cargar: vi.fn().mockResolvedValue(undefined), setGuardando: vi.fn(), setError: vi.fn(),
        setAviso, setUndo: vi.fn(), setWizard: vi.fn(), setVista: vi.fn(),
        setSeleccion: vi.fn(), setSimulacion: vi.fn(),
      });
      return createElement('span', null, aviso);
    }
    let renderer;
    await act(async () => { renderer = create(createElement(PruebaHook)); });
    await act(async () => {
      await captura.acciones.guardarConfig('puesto', { nombre: 'Puesto' });
    });
    expect(renderer.root.findByType('span').children).toEqual(['Configuración guardada.']);
    act(() => captura.acciones.cambiarVista('tablero'));
    expect(renderer.root.findByType('span').children).toEqual([]);
    await act(async () => {
      await captura.acciones.guardarConfig('puesto', { nombre: 'Puesto' });
    });
    expect(renderer.root.findByType('span').children).toEqual(['Configuración guardada.']);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(renderer.root.findByType('span').children).toEqual([]);
    await act(async () => {
      await captura.acciones.guardarConfig('puesto', { nombre: 'Puesto' });
    });
    act(() => captura.acciones.abrirWizard(null));
    expect(renderer.root.findByType('span').children).toEqual([]);
    await act(async () => {
      await captura.acciones.guardarConfig('puesto', { nombre: 'Puesto' });
    });
    act(() => captura.acciones.simular());
    expect(renderer.root.findByType('span').children).toEqual([]);
    renderer.unmount();
    vi.useRealTimers();
  });
});

describe('categoría de bahía', () => {
  it('conserva la categoría elegida al guardar una bahía nueva del borrador', async () => {
    const onGuardar = vi.fn();
    const datos = { bahias: [], puestos: [], maquinas: [], tipos: [] };
    let renderer;
    await act(async () => {
      renderer = create(createElement(Configurator, {
        datos,
        permiteEscritura: true,
        busy: false,
        onGuardar,
        onCancel: vi.fn(),
      }));
    });
    const agregar = renderer.root.findAll(node => node.type === 'button' && node.children.join('') === '+ Agregar bahía')[0];
    await act(async () => agregar.props.onClick());
    const categoria = renderer.root.findAllByType('select')[0];
    await act(async () => categoria.props.onChange({ target: { value: 'mec' } }));
    const guardar = renderer.root.findAll(node => node.type === 'button' && node.children.join('') === 'Guardar')[0];
    await act(async () => guardar.props.onClick());
    expect(onGuardar).toHaveBeenCalledTimes(1);
    const diferencias = onGuardar.mock.calls[0][0];
    expect(diferencias.bahiasNuevas).toHaveLength(1);
    expect(diferencias.bahiasNuevas[0]).toMatchObject({ nombre: 'Bahía 1', categoria: 'mec', codigo: 'B1' });
    renderer.unmount();
  });
});
